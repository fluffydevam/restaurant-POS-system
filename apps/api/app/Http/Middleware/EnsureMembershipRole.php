<?php

namespace App\Http\Middleware;

use App\Models\Membership;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureMembershipRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        /** @var Membership|null $membership */
        $membership = $request->attributes->get('membership');

        if (! $membership || ! in_array($membership->role, $roles, true)) {
            return response()->json([
                'message' => 'Your restaurant role cannot perform this action.',
                'code' => 'role_forbidden',
            ], 403);
        }

        return $next($request);
    }
}
