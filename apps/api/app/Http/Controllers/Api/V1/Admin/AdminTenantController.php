<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\TenantStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminTenantResource;
use App\Models\Branch;
use App\Models\Scopes\TenantScope;
use App\Models\Tenant;
use App\Notifications\TenantStatusChanged;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Throwable;

class AdminTenantController extends Controller
{
    public function stats(): JsonResponse
    {
        $counts = DB::table('tenants')
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'total' => Tenant::count(),
            'pending' => (int) ($counts[TenantStatus::PendingApproval->value] ?? 0),
            'active' => (int) ($counts[TenantStatus::Active->value] ?? 0),
            'suspended' => (int) ($counts[TenantStatus::Suspended->value] ?? 0),
            'cancelled' => (int) ($counts[TenantStatus::Cancelled->value] ?? 0),
        ]);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'status' => ['nullable', 'in:pending_approval,active,suspended,cancelled'],
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $query = Tenant::query()
            ->with(['memberships' => fn ($membership) => $membership->where('role', 'owner')->with('user')])
            ->withCount(['branches' => fn ($branch) => $branch->withoutGlobalScope(TenantScope::class)])
            ->when(
                isset($validated['status']),
                fn ($builder) => $builder->where('status', $validated['status'])
            )
            ->when(
                filled($validated['search'] ?? null),
                function ($builder) use ($validated) {
                    $term = '%'.mb_strtolower(trim($validated['search'])).'%';

                    $builder->where(function ($inner) use ($term) {
                        $inner->whereRaw('lower(name) like ?', [$term])
                            ->orWhereRaw('lower(slug) like ?', [$term])
                            ->orWhereHas('memberships.user', fn ($user) => $user->whereRaw('lower(email) like ?', [$term]));
                    });
                }
            )
            ->orderByRaw("case when status = 'pending_approval' then 0 else 1 end")
            ->latest();

        return AdminTenantResource::collection($query->paginate(15)->withQueryString());
    }

    public function approve(Tenant $tenant): JsonResponse
    {
        if ($tenant->status === TenantStatus::Active) {
            return response()->json([
                'message' => 'This restaurant is already active.',
                'tenant' => $this->present($tenant),
            ]);
        }

        DB::transaction(function () use ($tenant) {
            app(TenantContext::class)->set($tenant);

            $tenant->update([
                'status' => TenantStatus::Active,
                'approved_at' => $tenant->approved_at ?? now(),
                'suspended_reason' => null,
            ]);

            $hasBranch = Branch::withoutGlobalScope(TenantScope::class)
                ->where('tenant_id', $tenant->id)
                ->exists();

            if (! $hasBranch) {
                Branch::create([
                    'tenant_id' => $tenant->id,
                    'name' => 'Main Branch',
                    'timezone' => $tenant->timezone,
                    'is_default' => true,
                    'is_active' => true,
                ]);
            }
        });

        $this->notifyOwner($tenant, TenantStatusChanged::APPROVED);

        return response()->json([
            'message' => $tenant->name.' is now active.',
            'tenant' => $this->present($tenant->refresh()),
        ]);
    }

    public function suspend(Request $request, Tenant $tenant): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($tenant->status === TenantStatus::Suspended) {
            return response()->json([
                'message' => 'This restaurant is already suspended.',
                'tenant' => $this->present($tenant),
            ]);
        }

        $tenant->update([
            'status' => TenantStatus::Suspended,
            'suspended_reason' => $validated['reason'] ?? null,
        ]);

        $this->notifyOwner($tenant, TenantStatusChanged::SUSPENDED, $validated['reason'] ?? null);

        return response()->json([
            'message' => $tenant->name.' has been suspended.',
            'tenant' => $this->present($tenant->refresh()),
        ]);
    }

    public function reactivate(Tenant $tenant): JsonResponse
    {
        if ($tenant->status === TenantStatus::Active) {
            return response()->json([
                'message' => 'This restaurant is already active.',
                'tenant' => $this->present($tenant),
            ]);
        }

        $tenant->update([
            'status' => TenantStatus::Active,
            'approved_at' => $tenant->approved_at ?? now(),
            'suspended_reason' => null,
        ]);

        $this->notifyOwner($tenant, TenantStatusChanged::REACTIVATED);

        return response()->json([
            'message' => $tenant->name.' is active again.',
            'tenant' => $this->present($tenant->refresh()),
        ]);
    }

    private function present(Tenant $tenant): AdminTenantResource
    {
        $tenant->load(['memberships' => fn ($membership) => $membership->where('role', 'owner')->with('user')]);

        $tenant->branches_count = Branch::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->count();

        return new AdminTenantResource($tenant);
    }

    private function notifyOwner(Tenant $tenant, string $outcome, ?string $reason = null): void
    {
        $owner = $tenant->memberships()
            ->where('role', 'owner')
            ->with('user')
            ->first()
            ?->user;

        if (! $owner || ! $owner->email) {
            return;
        }

        try {
            $owner->notify(new TenantStatusChanged($tenant, $outcome, $reason));
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
