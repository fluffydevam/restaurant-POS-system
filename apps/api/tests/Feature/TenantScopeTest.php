<?php

namespace Tests\Feature;

use App\Enums\TenantStatus;
use App\Models\Branch;
use App\Models\Tenant;
use App\Support\TenantContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_global_scope_only_returns_rows_for_the_active_tenant(): void
    {
        $tenantA = $this->makeTenant('tenant-a', 'Tenant A');
        $tenantB = $this->makeTenant('tenant-b', 'Tenant B');

        app(TenantContext::class)->set($tenantA);
        Branch::create(['name' => 'A branch']);

        app(TenantContext::class)->set($tenantB);
        Branch::create(['name' => 'B branch']);

        app(TenantContext::class)->set($tenantA);
        $this->assertSame(['A branch'], Branch::query()->pluck('name')->all());

        app(TenantContext::class)->set($tenantB);
        $this->assertSame(['B branch'], Branch::query()->pluck('name')->all());
    }

    public function test_scope_fails_closed_without_a_tenant(): void
    {
        $tenant = $this->makeTenant('tenant-a', 'Tenant A');

        app(TenantContext::class)->set($tenant);
        Branch::create(['name' => 'A branch']);

        app(TenantContext::class)->set(null);

        $this->assertCount(0, Branch::all());
    }

    private function makeTenant(string $slug, string $name): Tenant
    {
        return Tenant::create([
            'name' => $name,
            'slug' => $slug,
            'status' => TenantStatus::Active,
            'country' => 'PH',
            'timezone' => 'Asia/Manila',
            'currency' => 'USD',
        ]);
    }
}
