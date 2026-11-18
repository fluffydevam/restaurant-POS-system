<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MembershipResource;
use App\Http\Resources\TenantResource;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TenantController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $tenant = app(TenantContext::class)->tenant();
        $membership = $request->attributes->get('membership');

        $tenant->load('branches');

        return response()->json([
            'tenant' => new TenantResource($tenant),
            'membership' => new MembershipResource($membership),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $tenant = app(TenantContext::class)->tenant();

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'country' => ['sometimes', 'nullable', 'string', 'size:2'],
            'timezone' => ['sometimes', 'string', 'timezone'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'receipt_footer' => ['sometimes', 'nullable', 'string', 'max:300'],
            'tax_enabled' => ['sometimes', 'boolean'],
            'tax_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'service_charge_enabled' => ['sometimes', 'boolean'],
            'service_charge_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'onboarding_completed' => ['sometimes', 'boolean'],
        ]);

        $settings = $tenant->settings ?? [];

        foreach (['phone', 'receipt_footer'] as $key) {
            if (array_key_exists($key, $validated)) {
                $settings[$key] = $validated[$key];
            }
        }

        if (array_key_exists('tax_enabled', $validated) || array_key_exists('tax_rate', $validated)) {
            $settings['tax'] = [
                'enabled' => $validated['tax_enabled'] ?? ($settings['tax']['enabled'] ?? false),
                'rate_bps' => array_key_exists('tax_rate', $validated)
                    ? (int) round($validated['tax_rate'] * 100)
                    : (int) ($settings['tax']['rate_bps'] ?? 0),
            ];
        }

        if (array_key_exists('service_charge_enabled', $validated) || array_key_exists('service_charge_rate', $validated)) {
            $settings['service_charge'] = [
                'enabled' => $validated['service_charge_enabled'] ?? ($settings['service_charge']['enabled'] ?? false),
                'rate_bps' => array_key_exists('service_charge_rate', $validated)
                    ? (int) round($validated['service_charge_rate'] * 100)
                    : (int) ($settings['service_charge']['rate_bps'] ?? 0),
            ];
        }

        if (array_key_exists('onboarding_completed', $validated)) {
            $settings['onboarding'] = [
                'completed' => (bool) $validated['onboarding_completed'],
                'completed_at' => $validated['onboarding_completed'] ? now()->toISOString() : null,
            ];
        }

        $tenant->update([
            'name' => $validated['name'] ?? $tenant->name,
            'country' => array_key_exists('country', $validated) ? $validated['country'] : $tenant->country,
            'timezone' => $validated['timezone'] ?? $tenant->timezone,
            'currency' => isset($validated['currency']) ? mb_strtoupper($validated['currency']) : $tenant->currency,
            'settings' => $settings,
        ]);

        return response()->json([
            'message' => 'Restaurant settings saved.',
            'tenant' => new TenantResource($tenant->load('branches')),
        ]);
    }
}
