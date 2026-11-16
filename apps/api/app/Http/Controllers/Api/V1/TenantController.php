<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MembershipResource;
use App\Http\Resources\TenantResource;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TenantController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $tenant = app(TenantContext::class)->tenant();
        $membership = $request->attributes->get('membership');

        $tenant->load('branches');

        return response()->json([
            'tenant' => new TenantResource($tenant),
            'membership' => new MembershipResource($membership),
        ]);
    }
}
