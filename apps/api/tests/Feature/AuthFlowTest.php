<?php

namespace Tests\Feature;

use App\Enums\TenantStatus;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_creates_a_pending_tenant_and_owner_membership(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Ava Owner',
            'email' => 'ava@example.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'restaurant_name' => 'Ava Cafe',
            'country' => 'PH',
            'timezone' => 'Asia/Manila',
            'restaurant_type' => 'cafe',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.email', 'ava@example.com')
            ->assertJsonPath('user.memberships.0.role', 'owner')
            ->assertJsonPath('user.memberships.0.tenant.status', 'pending_approval')
            ->assertJsonStructure(['token']);

        $this->assertDatabaseHas('tenants', [
            'slug' => 'ava-cafe',
            'status' => 'pending_approval',
        ]);

        $this->assertDatabaseHas('memberships', [
            'role' => 'owner',
            'is_active' => true,
        ]);
    }

    public function test_login_returns_a_token_and_memberships(): void
    {
        $user = User::factory()->create(['password' => 'secret123']);
        $tenant = $this->makeTenant('Demo Diner', TenantStatus::Active);
        $tenant->memberships()->create([
            'user_id' => $user->id,
            'role' => 'owner',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'secret123',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('user.memberships.0.tenant.slug', 'demo-diner')
            ->assertJsonStructure(['token']);
    }

    public function test_pending_tenant_cannot_use_the_workspace(): void
    {
        $user = User::factory()->create();
        $tenant = $this->makeTenant('Pending Place', TenantStatus::PendingApproval);
        $tenant->memberships()->create([
            'user_id' => $user->id,
            'role' => 'owner',
            'is_active' => true,
        ]);

        $token = $user->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/tenant')
            ->assertForbidden()
            ->assertJsonPath('code', 'tenant_inactive');
    }

    public function test_users_cannot_access_another_tenants_workspace(): void
    {
        [$userA, $tenantA] = $this->makeUserWithTenant('tenant-a', 'Tenant A');
        [, $tenantB] = $this->makeUserWithTenant('tenant-b', 'Tenant B');

        $token = $userA->createToken('test')->plainTextToken;

        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant-Id' => (string) $tenantB->id,
        ])->getJson('/api/v1/tenant')
            ->assertForbidden()
            ->assertJsonPath('code', 'tenant_required');

        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant-Id' => (string) $tenantA->id,
        ])->getJson('/api/v1/tenant')
            ->assertOk()
            ->assertJsonPath('tenant.id', $tenantA->id);
    }

    private function makeTenant(string $name, TenantStatus $status): Tenant
    {
        return Tenant::create([
            'name' => $name,
            'slug' => str($name)->slug()->value(),
            'status' => $status,
            'country' => 'PH',
            'timezone' => 'Asia/Manila',
            'currency' => 'USD',
        ]);
    }

    /**
     * @return array{0: User, 1: Tenant}
     */
    private function makeUserWithTenant(string $slug, string $name): array
    {
        $user = User::factory()->create();
        $tenant = $this->makeTenant($name, TenantStatus::Active);

        $tenant->memberships()->create([
            'user_id' => $user->id,
            'role' => 'owner',
            'is_active' => true,
        ]);

        return [$user, $tenant];
    }
}
