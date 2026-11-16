<?php

namespace App\Models\Scopes;

use App\Support\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if ($tenantId = app(TenantContext::class)->id()) {
            $builder->where($model->getTable().'.tenant_id', $tenantId);
        } else {
            // Fail closed: never leak tenant-owned rows when no tenant is selected.
            $builder->whereRaw('1 = 0');
        }
    }
}
