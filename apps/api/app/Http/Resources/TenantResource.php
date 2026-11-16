<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TenantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'country' => $this->country,
            'timezone' => $this->timezone,
            'currency' => $this->currency,
            'settings' => $this->settings,
            'approved_at' => $this->approved_at?->toISOString(),
            'branches' => BranchResource::collection($this->whenLoaded('branches')),
        ];
    }
}
