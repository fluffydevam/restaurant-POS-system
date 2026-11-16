<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $tenant = app(TenantContext::class)->tenant();

        if (! $tenant || ! $tenant->isActive()) {
            return response()->json([
                'message' => 'This restaurant account is not active.',
                'code' => 'tenant_inactive',
                'status' => $tenant?->status?->value,
            ], 403);
        }

        return $next($request);
    }
}
