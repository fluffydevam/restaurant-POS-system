<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MenuItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'menu_category_id' => $this->menu_category_id,
            'category' => new MenuCategoryResource($this->whenLoaded('category')),
            'name' => $this->name,
            'description' => $this->description,
            'sku' => $this->sku,
            'price_cents' => $this->price_cents,
            'image_url' => $this->image_url,
            'sort_order' => $this->sort_order,
            'is_active' => $this->is_active,
            'is_available' => $this->is_available,
        ];
    }
}
