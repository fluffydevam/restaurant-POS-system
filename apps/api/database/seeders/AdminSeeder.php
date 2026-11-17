<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::updateOrCreate(
            ['email' => 'admin@demo.test'],
            [
                'name' => 'Platform Admin',
                'password' => 'password',
                'email_verified_at' => now(),
            ]
        );

        // Guarded attribute: never mass-assignable from public requests.
        $admin->forceFill(['is_platform_admin' => true])->save();
    }
}
