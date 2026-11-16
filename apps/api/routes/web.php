<?php

use Illuminate\Support\Facades\Route;

// This is an API-only application. The root is redirected so that
// `php artisan route:cache` works (closure routes cannot be serialised).
Route::redirect('/', '/up');
