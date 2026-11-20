<?php

namespace Database\Seeders;

use App\Enums\TableStatus;
use App\Enums\TenantStatus;
use App\Models\DiningTable;
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
        $this->seedTables($tenant);
        $this->seedStaff($tenant);
    }

    private function seedTables(Tenant $tenant): void
    {
        $branchId = $tenant->branches()->where('is_default', true)->value('id');

        $tables = [
            ['T1', 'Window', 2, TableStatus::Available, 1],
            ['T2', 'Window', 2, TableStatus::Occupied, 2],
            ['T3', 'Patio', 4, TableStatus::Available, 3],
            ['T4', 'Patio', 4, TableStatus::Reserved, 4],
        ];

        foreach ($tables as [$name, $zone, $seats, $status, $sortOrder]) {
            DiningTable::firstOrCreate(
                ['name' => $name, 'branch_id' => $branchId],
                [
                    'zone' => $zone,
                    'seats' => $seats,
                    'status' => $status,
                    'sort_order' => $sortOrder,
                    'is_active' => true,
                ]
            );
        }
    }

    private function seedStaff(Tenant $tenant): void
    {
        $people = [
            ['manager@demo.test', 'Demo Manager', 'manager'],
            ['staff@demo.test', 'Demo Staff', 'staff'],
        ];

        foreach ($people as [$email, $name, $role]) {
            $user = User::firstOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'password' => 'password',
                    'email_verified_at' => now(),
                ]
            );

            $tenant->memberships()->updateOrCreate(
                ['user_id' => $user->id],
                ['role' => $role, 'is_active' => true]
            );
        }
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
