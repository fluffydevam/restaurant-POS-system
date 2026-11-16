<?php

namespace App\Services;

use App\Enums\TenantStatus;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TenantProvisioner
{
    /**
     * Slugs that must never belong to a tenant.
     *
     * @var list<string>
     */
    private const RESERVED_SLUGS = [
        'admin', 'api', 'app', 'assets', 'billing', 'docs', 'login', 'pos',
        'register', 'static', 'status', 'support', 'www',
    ];

    /**
     * @param  array{name: string, email: string, password: string, restaurant_name: string, country: string, timezone: string, restaurant_type: string}  $data
     * @return array{0: User, 1: Tenant}
     */
    public function provision(array $data): array
    {
        return DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
            ]);

            $tenant = Tenant::create([
                'name' => $data['restaurant_name'],
                'slug' => $this->uniqueSlug($data['restaurant_name']),
                'status' => TenantStatus::PendingApproval,
                'country' => strtoupper($data['country']),
                'timezone' => $data['timezone'],
                'currency' => 'USD',
                'settings' => [
                    'restaurant_type' => $data['restaurant_type'],
                    'onboarding' => ['completed' => false],
                ],
            ]);

            $tenant->memberships()->create([
                'user_id' => $user->id,
                'role' => 'owner',
                'is_active' => true,
            ]);

            return [$user, $tenant];
        });
    }

    public function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'restaurant';

        if (in_array($base, self::RESERVED_SLUGS, true)) {
            $base .= '-pos';
        }

        $slug = $base;
        $suffix = 2;

        while (Tenant::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix++;
        }

        return $slug;
    }
}
