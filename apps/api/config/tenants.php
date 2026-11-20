<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Free-tier tenant caps
    |--------------------------------------------------------------------------
    |
    | These are soft caps: the API warns as a tenant approaches a limit and
    | rejects new records once it is reached. Raise them here when the free
    | hosting footprint allows it, or per environment with the variables.
    |
    */
    'limits' => [
        'branches' => (int) env('TENANT_LIMIT_BRANCHES', 3),
        'tables' => (int) env('TENANT_LIMIT_TABLES', 30),
        'staff' => (int) env('TENANT_LIMIT_STAFF', 10),
        'menu_items' => (int) env('TENANT_LIMIT_MENU_ITEMS', 150),
    ],
];
