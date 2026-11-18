<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\BranchResource;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    public function update(Request $request, int $branch): JsonResponse
    {
        $branch = Branch::findOrFail($branch);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'timezone' => ['sometimes', 'nullable', 'string', 'timezone'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $branch->update($validated);

        return response()->json([
            'message' => $branch->name.' was updated.',
            'branch' => new BranchResource($branch),
        ]);
    }
}
