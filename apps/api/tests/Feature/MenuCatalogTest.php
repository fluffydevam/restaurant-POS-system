<?php

namespace Tests\Feature;

use App\Enums\TenantStatus;
use App\Models\MenuCategory;
use App\Models\MenuItem;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MenuCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_menu_lists_are_scoped_to_the_selected_tenant(): void
    {
        [$userA, $tenantA] = $this->makeOwner('tenant-a', 'Tenant A');
        [, $tenantB] = $this->makeOwner('tenant-b', 'Tenant B');

        $categoryA = MenuCategory::create(['tenant_id' => $tenantA->id, 'name' => 'Drinks']);
        MenuItem::create([
            'tenant_id' => $tenantA->id,
            'menu_category_id' => $categoryA->id,
            'name' => 'House Coffee',
            'price_cents' => 300,
        ]);
        $categoryB = MenuCategory::create(['tenant_id' => $tenantB->id, 'name' => 'Meals']);
        $itemB = MenuItem::create([
            'tenant_id' => $tenantB->id,
            'menu_category_id' => $categoryB->id,
            'name' => 'Burger',
            'price_cents' => 1200,
        ]);

        $headers = $this->headers($userA, $tenantA);

        $this->withHeaders($headers)->getJson('/api/v1/menu/categories')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Drinks');

        $this->withHeaders($headers)->getJson('/api/v1/menu/items')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'House Coffee');

        $this->withHeaders($headers)
            ->patchJson("/api/v1/menu/items/{$itemB->id}", ['name' => 'Stolen Burger'])
            ->assertNotFound();

        $this->assertDatabaseMissing('menu_items', ['id' => $itemB->id, 'name' => 'Stolen Burger']);
    }

    public function test_owner_can_create_and_update_menu_items(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $headers = $this->headers($user, $tenant);

        $category = $this->withHeaders($headers)->postJson('/api/v1/menu/categories', [
            'name' => 'Coffee',
            'description' => 'Hot and cold drinks',
        ])->assertCreated()->assertJsonPath('category.name', 'Coffee')->json('category');

        $item = $this->withHeaders($headers)->postJson('/api/v1/menu/items', [
            'menu_category_id' => $category['id'],
            'name' => 'Flat White',
            'price_cents' => 450,
            'sku' => 'COF-003',
        ])->assertCreated()
            ->assertJsonPath('item.name', 'Flat White')
            ->assertJsonPath('item.price_cents', 450)
            ->json('item');

        $this->withHeaders($headers)
            ->patchJson("/api/v1/menu/items/{$item['id']}", [
                'price_cents' => 500,
                'is_available' => false,
            ])
            ->assertOk()
            ->assertJsonPath('item.price_cents', 500)
            ->assertJsonPath('item.is_available', false);

        $this->assertDatabaseHas('menu_items', [
            'id' => $item['id'],
            'tenant_id' => $tenant->id,
            'price_cents' => 500,
            'is_available' => false,
        ]);
    }

    public function test_an_item_cannot_reference_a_category_from_another_tenant(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        [, $otherTenant] = $this->makeOwner('other', 'Other Cafe');
        $foreignCategory = MenuCategory::create(['tenant_id' => $otherTenant->id, 'name' => 'Foreign']);

        $this->withHeaders($this->headers($user, $tenant))
            ->postJson('/api/v1/menu/items', [
                'menu_category_id' => $foreignCategory->id,
                'name' => 'Bad item',
                'price_cents' => 100,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('menu_category_id');
    }

    public function test_a_category_with_items_cannot_be_deleted(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $category = MenuCategory::create(['tenant_id' => $tenant->id, 'name' => 'Coffee']);
        MenuItem::create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $category->id,
            'name' => 'Espresso',
            'price_cents' => 250,
        ]);

        $this->withHeaders($this->headers($user, $tenant))
            ->deleteJson("/api/v1/menu/categories/{$category->id}")
            ->assertUnprocessable()
            ->assertJsonPath('code', 'category_not_empty');

        $this->assertNotSoftDeleted($category);
    }

    public function test_items_can_be_filtered_and_soft_deleted(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe');
        $drinks = MenuCategory::create(['tenant_id' => $tenant->id, 'name' => 'Drinks']);
        $food = MenuCategory::create(['tenant_id' => $tenant->id, 'name' => 'Food']);

        $latte = MenuItem::create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $drinks->id,
            'name' => 'Cafe Latte',
            'description' => 'Coffee with milk',
            'price_cents' => 450,
        ]);
        MenuItem::create([
            'tenant_id' => $tenant->id,
            'menu_category_id' => $food->id,
            'name' => 'Muffin',
            'price_cents' => 380,
            'is_active' => false,
        ]);

        $headers = $this->headers($user, $tenant);

        $this->withHeaders($headers)->getJson('/api/v1/menu/items?category_id='.$drinks->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Cafe Latte');

        $this->withHeaders($headers)->getJson('/api/v1/menu/items?search=muffin')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Muffin');

        $this->withHeaders($headers)->getJson('/api/v1/menu/items?active=1')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->withHeaders($headers)->deleteJson("/api/v1/menu/items/{$latte->id}")
            ->assertOk();

        $this->withHeaders($headers)->getJson('/api/v1/menu/items')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->assertSoftDeleted($latte);
    }

    public function test_staff_can_read_the_menu_but_cannot_change_it(): void
    {
        [$user, $tenant] = $this->makeOwner('cafe', 'Cafe', 'staff');
        MenuCategory::create(['tenant_id' => $tenant->id, 'name' => 'Coffee']);
        $headers = $this->headers($user, $tenant);

        $this->withHeaders($headers)->getJson('/api/v1/menu/categories')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->withHeaders($headers)->postJson('/api/v1/menu/categories', ['name' => 'Food'])
            ->assertForbidden()
            ->assertJsonPath('code', 'role_forbidden');
    }

    public function test_menu_requires_an_active_tenant_membership(): void
    {
        $user = User::factory()->create();
        $tenant = $this->makeTenant('pending', 'Pending Cafe', TenantStatus::PendingApproval);
        $tenant->memberships()->create([
            'user_id' => $user->id,
            'role' => 'owner',
            'is_active' => true,
        ]);

        $this->withHeaders($this->headers($user, $tenant))
            ->getJson('/api/v1/menu/categories')
            ->assertForbidden()
            ->assertJsonPath('code', 'tenant_inactive');
    }

    /**
     * @return array{0: User, 1: Tenant}
     */
    private function makeOwner(string $slug, string $name, string $role = 'owner'): array
    {
        $user = User::factory()->create();
        $tenant = $this->makeTenant($slug, $name, TenantStatus::Active);
        $tenant->memberships()->create([
            'user_id' => $user->id,
            'role' => $role,
            'is_active' => true,
        ]);

        return [$user, $tenant];
    }

    private function makeTenant(string $slug, string $name, TenantStatus $status): Tenant
    {
        return Tenant::create([
            'name' => $name,
            'slug' => $slug,
            'status' => $status,
            'country' => 'PH',
            'timezone' => 'Asia/Manila',
            'currency' => 'USD',
        ]);
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
