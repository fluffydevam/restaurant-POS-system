<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminTenantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $owner = $this->whenLoaded('memberships', function () {
            $membership = $this->memberships->first();

            return $membership ? [
                'name' => $membership->user?->name,
                'email' => $membership->user?->email,
                'email_verified_at' => $membership->user?->email_verified_at?->toISOString(),
            ] : null;
        });

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
            'branches_count' => $this->branches_count ?? 0,
            'suspended_reason' => $this->suspended_reason,
            'approved_at' => $this->approved_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'owner' => $owner,
        ];
    }
}
