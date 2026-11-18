<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\OrderType;
use App\Enums\TenantStatus;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Order;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_creating_an_order_snapshots_prices_and_opens_it(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $latte = $this->makeMenuItem($tenant, 'Cafe Latte', 450);
        $muffin = $this->makeMenuItem($tenant, 'Muffin', 380);

        $response = $this->withHeaders($this->headers($user, $tenant))
            ->postJson('/api/v1/orders', [
                'type' => 'takeaway',
                'customer_name' => 'Ava',
                'items' => [
                    ['menu_item_id' => $latte->id, 'quantity' => 2],
                    ['menu_item_id' => $muffin->id, 'quantity' => 1, 'notes' => 'Warm it up'],
                ],
            ]);

        $response->assertCreated()
            ->assertJsonPath('order.status', 'open')
            ->assertJsonPath('order.type', 'takeaway')
            ->assertJsonPath('order.customer_name', 'Ava')
            ->assertJsonPath('order.subtotal_cents', 1280)
            ->assertJsonPath('order.total_cents', 1280)
            ->assertJsonPath('order.items_count', 2)
            ->assertJsonPath('order.items.0.name', 'Cafe Latte')
            ->assertJsonPath('order.items.0.unit_price_cents', 450)
            ->assertJsonPath('order.items.0.quantity', 2)
            ->assertJsonPath('order.items.0.line_total_cents', 900);

        $order = Order::firstOrFail();

        $this->assertMatchesRegularExpression('/^ORD-\d{5}$/', $order->order_number);
        $this->assertSame($tenant->id, $order->tenant_id);
        $this->assertSame($user->id, $order->created_by);
        $this->assertSame(OrderStatus::Open, $order->status);
        $this->assertNotNull($order->placed_at);
    }

    public function test_cash_payment_completes_an_order_and_calculates_change(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $item = $this->makeMenuItem($tenant, 'Club Sandwich', 950);
        $headers = $this->headers($user, $tenant);

        $orderId = $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 2]]])
            ->json('order.id');

        $this->withHeaders($headers)
            ->postJson("/api/v1/orders/{$orderId}/pay", ['amount_paid_cents' => 2000])
            ->assertOk()
            ->assertJsonPath('order.status', 'completed')
            ->assertJsonPath('order.payment_method', 'cash')
            ->assertJsonPath('order.amount_paid_cents', 2000)
            ->assertJsonPath('order.change_cents', 100);

        $order = Order::findOrFail($orderId);

        $this->assertSame(OrderStatus::Completed, $order->status);
        $this->assertNotNull($order->paid_at);

        // A completed order cannot be paid twice.
        $this->withHeaders($headers)
            ->postJson("/api/v1/orders/{$orderId}/pay", ['amount_paid_cents' => 2000])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'order_not_open');
    }

    public function test_payment_must_cover_the_total(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $item = $this->makeMenuItem($tenant, 'Latte', 450);
        $headers = $this->headers($user, $tenant);

        $orderId = $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 2]]])
            ->json('order.id');

        $this->withHeaders($headers)
            ->postJson("/api/v1/orders/{$orderId}/pay", ['amount_paid_cents' => 500])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'insufficient_payment')
            ->assertJsonPath('shortfall_cents', 400);

        $this->assertSame(OrderStatus::Open, Order::findOrFail($orderId)->status);
    }

    public function test_unavailable_or_foreign_items_cannot_be_ordered(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        [, $otherTenant] = $this->makeOwner('other', 'Other');
        $unavailable = $this->makeMenuItem($tenant, 'Sold Out Pie', 500, ['is_available' => false]);
        $foreign = $this->makeMenuItem($otherTenant, 'Foreign Burger', 900);
        $headers = $this->headers($user, $tenant);

        $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $unavailable->id, 'quantity' => 1]]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('items');

        $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $foreign->id, 'quantity' => 1]]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('items');

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_orders_are_scoped_to_the_tenant(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        [, $otherTenant] = $this->makeOwner('other', 'Other');
        $otherItem = $this->makeMenuItem($otherTenant, 'Other Burger', 900);

        $otherOrder = Order::create([
            'tenant_id' => $otherTenant->id,
            'order_number' => 'ORD-00001',
            'status' => OrderStatus::Completed,
            'type' => OrderType::DineIn,
            'subtotal_cents' => 900,
            'total_cents' => 900,
            'amount_paid_cents' => 900,
            'payment_method' => 'cash',
            'placed_at' => now(),
            'paid_at' => now(),
        ]);
        $otherOrder->items()->create([
            'tenant_id' => $otherTenant->id,
            'menu_item_id' => $otherItem->id,
            'name' => 'Other Burger',
            'unit_price_cents' => 900,
            'quantity' => 1,
            'line_total_cents' => 900,
        ]);

        $headers = $this->headers($user, $tenant);

        $this->withHeaders($headers)->getJson('/api/v1/orders')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->withHeaders($headers)->getJson("/api/v1/orders/{$otherOrder->id}")
            ->assertNotFound();

        $item = $this->makeMenuItem($tenant, 'Latte', 450);
        $orderId = $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])
            ->json('order.id');

        $this->withHeaders($headers)->getJson('/api/v1/orders')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $orderId);
    }

    public function test_daily_summary_reports_completed_sales(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $item = $this->makeMenuItem($tenant, 'Latte', 450);
        $headers = $this->headers($user, $tenant);

        foreach ([1, 2] as $quantity) {
            $orderId = $this->withHeaders($headers)
                ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => $quantity]]])
                ->json('order.id');

            $this->withHeaders($headers)
                ->postJson("/api/v1/orders/{$orderId}/pay", ['amount_paid_cents' => 5000])
                ->assertOk();
        }

        // An open order should not count towards sales.
        $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])
            ->assertCreated();

        $this->withHeaders($headers)->getJson('/api/v1/orders/summary')
            ->assertOk()
            ->assertJsonPath('orders_today', 2)
            ->assertJsonPath('sales_today_cents', 1350)
            ->assertJsonPath('items_sold_today', 3)
            ->assertJsonPath('open_orders', 1)
            ->assertJsonPath('average_order_cents', 675);
    }

    public function test_staff_can_sell_but_only_managers_can_void(): void
    {
        [$staff, $tenant] = $this->makeOwner('cafe', 'Cafe', 'staff');
        $item = $this->makeMenuItem($tenant, 'Latte', 450);
        $headers = $this->headers($staff, $tenant);

        $orderId = $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])
            ->assertCreated()
            ->json('order.id');

        $this->withHeaders($headers)
            ->postJson("/api/v1/orders/{$orderId}/void")
            ->assertForbidden()
            ->assertJsonPath('code', 'role_forbidden');

        $this->withHeaders($headers)
            ->postJson("/api/v1/orders/{$orderId}/pay", ['amount_paid_cents' => 450])
            ->assertOk();
    }

    public function test_owner_can_void_an_open_order(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $item = $this->makeMenuItem($tenant, 'Latte', 450);
        $headers = $this->headers($user, $tenant);

        $orderId = $this->withHeaders($headers)
            ->postJson('/api/v1/orders', ['items' => [['menu_item_id' => $item->id, 'quantity' => 1]]])
            ->json('order.id');

        $this->withHeaders($headers)
            ->postJson("/api/v1/orders/{$orderId}/void")
            ->assertOk()
            ->assertJsonPath('order.status', 'voided');

        $this->withHeaders($headers)
            ->postJson("/api/v1/orders/{$orderId}/pay", ['amount_paid_cents' => 450])
            ->assertUnprocessable();
    }

    /**
     * @return array{0: User, 1: Tenant}
     */
    private function makeOwner(string $slug, string $name, string $role = 'owner'): array
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
     * @param  array<string, mixed>  $overrides
     */
    private function makeMenuItem(Tenant $tenant, string $name, int $priceCents, array $overrides = []): MenuItem
    {
        $category = MenuCategory::firstOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Test Menu'],
            ['is_active' => true]
        );

        return MenuItem::create(array_merge([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $category->id,
            'name' => $name,
            'price_cents' => $priceCents,
            'is_active' => true,
            'is_available' => true,
        ], $overrides));
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
