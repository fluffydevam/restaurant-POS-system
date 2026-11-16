<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MembershipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'branch_id' => $this->branch_id,
            'role' => $this->role,
            'is_active' => $this->is_active,
            'tenant' => new TenantResource($this->whenLoaded('tenant')),
        ];
    }
}
