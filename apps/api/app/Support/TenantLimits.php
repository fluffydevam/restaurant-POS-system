<?php

namespace App\Support;

use App\Models\Branch;
use App\Models\DiningTable;
use App\Models\Membership;
use App\Models\MenuItem;
use Illuminate\Validation\ValidationException;

class TenantLimits
{
    /**
     * @return array<string, int>
     */
    public static function limits(): array
    {
        return [
            'branches' => (int) config('tenants.limits.branches', 3),
            'tables' => (int) config('tenants.limits.tables', 30),
            'staff' => (int) config('tenants.limits.staff', 10),
            'menu_items' => (int) config('tenants.limits.menu_items', 150),
        ];
    }

    /**
     * Usage for the active tenant, with warning flags for the UI.
     *
     * @return array<string, array{used: int, limit: int, percent: int, near_limit: bool, at_limit: bool}>
     */
    public static function usage(): array
    {
        $tenantId = app(TenantContext::class)->id();

        $used = [
            'branches' => $tenantId ? Branch::where('tenant_id', $tenantId)->count() : 0,
            'tables' => $tenantId ? DiningTable::where('tenant_id', $tenantId)->count() : 0,
            'staff' => $tenantId ? Membership::where('tenant_id', $tenantId)->where('is_active', true)->count() : 0,
            'menu_items' => $tenantId ? MenuItem::where('tenant_id', $tenantId)->count() : 0,
        ];

        $usage = [];

        foreach (self::limits() as $resource => $limit) {
            $count = $used[$resource] ?? 0;
            $percent = $limit > 0 ? min(100, (int) round($count / $limit * 100)) : 100;

            $usage[$resource] = [
                'used' => $count,
                'limit' => $limit,
                'percent' => $percent,
                'near_limit' => $limit > 0 && $count >= $limit * 0.8,
                'at_limit' => $limit > 0 && $count >= $limit,
            ];
        }

        return $usage;
    }

    /**
     * @throws ValidationException
     */
    public static function ensure(string $resource): void
    {
        $usage = self::usage()[$resource] ?? null;

        if (! $usage || ! $usage['at_limit']) {
            return;
        }

        $label = str_replace('_', ' ', $resource);

        throw ValidationException::withMessages([
            $resource => "You have reached the free plan limit of {$usage['limit']} {$label}.",
        ]);
    }
}
