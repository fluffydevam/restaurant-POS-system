<?php

namespace Database\Seeders;

use App\Enums\TenantStatus;
use App\Models\MenuCategory;
use App\Models\MenuItem;
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

        $this->seedMenu();
    }

    private function seedMenu(): void
    {
        $menu = [
            'Coffee' => [
                ['Americano', 'Espresso with hot water.', 350],
                ['Cafe Latte', 'Espresso with steamed milk.', 450],
                ['Vanilla Latte', 'Latte with vanilla syrup.', 500],
            ],
            'Pastries' => [
                ['Butter Croissant', 'Flaky, baked fresh each morning.', 420],
                ['Blueberry Muffin', 'Soft muffin packed with blueberries.', 380],
            ],
            'Kitchen' => [
                ['Club Sandwich', 'Chicken, bacon, egg, lettuce and tomato.', 950],
                ['Kimchi Fried Rice', 'Fried rice with kimchi and a fried egg.', 1100],
            ],
        ];

        $categorySort = 0;

        foreach ($menu as $categoryName => $items) {
            $category = MenuCategory::firstOrCreate(
                ['name' => $categoryName],
                ['sort_order' => $categorySort++, 'is_active' => true]
            );

            foreach ($items as $itemSort => [$name, $description, $priceCents]) {
                MenuItem::firstOrCreate(
                    ['name' => $name],
                    [
                        'menu_category_id' => $category->id,
                        'description' => $description,
                        'price_cents' => $priceCents,
                        'sort_order' => $itemSort,
                        'is_active' => true,
                        'is_available' => true,
                    ]
                );
            }
        }
    }
}
