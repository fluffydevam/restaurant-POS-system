<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePlatformAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->isPlatformAdmin()) {
            return response()->json([
                'message' => 'Platform admin access required.',
                'code' => 'platform_admin_required',
            ], 403);
        }

        return $next($request);
    }
}
