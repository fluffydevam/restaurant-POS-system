<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\StaffMemberResource;
use App\Models\Membership;
use App\Models\User;
use App\Support\TenantContext;
use App\Support\TenantLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StaffController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'role' => ['nullable', Rule::in(['owner', 'manager', 'staff'])],
            'active' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        $tenantId = app(TenantContext::class)->id();

        $staff = Membership::query()
            ->where('tenant_id', $tenantId)
            ->with(['user', 'branch'])
            ->when(
                isset($validated['role']),
                fn ($query) => $query->where('role', $validated['role'])
            )
            ->when(
                isset($validated['active']),
                fn ($query) => $query->where('is_active', (bool) $validated['active'])
            )
            ->when(
                filled($validated['search'] ?? null),
                function ($query) use ($validated) {
                    $term = '%'.mb_strtolower(trim($validated['search'])).'%';

                    $query->whereHas('user', function ($inner) use ($term) {
                        $inner->whereRaw('lower(name) like ?', [$term])
                            ->orWhereRaw('lower(email) like ?', [$term]);
                    });
                }
            )
            ->orderByRaw("case role when 'owner' then 0 when 'manager' then 1 else 2 end")
            ->orderBy('id')
            ->get();

        return StaffMemberResource::collection($staff)
            ->additional(['meta' => ['limits' => TenantLimits::usage()]]);
    }

    public function store(Request $request): JsonResponse
    {
        TenantLimits::ensure('staff');

        $request->merge(['email' => mb_strtolower((string) $request->input('email'))]);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:100'],
            'role' => ['required', Rule::in(['owner', 'manager', 'staff'])],
            'branch_id' => $this->branchRule(),
        ]);

        /** @var Membership $actor */
        $actor = $request->attributes->get('membership');

        if ($actor->role !== 'owner' && $validated['role'] !== 'staff') {
            return $this->forbidden('Only owners can add managers or other owners.');
        }

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ]);
        $user->markEmailAsVerified();

        $membership = Membership::create([
            'tenant_id' => app(TenantContext::class)->id(),
            'user_id' => $user->id,
            'branch_id' => $validated['branch_id'] ?? null,
            'role' => $validated['role'],
            'is_active' => true,
        ]);

        return response()->json([
            'message' => $user->name.' was added to the team.',
            'staff' => new StaffMemberResource($membership->load(['user', 'branch'])),
            'meta' => ['limits' => TenantLimits::usage()],
        ], 201);
    }

    public function update(Request $request, int $membership): JsonResponse
    {
        $target = $this->findMembership($membership);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'role' => ['sometimes', Rule::in(['owner', 'manager', 'staff'])],
            'is_active' => ['sometimes', 'boolean'],
            'branch_id' => $this->branchRule(),
        ]);

        /** @var Membership $actor */
        $actor = $request->attributes->get('membership');

        if ($target->user_id === $request->user()->id
            && (isset($validated['role']) && $validated['role'] !== $target->role
                || array_key_exists('is_active', $validated) && ! $validated['is_active'])) {
            return $this->forbidden('You cannot change your own role or deactivate yourself.');
        }

        if ($actor->role !== 'owner') {
            if ($target->role !== 'staff') {
                return $this->forbidden('Managers can only manage staff accounts.');
            }

            if (isset($validated['role']) && $validated['role'] !== 'staff') {
                return $this->forbidden('Managers cannot promote staff to manager or owner.');
            }
        }

        $demotingOwner = $target->role === 'owner'
            && (isset($validated['role']) && $validated['role'] !== 'owner'
                || array_key_exists('is_active', $validated) && ! $validated['is_active']);

        if ($demotingOwner) {
            $this->assertNotLastOwner($target);
        }

        if (array_key_exists('name', $validated)) {
            $target->user->update(['name' => $validated['name']]);
        }

        $target->update(collect($validated)->only(['role', 'is_active', 'branch_id'])->all());

        return response()->json([
            'message' => $target->user->name.' was updated.',
            'staff' => new StaffMemberResource($target->load(['user', 'branch'])),
        ]);
    }

    public function destroy(Request $request, int $membership): JsonResponse
    {
        $target = $this->findMembership($membership);

        if ($target->user_id === $request->user()->id) {
            return $this->forbidden('You cannot remove your own account from the restaurant.');
        }

        /** @var Membership $actor */
        $actor = $request->attributes->get('membership');

        if ($actor->role !== 'owner' && $target->role !== 'staff') {
            return $this->forbidden('Managers can only remove staff accounts.');
        }

        if ($target->role === 'owner' && $target->is_active) {
            $this->assertNotLastOwner($target);
        }

        $name = $target->user->name;
        $target->delete();

        return response()->json([
            'message' => $name.' was removed from the team.',
            'meta' => ['limits' => TenantLimits::usage()],
        ]);
    }

    private function findMembership(int $id): Membership
    {
        $tenantId = app(TenantContext::class)->id();

        return Membership::query()
            ->where('tenant_id', $tenantId)
            ->with(['user', 'branch'])
            ->findOrFail($id);
    }

    /**
     * @return array<int, mixed>
     */
    private function branchRule(): array
    {
        $tenantId = app(TenantContext::class)->id();

        return [
            'nullable',
            Rule::exists('branches', 'id')->where('tenant_id', $tenantId),
        ];
    }

    private function assertNotLastOwner(Membership $target): void
    {
        $otherOwners = Membership::query()
            ->where('tenant_id', $target->tenant_id)
            ->where('role', 'owner')
            ->where('is_active', true)
            ->whereKeyNot($target->id)
            ->exists();

        if (! $otherOwners) {
            throw ValidationException::withMessages([
                'role' => 'Your restaurant needs at least one active owner.',
            ]);
        }
    }

    private function forbidden(string $message): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'code' => 'role_forbidden',
        ], 403);
    }
}
