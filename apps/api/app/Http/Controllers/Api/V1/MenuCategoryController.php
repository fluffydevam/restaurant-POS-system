<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MenuCategoryResource;
use App\Models\MenuCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MenuCategoryController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $categories = MenuCategory::query()
            ->withCount('items')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return MenuCategoryResource::collection($categories);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $category = MenuCategory::create($validated);

        return response()->json([
            'message' => $category->name.' was added to the menu.',
            'category' => new MenuCategoryResource($category->loadCount('items')),
        ], 201);
    }

    public function update(Request $request, int $category): JsonResponse
    {
        $category = MenuCategory::findOrFail($category);
        $validated = $request->validate($this->rules(updating: true));

        $category->update($validated);

        return response()->json([
            'message' => $category->name.' was updated.',
            'category' => new MenuCategoryResource($category->loadCount('items')),
        ]);
    }

    public function destroy(int $category): JsonResponse
    {
        $category = MenuCategory::findOrFail($category);

        if ($category->items()->exists()) {
            return response()->json([
                'message' => 'Move or delete the items in this category first.',
                'code' => 'category_not_empty',
            ], 422);
        }

        $category->delete();

        return response()->json(['message' => $category->name.' was removed.']);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    private function rules(bool $updating = false): array
    {
        $required = $updating ? 'sometimes' : 'required';

        return [
            'name' => [$required, 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:500'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}
