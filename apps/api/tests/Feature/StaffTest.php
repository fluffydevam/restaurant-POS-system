<?php

namespace Tests\Feature;

use App\Enums\TenantStatus;
use App\Models\Membership;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StaffTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_add_a_manager_who_can_sign_in(): void
    {
        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');

        $staff = $this->withHeaders($this->headers($owner, $tenant))
            ->postJson('/api/v1/staff', [
                'name' => 'Emily Manager',
                'email' => 'Emily@Cafe.test',
                'password' => 'secret123',
                'role' => 'manager',
            ])
            ->assertCreated()
            ->assertJsonPath('staff.name', 'Emily Manager')
            ->assertJsonPath('staff.email', 'emily@cafe.test')
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('meta.limits.staff.used', 2)
            ->json('staff');

        $this->assertDatabaseHas('users', [
            'id' => $staff['user_id'],
            'email' => 'emily@cafe.test',
        ]);
        $this->assertNotNull(User::find($staff['user_id'])->email_verified_at);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'emily@cafe.test',
            'password' => 'secret123',
        ])
            ->assertOk()
            ->assertJsonPath('user.email', 'emily@cafe.test');

        $this->withHeaders($this->headers($owner, $tenant))
            ->getJson('/api/v1/staff')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.role', 'owner')
            ->assertJsonPath('data.1.role', 'manager');
    }

    public function test_managers_can_only_manage_staff_accounts(): void
    {
        [, $tenant] = $this->makeMember('cafe', 'Cafe');
        $manager = $this->addMember($tenant, 'manager');
        $owner = $tenant->memberships()->where('role', 'owner')->firstOrFail()->user;
        $staffMembership = $this->addMember($tenant, 'staff');

        $headers = $this->headers($manager, $tenant);

        $this->withHeaders($headers)
            ->postJson('/api/v1/staff', [
                'name' => 'Another Manager',
                'email' => 'manager2@cafe.test',
                'password' => 'secret123',
                'role' => 'manager',
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'role_forbidden');

        $this->withHeaders($headers)
            ->postJson('/api/v1/staff', [
                'name' => 'Sam Staff',
                'email' => 'sam@cafe.test',
                'password' => 'secret123',
                'role' => 'staff',
            ])
            ->assertCreated();

        $ownerMembership = Membership::where('tenant_id', $tenant->id)
            ->where('user_id', $owner->id)
            ->firstOrFail();

        $this->withHeaders($headers)
            ->patchJson("/api/v1/staff/{$ownerMembership->id}", ['role' => 'staff'])
            ->assertForbidden();

        $this->withHeaders($headers)
            ->patchJson("/api/v1/staff/{$staffMembership->id}", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('staff.is_active', false);
    }

    public function test_owners_cannot_lock_themselves_out(): void
    {
        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        $membership = Membership::where('tenant_id', $tenant->id)->firstOrFail();

        $this->withHeaders($this->headers($owner, $tenant))
            ->patchJson("/api/v1/staff/{$membership->id}", ['role' => 'staff'])
            ->assertForbidden();

        $this->withHeaders($this->headers($owner, $tenant))
            ->patchJson("/api/v1/staff/{$membership->id}", ['is_active' => false])
            ->assertForbidden();

        $this->withHeaders($this->headers($owner, $tenant))
            ->deleteJson("/api/v1/staff/{$membership->id}")
            ->assertForbidden();
    }

    public function test_owner_can_promote_staff_and_remove_them(): void
    {
        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        $staff = $this->addMember($tenant, 'staff');
        $membership = Membership::where('tenant_id', $tenant->id)->where('user_id', $staff->id)->firstOrFail();

        $this->withHeaders($this->headers($owner, $tenant))
            ->patchJson("/api/v1/staff/{$membership->id}", [
                'name' => 'Sam Supervisor',
                'role' => 'manager',
            ])
            ->assertOk()
            ->assertJsonPath('staff.role', 'manager')
            ->assertJsonPath('staff.name', 'Sam Supervisor');

        $this->withHeaders($this->headers($owner, $tenant))
            ->deleteJson("/api/v1/staff/{$membership->id}")
            ->assertOk();

        $this->assertDatabaseMissing('memberships', ['id' => $membership->id]);
    }

    public function test_staff_cap_is_enforced(): void
    {
        config(['tenants.limits.staff' => 2]);

        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        $headers = $this->headers($owner, $tenant);

        $this->withHeaders($headers)
            ->postJson('/api/v1/staff', [
                'name' => 'One',
                'email' => 'one@cafe.test',
                'password' => 'secret123',
                'role' => 'staff',
            ])
            ->assertCreated();

        $this->withHeaders($headers)
            ->postJson('/api/v1/staff', [
                'name' => 'Two',
                'email' => 'two@cafe.test',
                'password' => 'secret123',
                'role' => 'staff',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['staff']);

        $this->withHeaders($headers)
            ->getJson('/api/v1/staff')
            ->assertOk()
            ->assertJsonPath('meta.limits.staff.used', 2)
            ->assertJsonPath('meta.limits.staff.at_limit', true);
    }

    public function test_staff_memberships_are_tenant_scoped(): void
    {
        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        [$otherOwner, $otherTenant] = $this->makeMember('other', 'Other');
        $foreign = Membership::where('tenant_id', $otherTenant->id)->firstOrFail();

        $this->withHeaders($this->headers($owner, $tenant))
            ->patchJson("/api/v1/staff/{$foreign->id}", ['is_active' => false])
            ->assertNotFound();

        $this->withHeaders($this->headers($owner, $tenant))
            ->deleteJson("/api/v1/staff/{$foreign->id}")
            ->assertNotFound();

        $this->assertTrue($foreign->fresh()->is_active);
    }

    /**
     * @return array{0: User, 1: Tenant}
     */
    private function makeMember(string $slug, string $name, string $role = 'owner'): array
    {
        $user = User::factory()->create();
        $tenant = Tenant::create([
            'name' => $name,
            'slug' => $slug,
            'status' => TenantStatus::Active,
            'country' => 'PH',
            'timezone' => 'Asia/Manila',
            'currency' => 'USD',
        ]);

        $tenant->memberships()->create([
            'user_id' => $user->id,
            'role' => $role,
            'is_active' => true,
        ]);

        return [$user, $tenant];
    }

    private function addMember(Tenant $tenant, string $role): User
    {
        $user = User::factory()->create();

        $tenant->memberships()->create([
            'user_id' => $user->id,
            'role' => $role,
            'is_active' => true,
        ]);

        return $user;
    }

    /**
     * @return array<string, string>
     */
    private function headers(User $user, Tenant $tenant): array
    {
        // Requests share the auth manager; drop cached guard users between actors.
        $this->app['auth']->forgetGuards();

        return [
            'Authorization' => 'Bearer '.$user->createToken('test')->plainTextToken,
            'X-Tenant-Id' => (string) $tenant->id,
        ];
    }
}
