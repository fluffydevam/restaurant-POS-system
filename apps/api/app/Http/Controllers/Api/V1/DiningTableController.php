<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\TableStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\DiningTableResource;
use App\Models\Branch;
use App\Models\DiningTable;
use App\Support\TenantContext;
use App\Support\TenantLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DiningTableController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer'],
            'status' => ['nullable', Rule::in(TableStatus::values())],
            'search' => ['nullable', 'string', 'max:60'],
        ]);

        $tables = DiningTable::query()
            ->with('branch')
            ->when(
                isset($validated['branch_id']),
                fn ($query) => $query->where('branch_id', $validated['branch_id'])
            )
            ->when(
                isset($validated['status']),
                fn ($query) => $query->where('status', $validated['status'])
            )
            ->when(
                filled($validated['search'] ?? null),
                fn ($query) => $query->whereRaw('lower(name) like ?', [
                    '%'.mb_strtolower(trim($validated['search'])).'%',
                ])
            )
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return DiningTableResource::collection($tables)
            ->additional(['meta' => ['limits' => TenantLimits::usage()]]);
    }

    public function store(Request $request): JsonResponse
    {
        TenantLimits::ensure('tables');

        $validated = $request->validate($this->rules());
        $branchId = $this->resolveBranchId($validated['branch_id'] ?? null);

        $this->assertNameIsFree($validated['name'], $branchId);

        $table = DiningTable::create([
            ...$validated,
            'branch_id' => $branchId,
            'status' => $validated['status'] ?? TableStatus::Available->value,
        ]);

        return response()->json([
            'message' => $table->name.' was added to the floor.',
            'table' => new DiningTableResource($table->load('branch')),
            'meta' => ['limits' => TenantLimits::usage()],
        ], 201);
    }

    public function update(Request $request, int $table): JsonResponse
    {
        $table = DiningTable::findOrFail($table);
        $validated = $request->validate($this->rules(updating: true));

        $branchId = array_key_exists('branch_id', $validated)
            ? $this->resolveBranchId($validated['branch_id'])
            : $table->branch_id;

        $this->assertNameIsFree($validated['name'] ?? $table->name, $branchId, $table->id);

        $table->update([...$validated, 'branch_id' => $branchId]);

        return response()->json([
            'message' => $table->name.' was updated.',
            'table' => new DiningTableResource($table->load('branch')),
        ]);
    }

    public function status(Request $request, int $table): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(TableStatus::values())],
        ]);

        $table = DiningTable::findOrFail($table);
        $table->update(['status' => $validated['status']]);

        return response()->json([
            'message' => $table->name.' is now '.$table->status->label().'.',
            'table' => new DiningTableResource($table->load('branch')),
        ]);
    }

    public function destroy(int $table): JsonResponse
    {
        $table = DiningTable::findOrFail($table);
        $name = $table->name;
        $table->delete();

        return response()->json([
            'message' => $name.' was removed from the floor.',
            'meta' => ['limits' => TenantLimits::usage()],
        ]);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    private function rules(bool $updating = false): array
    {
        $required = $updating ? 'sometimes' : 'required';
        $tenantId = app(TenantContext::class)->id();

        return [
            'branch_id' => [
                'nullable',
                Rule::exists('branches', 'id')->where('tenant_id', $tenantId),
            ],
            'name' => [$required, 'string', 'max:60'],
            'zone' => ['nullable', 'string', 'max:60'],
            'seats' => ['sometimes', 'integer', 'min:1', 'max:99'],
            'status' => ['sometimes', Rule::in(TableStatus::values())],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    private function resolveBranchId(?int $branchId): ?int
    {
        if ($branchId) {
            return $branchId;
        }

        return Branch::query()->where('is_default', true)->value('id')
            ?? Branch::query()->orderBy('id')->value('id');
    }

    private function assertNameIsFree(string $name, ?int $branchId, ?int $ignoreId = null): void
    {
        $exists = DiningTable::query()
            ->where('name', $name)
            ->when(
                $branchId,
                fn ($query) => $query->where('branch_id', $branchId),
                fn ($query) => $query->whereNull('branch_id')
            )
            ->when($ignoreId, fn ($query) => $query->whereKeyNot($ignoreId))
            ->exists();

        if ($exists) {
            throw ValidationException::withMessages([
                'name' => 'A table named "'.$name.'" already exists in this branch.',
            ]);
        }
    }
}
