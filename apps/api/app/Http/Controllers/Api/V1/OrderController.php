<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\OrderStatus;
use App\Enums\OrderType;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Branch;
use App\Models\MenuItem;
use App\Models\Order;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'status' => ['nullable', 'in:open,completed,voided'],
            'date' => ['nullable', 'date'],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $orders = Order::query()
            ->with(['branch', 'cashier'])
            ->withCount('items')
            ->when(
                isset($validated['status']),
                fn ($query) => $query->where('status', $validated['status'])
            )
            ->when(
                isset($validated['date']),
                fn ($query) => $query->whereDate('placed_at', $validated['date'])
            )
            ->when(
                filled($validated['search'] ?? null),
                function ($query) use ($validated) {
                    $term = '%'.mb_strtolower(trim($validated['search'])).'%';

                    $query->where(function ($inner) use ($term) {
                        $inner->whereRaw('lower(order_number) like ?', [$term])
                            ->orWhereRaw('lower(coalesce(customer_name, \'\')) like ?', [$term]);
                    });
                }
            )
            ->latest('placed_at')
            ->paginate((int) ($validated['per_page'] ?? 25))
            ->withQueryString();

        return OrderResource::collection($orders);
    }

    public function summary(): JsonResponse
    {
        $tenant = app(TenantContext::class)->tenant();
        $timezone = $tenant?->timezone ?: config('app.timezone');
        $localStart = now($timezone)->startOfDay();
        $localEnd = $localStart->copy()->addDay();
        $start = $localStart->copy()->utc();
        $end = $localEnd->copy()->utc();

        $completed = Order::query()
            ->where('status', OrderStatus::Completed)
            ->whereBetween('placed_at', [$start, $end]);

        $ordersToday = (clone $completed)->count();
        $salesToday = (int) (clone $completed)->sum('total_cents');
        $itemsToday = (int) DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.tenant_id', $tenant?->id)
            ->where('orders.status', OrderStatus::Completed->value)
            ->whereBetween('orders.placed_at', [$start, $end])
            ->sum('order_items.quantity');

        return response()->json([
            'date' => $localStart->toDateString(),
            'orders_today' => $ordersToday,
            'sales_today_cents' => $salesToday,
            'items_sold_today' => $itemsToday,
            'open_orders' => Order::query()->where('status', OrderStatus::Open)->count(),
            'average_order_cents' => $ordersToday > 0 ? (int) round($salesToday / $ordersToday) : 0,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app(TenantContext::class)->id();

        $validated = $request->validate([
            'type' => ['nullable', Rule::enum(OrderType::class)],
            'branch_id' => [
                'nullable',
                Rule::exists('branches', 'id')->where('tenant_id', $tenantId),
            ],
            'customer_name' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.menu_item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
            'items.*.notes' => ['nullable', 'string', 'max:200'],
        ]);

        $requested = collect($validated['items']);

        $menuItems = MenuItem::query()
            ->whereIn('id', $requested->pluck('menu_item_id')->unique())
            ->get()
            ->keyBy('id');

        $problems = [];
        $lines = [];

        foreach ($requested as $line) {
            /** @var MenuItem|null $menuItem */
            $menuItem = $menuItems->get($line['menu_item_id']);

            if (! $menuItem) {
                $problems['items'][] = 'One of the selected items is no longer on the menu.';

                continue;
            }

            if (! $menuItem->is_active) {
                $problems['items'][] = $menuItem->name.' is not active on the menu.';

                continue;
            }

            if (! $menuItem->is_available) {
                $problems['items'][] = $menuItem->name.' is currently unavailable.';

                continue;
            }

            $quantity = (int) $line['quantity'];

            $lines[] = [
                'menu_item_id' => $menuItem->id,
                'name' => $menuItem->name,
                'sku' => $menuItem->sku,
                'unit_price_cents' => $menuItem->price_cents,
                'quantity' => $quantity,
                'line_total_cents' => $menuItem->price_cents * $quantity,
                'notes' => $line['notes'] ?? null,
            ];
        }

        if ($problems !== []) {
            throw ValidationException::withMessages($problems);
        }

        $subtotal = array_sum(array_column($lines, 'line_total_cents'));
        $settings = app(TenantContext::class)->tenant()?->settings ?? [];

        $serviceRate = ($settings['service_charge']['enabled'] ?? false)
            ? (int) ($settings['service_charge']['rate_bps'] ?? 0)
            : 0;
        $taxRate = ($settings['tax']['enabled'] ?? false)
            ? (int) ($settings['tax']['rate_bps'] ?? 0)
            : 0;

        $serviceCharge = (int) round($subtotal * $serviceRate / 10000);
        $tax = (int) round(($subtotal + $serviceCharge) * $taxRate / 10000);
        $total = $subtotal + $serviceCharge + $tax;

        $order = DB::transaction(function () use ($validated, $lines, $subtotal, $serviceCharge, $tax, $total, $tenantId, $request): Order {
            $branchId = $validated['branch_id']
                ?? Branch::query()->where('is_default', true)->value('id')
                ?? Branch::query()->value('id');

            $lastNumber = Order::query()
                ->where('tenant_id', $tenantId)
                ->orderByDesc('id')
                ->value('order_number');

            $sequence = $lastNumber
                ? ((int) substr($lastNumber, 4)) + 1
                : 1;

            $order = Order::create([
                'branch_id' => $branchId,
                'created_by' => $request->user()?->id,
                'order_number' => 'ORD-'.str_pad((string) $sequence, 5, '0', STR_PAD_LEFT),
                'status' => OrderStatus::Open,
                'type' => $validated['type'] ?? OrderType::DineIn->value,
                'customer_name' => $validated['customer_name'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'subtotal_cents' => $subtotal,
                'discount_cents' => 0,
                'service_charge_cents' => $serviceCharge,
                'tax_cents' => $tax,
                'total_cents' => $total,
                'amount_paid_cents' => 0,
                'change_cents' => 0,
                'placed_at' => now(),
            ]);

            $order->items()->createMany($lines);

            return $order;
        });

        return response()->json([
            'message' => $order->order_number.' was opened.',
            'order' => $this->present($order),
        ], 201);
    }

    public function show(int $order): JsonResponse
    {
        $order = Order::query()
            ->with(['items', 'branch', 'cashier'])
            ->withCount('items')
            ->findOrFail($order);

        return response()->json(['order' => new OrderResource($order)]);
    }

    public function pay(Request $request, int $order): JsonResponse
    {
        $order = Order::query()->findOrFail($order);

        $validated = $request->validate([
            'amount_paid_cents' => ['required', 'integer', 'min:0', 'max:1000000000'],
        ]);

        if (! $order->isOpen()) {
            return response()->json([
                'message' => 'Only open orders can be paid.',
                'code' => 'order_not_open',
            ], 422);
        }

        if ($validated['amount_paid_cents'] < $order->total_cents) {
            return response()->json([
                'message' => 'Cash received is less than the order total.',
                'code' => 'insufficient_payment',
                'shortfall_cents' => $order->total_cents - $validated['amount_paid_cents'],
            ], 422);
        }

        $order->update([
            'status' => OrderStatus::Completed,
            'payment_method' => 'cash',
            'amount_paid_cents' => $validated['amount_paid_cents'],
            'change_cents' => $validated['amount_paid_cents'] - $order->total_cents,
            'paid_at' => now(),
        ]);

        return response()->json([
            'message' => 'Payment received for '.$order->order_number.'.',
            'order' => $this->present($order),
        ]);
    }

    public function void(int $order): JsonResponse
    {
        $order = Order::query()->findOrFail($order);

        if (! $order->isOpen()) {
            return response()->json([
                'message' => 'Only open orders can be voided.',
                'code' => 'order_not_open',
            ], 422);
        }

        $order->update(['status' => OrderStatus::Voided]);

        return response()->json([
            'message' => $order->order_number.' was voided.',
            'order' => $this->present($order),
        ]);
    }

    private function present(Order $order): OrderResource
    {
        return new OrderResource(
            $order->load(['items', 'branch', 'cashier'])->loadCount('items')
        );
    }
}
