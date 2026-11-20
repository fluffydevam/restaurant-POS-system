<?php

namespace Tests\Feature;

use App\Enums\TenantStatus;
use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TablesTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_manage_tables_and_staff_can_change_status(): void
    {
        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        $staff = $this->addMember($tenant, 'staff');
        $branch = Branch::create([
            'tenant_id' => $tenant->id,
            'name' => 'Main Branch',
            'is_default' => true,
        ]);

        $table = $this->withHeaders($this->headers($owner, $tenant))
            ->postJson('/api/v1/tables', [
                'name' => 'Window 1',
                'zone' => 'Patio',
                'seats' => 4,
            ])
            ->assertCreated()
            ->assertJsonPath('table.name', 'Window 1')
            ->assertJsonPath('table.branch_id', $branch->id)
            ->assertJsonPath('table.status', 'available')
            ->assertJsonPath('meta.limits.tables.used', 1)
            ->json('table');

        $this->withHeaders($this->headers($staff, $tenant))
            ->patchJson("/api/v1/tables/{$table['id']}/status", ['status' => 'occupied'])
            ->assertOk()
            ->assertJsonPath('table.status', 'occupied')
            ->assertJsonPath('table.status_label', 'Occupied');

        $this->withHeaders($this->headers($staff, $tenant))
            ->postJson('/api/v1/tables', ['name' => 'Sneaky Table'])
            ->assertForbidden()
            ->assertJsonPath('code', 'role_forbidden');

        $this->withHeaders($this->headers($owner, $tenant))
            ->patchJson("/api/v1/tables/{$table['id']}", [
                'name' => 'Window 2',
                'seats' => 6,
                'is_active' => false,
            ])
            ->assertOk()
            ->assertJsonPath('table.name', 'Window 2')
            ->assertJsonPath('table.seats', 6)
            ->assertJsonPath('table.is_active', false);

        $this->withHeaders($this->headers($owner, $tenant))
            ->deleteJson("/api/v1/tables/{$table['id']}")
            ->assertOk();

        $this->assertSoftDeleted('dining_tables', ['id' => $table['id']]);
    }

    public function test_tables_are_tenant_scoped(): void
    {
        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        [, $otherTenant] = $this->makeMember('other', 'Other');
        $foreign = DiningTable::create([
            'tenant_id' => $otherTenant->id,
            'name' => 'Foreign Table',
            'seats' => 2,
            'status' => 'available',
        ]);

        $this->withHeaders($this->headers($owner, $tenant))
            ->getJson('/api/v1/tables')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->withHeaders($this->headers($owner, $tenant))
            ->patchJson("/api/v1/tables/{$foreign->id}", ['name' => 'Stolen'])
            ->assertNotFound();

        $this->withHeaders($this->headers($owner, $tenant))
            ->patchJson("/api/v1/tables/{$foreign->id}/status", ['status' => 'occupied'])
            ->assertNotFound();
    }

    public function test_table_names_are_unique_per_branch(): void
    {
        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        $headers = $this->headers($owner, $tenant);

        $this->withHeaders($headers)
            ->postJson('/api/v1/tables', ['name' => 'T1'])
            ->assertCreated();

        $this->withHeaders($headers)
            ->postJson('/api/v1/tables', ['name' => 'T1'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_table_cap_is_enforced(): void
    {
        config(['tenants.limits.tables' => 2]);

        [$owner, $tenant] = $this->makeMember('cafe', 'Cafe');
        $headers = $this->headers($owner, $tenant);

        $this->withHeaders($headers)->postJson('/api/v1/tables', ['name' => 'T1'])->assertCreated();
        $this->withHeaders($headers)->postJson('/api/v1/tables', ['name' => 'T2'])->assertCreated();

        $this->withHeaders($headers)
            ->postJson('/api/v1/tables', ['name' => 'T3'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['tables']);

        $this->withHeaders($headers)
            ->getJson('/api/v1/tables')
            ->assertOk()
            ->assertJsonPath('meta.limits.tables.used', 2)
            ->assertJsonPath('meta.limits.tables.at_limit', true);
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
