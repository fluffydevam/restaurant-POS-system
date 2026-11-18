<?php

namespace Tests\Feature;

use App\Enums\TenantStatus;
use App\Models\Branch;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_update_profile_charges_and_onboarding_state(): void
    {
        [$user, $tenant] = $this->makeMember('cafe', 'Cafe');

        $response = $this->withHeaders($this->headers($user, $tenant))
            ->patchJson('/api/v1/tenant', [
                'name' => 'Sunset Cafe',
                'phone' => '+63 917 000 0000',
                'currency' => 'php',
                'receipt_footer' => 'Salamat! Come again.',
                'tax_enabled' => true,
                'tax_rate' => 12,
                'service_charge_enabled' => true,
                'service_charge_rate' => 7.5,
                'onboarding_completed' => true,
            ]);

        $response->assertOk()
            ->assertJsonPath('tenant.name', 'Sunset Cafe')
            ->assertJsonPath('tenant.currency', 'PHP')
            ->assertJsonPath('tenant.settings.phone', '+63 917 000 0000')
            ->assertJsonPath('tenant.settings.receipt_footer', 'Salamat! Come again.')
            ->assertJsonPath('tenant.settings.tax.enabled', true)
            ->assertJsonPath('tenant.settings.tax.rate_bps', 1200)
            ->assertJsonPath('tenant.settings.service_charge.rate_bps', 750)
            ->assertJsonPath('tenant.settings.onboarding.completed', true);

        $tenant->refresh();

        $this->assertSame('Sunset Cafe', $tenant->name);
        $this->assertSame('PHP', $tenant->currency);
        $this->assertIsString($tenant->settings['onboarding']['completed_at']);
    }

    public function test_partial_updates_keep_existing_settings(): void
    {
        [$user, $tenant] = $this->makeMember('cafe', 'Cafe');
        $tenant->update([
            'settings' => [
                'restaurant_type' => 'cafe',
                'tax' => ['enabled' => true, 'rate_bps' => 1000],
                'service_charge' => ['enabled' => false, 'rate_bps' => 0],
                'onboarding' => ['completed' => false],
            ],
        ]);

        $this->withHeaders($this->headers($user, $tenant))
            ->patchJson('/api/v1/tenant', ['receipt_footer' => 'Thanks!'])
            ->assertOk()
            ->assertJsonPath('tenant.settings.restaurant_type', 'cafe')
            ->assertJsonPath('tenant.settings.tax.rate_bps', 1000)
            ->assertJsonPath('tenant.settings.receipt_footer', 'Thanks!');
    }

    public function test_settings_are_validated(): void
    {
        [$user, $tenant] = $this->makeMember('cafe', 'Cafe');

        $this->withHeaders($this->headers($user, $tenant))
            ->patchJson('/api/v1/tenant', [
                'timezone' => 'Mars/Olympus',
                'currency' => 'PESO',
                'tax_rate' => 150,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['timezone', 'currency', 'tax_rate']);
    }

    public function test_staff_cannot_change_restaurant_settings(): void
    {
        [$staff, $tenant] = $this->makeMember('cafe', 'Cafe', 'staff');

        $this->withHeaders($this->headers($staff, $tenant))
            ->patchJson('/api/v1/tenant', ['name' => 'Hacked Cafe'])
            ->assertForbidden()
            ->assertJsonPath('code', 'role_forbidden');
    }

    public function test_branch_updates_are_tenant_scoped(): void
    {
        [$user, $tenant] = $this->makeMember('cafe', 'Cafe');
        [, $otherTenant] = $this->makeMember('other', 'Other');
        $branch = Branch::create(['tenant_id' => $tenant->id, 'name' => 'Main Branch', 'is_default' => true]);
        $foreignBranch = Branch::create(['tenant_id' => $otherTenant->id, 'name' => 'Foreign Branch']);

        $this->withHeaders($this->headers($user, $tenant))
            ->patchJson("/api/v1/branches/{$branch->id}", [
                'name' => 'Downtown',
                'address' => '12 High Street',
                'timezone' => 'Asia/Manila',
            ])
            ->assertOk()
            ->assertJsonPath('branch.name', 'Downtown')
            ->assertJsonPath('branch.address', '12 High Street');

        $this->withHeaders($this->headers($user, $tenant))
            ->patchJson("/api/v1/branches/{$foreignBranch->id}", ['name' => 'Stolen'])
            ->assertNotFound();

        $this->assertDatabaseMissing('branches', ['id' => $foreignBranch->id, 'name' => 'Stolen']);
    }

    public function test_orders_apply_configured_service_charge_and_tax(): void
    {
        [$user, $tenant] = $this->makeMember('cafe', 'Cafe');
        $tenant->update([
            'settings' => [
                'tax' => ['enabled' => true, 'rate_bps' => 1200],
                'service_charge' => ['enabled' => true, 'rate_bps' => 1000],
            ],
        ]);

        $category = MenuCategory::create(['tenant_id' => $tenant->id, 'name' => 'Mains']);
        $item = MenuItem::create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $category->id,
            'name' => 'Steak',
            'price_cents' => 1000,
            'is_active' => true,
            'is_available' => true,
        ]);

        $response = $this->withHeaders($this->headers($user, $tenant))
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])
            ->assertCreated();

        $response->assertJsonPath('order.subtotal_cents', 1000)
            ->assertJsonPath('order.service_charge_cents', 100)
            ->assertJsonPath('order.tax_cents', 132)
            ->assertJsonPath('order.total_cents', 1232);

        $orderId = $response->json('order.id');

        $this->withHeaders($this->headers($user, $tenant))
            ->postJson("/api/v1/orders/{$orderId}/pay", ['amount_paid_cents' => 1500])
            ->assertOk()
            ->assertJsonPath('order.change_cents', 268);

        $order = Order::findOrFail($orderId);
        $this->assertSame(1232, $order->total_cents);
    }

    public function test_disabled_charges_leave_totals_untouched(): void
    {
        [$user, $tenant] = $this->makeMember('cafe', 'Cafe');
        $tenant->update([
            'settings' => [
                'tax' => ['enabled' => false, 'rate_bps' => 1200],
                'service_charge' => ['enabled' => false, 'rate_bps' => 1000],
            ],
        ]);

        $category = MenuCategory::create(['tenant_id' => $tenant->id, 'name' => 'Mains']);
        $item = MenuItem::create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $category->id,
            'name' => 'Steak',
            'price_cents' => 1000,
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->withHeaders($this->headers($user, $tenant))
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])
            ->assertCreated()
            ->assertJsonPath('order.service_charge_cents', 0)
            ->assertJsonPath('order.tax_cents', 0)
            ->assertJsonPath('order.total_cents', 1000);
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

    /**
     * @return array<string, string>
     */
    private function headers(User $user, Tenant $tenant): array
    {
        return [
            'Authorization' => 'Bearer '.$user->createToken('test')->plainTextToken,
            'X-Tenant-Id' => (string) $tenant->id,
        ];
    }
}
