<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Services\TenantProvisioner;
use Illuminate\Http\JsonResponse;

class RegisterController extends Controller
{
    public function __invoke(RegisterRequest $request, TenantProvisioner $provisioner): JsonResponse
    {
        [$user] = $provisioner->provision($request->validated());

        $user->sendEmailVerificationNotification();

        $token = $user->createToken('web')->plainTextToken;

        return response()->json([
            'message' => 'Application received. Your restaurant account is pending approval.',
            'token' => $token,
            'user' => new UserResource($user->load('memberships.tenant')),
        ], 201);
    }
}
