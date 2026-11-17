<?php

use App\Http\Controllers\Api\V1\Admin\AdminTenantController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\MeController;
use App\Http\Controllers\Api\V1\Auth\RegisterController;
use App\Http\Controllers\Api\V1\Auth\ResendVerificationController;
use App\Http\Controllers\Api\V1\Auth\VerifyEmailController;
use App\Http\Controllers\Api\V1\TenantController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('/auth/register', RegisterController::class)->middleware('throttle:6,1');
    Route::post('/auth/login', LoginController::class)->middleware('throttle:10,1');

    Route::get('/auth/email/verify/{id}/{hash}', VerifyEmailController::class)
        ->middleware(['signed', 'throttle:6,1'])
        ->name('verification.verify');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', LogoutController::class);
        Route::post('/auth/email/verification-notification', ResendVerificationController::class)
            ->middleware('throttle:6,1');
        Route::get('/me', MeController::class);

        Route::middleware(['tenant', 'tenant.active'])->group(function () {
            Route::get('/tenant', [TenantController::class, 'show']);
        });

        Route::middleware('platform.admin')->prefix('admin')->group(function () {
            Route::get('/stats', [AdminTenantController::class, 'stats']);
            Route::get('/tenants', [AdminTenantController::class, 'index']);
            Route::post('/tenants/{tenant}/approve', [AdminTenantController::class, 'approve']);
            Route::post('/tenants/{tenant}/suspend', [AdminTenantController::class, 'suspend']);
            Route::post('/tenants/{tenant}/reactivate', [AdminTenantController::class, 'reactivate']);
        });
    });
});
