<?php

namespace Tests\Feature;

use App\Enums\TenantStatus;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\TenantStatusChanged;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PlatformAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_admins_cannot_access_the_admin_api(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/admin/tenants')
            ->assertForbidden()
            ->assertJsonPath('code', 'platform_admin_required');
    }

    public function test_admin_can_list_and_filter_tenants(): void
    {
        $admin = $this->makeAdmin();
        $this->makeTenantWithOwner('pending-cafe', 'Pending Cafe', TenantStatus::PendingApproval);
        $this->makeTenantWithOwner('active-cafe', 'Active Cafe', TenantStatus::Active);

        $response = $this->actingAsAdmin($admin)->getJson('/api/v1/admin/tenants?status=pending_approval');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', 'pending-cafe')
            ->assertJsonPath('data.0.owner.email', 'owner@pending-cafe.test')
            ->assertJsonPath('meta.total', 1);
    }

    public function test_admin_stats_summarise_tenant_statuses(): void
    {
        $admin = $this->makeAdmin();
        $this->makeTenantWithOwner('one', 'One', TenantStatus::PendingApproval);
        $this->makeTenantWithOwner('two', 'Two', TenantStatus::Active);
        $this->makeTenantWithOwner('three', 'Three', TenantStatus::Suspended);

        $this->actingAsAdmin($admin)->getJson('/api/v1/admin/stats')
            ->assertOk()
            ->assertJson([
                'total' => 3,
                'pending' => 1,
                'active' => 1,
                'suspended' => 1,
                'cancelled' => 0,
            ]);
    }

    public function test_approving_a_tenant_activates_it_creates_a_branch_and_notifies_the_owner(): void
    {
        Notification::fake();

        $admin = $this->makeAdmin();
        [$tenant, $owner] = $this->makeTenantWithOwner('pending-cafe', 'Pending Cafe', TenantStatus::PendingApproval);

        $this->actingAsAdmin($admin)
            ->postJson("/api/v1/admin/tenants/{$tenant->id}/approve")
            ->assertOk()
            ->assertJsonPath('tenant.status', 'active')
            ->assertJsonPath('tenant.branches_count', 1);

        $tenant->refresh();

        $this->assertSame(TenantStatus::Active, $tenant->status);
        $this->assertNotNull($tenant->approved_at);
        $this->assertDatabaseHas('branches', [
            'tenant_id' => $tenant->id,
            'name' => 'Main Branch',
            'is_default' => true,
        ]);

        Notification::assertSentTo($owner, TenantStatusChanged::class);
    }

    public function test_an_approved_tenant_can_use_the_workspace(): void
    {
        [$tenant, $owner] = $this->makeTenantWithOwner('active-cafe', 'Active Cafe', TenantStatus::Active);
        $token = $owner->createToken('test')->plainTextToken;

        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant-Id' => (string) $tenant->id,
        ])->getJson('/api/v1/tenant')
            ->assertOk()
            ->assertJsonPath('tenant.id', $tenant->id);
    }

    public function test_admin_can_suspend_and_reactivate_a_tenant(): void
    {
        Notification::fake();

        $admin = $this->makeAdmin();
        [$tenant, $owner] = $this->makeTenantWithOwner('active-cafe', 'Active Cafe', TenantStatus::Active);

        $this->actingAsAdmin($admin)
            ->postJson("/api/v1/admin/tenants/{$tenant->id}/suspend", ['reason' => 'Unpaid invoice'])
            ->assertOk()
            ->assertJsonPath('tenant.status', 'suspended')
            ->assertJsonPath('tenant.suspended_reason', 'Unpaid invoice');

        Notification::assertSentTo($owner, TenantStatusChanged::class);

        $this->actingAsAdmin($admin)
            ->postJson("/api/v1/admin/tenants/{$tenant->id}/reactivate")
            ->assertOk()
            ->assertJsonPath('tenant.status', 'active')
            ->assertJsonPath('tenant.suspended_reason', null);
    }

    public function test_suspension_blocks_the_tenant_workspace(): void
    {
        [$tenant, $owner] = $this->makeTenantWithOwner('suspended-cafe', 'Suspended Cafe', TenantStatus::Suspended);
        $token = $owner->createToken('test')->plainTextToken;

        $this->withHeaders([
            'Authorization' => "Bearer {$token}",
            'X-Tenant-Id' => (string) $tenant->id,
        ])->getJson('/api/v1/tenant')
            ->assertForbidden()
            ->assertJsonPath('code', 'tenant_inactive');
    }

    private function makeAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->forceFill(['is_platform_admin' => true])->save();

        return $admin;
    }

    private function actingAsAdmin(User $admin): self
    {
        $token = $admin->createToken('test')->plainTextToken;

        return $this->withHeader('Authorization', "Bearer {$token}");
    }

    /**
     * @return array{0: Tenant, 1: User}
     */
    private function makeTenantWithOwner(string $slug, string $name, TenantStatus $status): array
    {
        $tenant = Tenant::create([
            'name' => $name,
            'slug' => $slug,
            'status' => $status,
            'country' => 'PH',
            'timezone' => 'Asia/Manila',
            'currency' => 'USD',
        ]);

        $owner = User::factory()->create(['email' => "owner@{$slug}.test"]);

        $tenant->memberships()->create([
            'user_id' => $owner->id,
            'role' => 'owner',
            'is_active' => true,
        ]);

        return [$tenant, $owner];
    }
}
