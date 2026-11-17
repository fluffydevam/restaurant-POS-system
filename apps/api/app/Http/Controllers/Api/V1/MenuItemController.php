<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MenuItemResource;
use App\Models\MenuItem;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class MenuItemController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'category_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:100'],
            'active' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $items = MenuItem::query()
            ->with('category')
            ->when(
                isset($validated['category_id']),
                fn ($query) => $query->where('menu_category_id', $validated['category_id'])
            )
            ->when(
                isset($validated['active']),
                fn ($query) => $query->where('is_active', (bool) $validated['active'])
            )
            ->when(
                filled($validated['search'] ?? null),
                function ($query) use ($validated) {
                    $term = '%'.mb_strtolower(trim($validated['search'])).'%';

                    $query->where(function ($inner) use ($term) {
                        $inner->whereRaw('lower(name) like ?', [$term])
                            ->orWhereRaw('lower(coalesce(description, \'\')) like ?', [$term])
                            ->orWhereRaw('lower(coalesce(sku, \'\')) like ?', [$term]);
                    });
                }
            )
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate((int) ($validated['per_page'] ?? 50))
            ->withQueryString();

        return MenuItemResource::collection($items);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $item = MenuItem::create($validated);

        return response()->json([
            'message' => $item->name.' was added to the menu.',
            'item' => new MenuItemResource($item->load('category')),
        ], 201);
    }

    public function update(Request $request, int $item): JsonResponse
    {
        $item = MenuItem::findOrFail($item);
        $validated = $request->validate($this->rules(updating: true));

        $item->update($validated);

        return response()->json([
            'message' => $item->name.' was updated.',
            'item' => new MenuItemResource($item->load('category')),
        ]);
    }

    public function destroy(int $item): JsonResponse
    {
        $item = MenuItem::findOrFail($item);
        $name = $item->name;
        $item->delete();

        return response()->json(['message' => $name.' was removed from the menu.']);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    private function rules(bool $updating = false): array
    {
        $required = $updating ? 'sometimes' : 'required';
        $tenantId = app(TenantContext::class)->id();

        return [
            'menu_category_id' => [
                'nullable',
                Rule::exists('menu_categories', 'id')->where('tenant_id', $tenantId),
            ],
            'name' => [$required, 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'sku' => ['nullable', 'string', 'max:64'],
            'price_cents' => [$required, 'integer', 'min:0', 'max:100000000'],
            'image_url' => ['nullable', 'url', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['nullable', 'boolean'],
            'is_available' => ['nullable', 'boolean'],
        ];
    }
}
