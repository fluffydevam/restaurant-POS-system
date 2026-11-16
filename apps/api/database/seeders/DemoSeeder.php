<?php

namespace Database\Seeders;

use App\Enums\TenantStatus;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantContext;
use Illuminate\Database\Seeder;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::updateOrCreate(
            ['email' => 'owner@demo.test'],
            [
                'name' => 'Demo Owner',
                'password' => 'password',
                'email_verified_at' => now(),
            ]
        );

        $tenant = Tenant::updateOrCreate(
            ['slug' => 'demo'],
            [
                'name' => 'Demo Restaurant',
                'status' => TenantStatus::Active,
                'country' => 'KR',
                'timezone' => 'Asia/Seoul',
                'currency' => 'USD',
                'approved_at' => now(),
                'settings' => [
                    'restaurant_type' => 'cafe',
                    'onboarding' => ['completed' => false],
                ],
            ]
        );

        $tenant->memberships()->updateOrCreate(
            ['user_id' => $user->id],
            ['role' => 'owner', 'is_active' => true]
        );

        app(TenantContext::class)->set($tenant);

        $tenant->branches()->updateOrCreate(
            ['name' => 'Main Branch'],
            [
                'is_default' => true,
                'is_active' => true,
                'timezone' => 'Asia/Seoul',
            ]
        );
    }
}
