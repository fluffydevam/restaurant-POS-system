<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'restaurant_name' => ['required', 'string', 'max:120'],
            'country' => ['required', 'string', 'size:2'],
            'timezone' => ['required', 'string', 'timezone'],
            'restaurant_type' => ['required', 'in:cafe,fast_food,fine_dining,food_truck,other'],
        ];
    }
}
