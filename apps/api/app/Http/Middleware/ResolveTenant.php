<?php

namespace App\Http\Middleware;

use App\Models\Membership;
use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveTenant
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json([
                'message' => 'Unauthenticated.',
                'code' => 'unauthenticated',
            ], 401);
        }

        $memberships = $user->memberships()
            ->with('tenant')
            ->where('is_active', true)
            ->get();

        $tenantId = $request->header('X-Tenant-Id');

        $membership = $tenantId
            ? $memberships->first(fn (Membership $membership) => (string) $membership->tenant_id === (string) $tenantId)
            : ($memberships->count() === 1 ? $memberships->first() : null);

        if (! $membership) {
            return response()->json([
                'message' => $tenantId
                    ? 'You do not have access to this restaurant account.'
                    : 'A tenant must be selected.',
                'code' => 'tenant_required',
            ], 403);
        }

        app(TenantContext::class)->set($membership->tenant);
        $request->attributes->set('membership', $membership);

        return $next($request);
    }
}
