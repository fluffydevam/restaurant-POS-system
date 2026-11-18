import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Field, FormError, Input, Select } from '../components/Form'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'
import { errorMessage, menuApi, orderApi } from '../lib/api'
import { formatMoney, formatTime } from '../lib/money'
import type { MenuItem, Order, OrderType } from '../lib/types'

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'dine_in', label: 'Dine in' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'delivery', label: 'Delivery' },
]

export function PosPage() {
  const { user, membership, tenant, tenantId, branches } = useWorkspace()
  const queryClient = useQueryClient()

  const [cart, setCart] = useState<Record<number, number>>({})
  const [orderType, setOrderType] = useState<OrderType>('dine_in')
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | number>('all')
  const [search, setSearch] = useState('')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [tendered, setTendered] = useState('')
  const [receipt, setReceipt] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)

  const categories = useQuery({
    queryKey: ['menu', tenantId, 'categories'],
    queryFn: () => menuApi.categories(tenantId),
    enabled: tenantId > 0,
  })

  const items = useQuery({
    queryKey: ['menu', tenantId, 'items'],
    queryFn: () => menuApi.items(tenantId),
    enabled: tenantId > 0,
  })

  const allItems = items.data?.data ?? []
  const currency = tenant?.currency ?? 'USD'

  const cartLines = useMemo(
    () =>
      allItems
        .filter((item) => (cart[item.id] ?? 0) > 0)
        .map((item) => ({ item, quantity: cart[item.id] })),
    [allItems, cart],
  )

  const totalCents = cartLines.reduce((sum, line) => sum + line.item.price_cents * line.quantity, 0)
  const itemCount = cartLines.reduce((sum, line) => sum + line.quantity, 0)

  const term = search.trim().toLowerCase()
  const visibleItems = allItems.filter((item) => {
    if (!item.is_active) return false
    if (categoryFilter !== 'all' && item.menu_category_id !== categoryFilter) return false
    if (!term) return true

    return `${item.name} ${item.description ?? ''} ${item.sku ?? ''}`.toLowerCase().includes(term)
  })

  const checkout = useMutation({
    mutationFn: async (paidCents: number) => {
      const created = await orderApi.create(tenantId, {
        type: orderType,
        customer_name: customerName.trim() || null,
        notes: notes.trim() || null,
        items: cartLines.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
        })),
      })

      return orderApi.pay(tenantId, created.order.id, paidCents)
    },
    onSuccess: (response) => {
      setReceipt(response.order)
      setCart({})
      setCustomerName('')
      setNotes('')
      setPaymentOpen(false)
      setTendered('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['order-summary', tenantId] })
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  if (membership && membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  if (!tenant) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        Loading register…
      </div>
    )
  }

  function changeQuantity(item: MenuItem, delta: number) {
    setCart((current) => {
      const next = Math.max(0, (current[item.id] ?? 0) + delta)
      const updated = { ...current }

      if (next === 0) {
        delete updated[item.id]
      } else {
        updated[item.id] = next
      }

      return updated
    })
  }

  function openPayment() {
    setError(null)
    setTendered((totalCents / 100).toFixed(2))
    setPaymentOpen(true)
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(tendered)

    if (!Number.isFinite(amount)) {
      setError('Enter a valid cash amount.')
      return
    }

    checkout.mutate(Math.round(amount * 100))
  }

  const tenderedCents = Math.round((Number(tendered) || 0) * 100)
  const changeCents = Math.max(0, tenderedCents - totalCents)
  const changeDue = tenderedCents < totalCents
  const quickAmounts = [totalCents, totalCents + 500, totalCents + 1000, totalCents + 2000, totalCents + 5000]

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="pos"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-300">Register</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Point of sale</h2>
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the menu"
              className="sm:max-w-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <CategoryChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
              All items
            </CategoryChip>
            {(categories.data ?? []).map((category) => (
              <CategoryChip
                key={category.id}
                active={categoryFilter === category.id}
                onClick={() => setCategoryFilter(category.id)}
              >
                {category.name}
              </CategoryChip>
            ))}
          </div>

          {items.isError ? <FormError message={errorMessage(items.error)} /> : null}

          {items.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, key) => (
                <div key={key} className="h-28 animate-pulse rounded-xl border border-white/5 bg-slate-900/40" />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center text-sm text-slate-500">
              No menu items match. Add items from the Menu page first.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {visibleItems.map((item) => {
                const quantity = cart[item.id] ?? 0
                const disabled = !item.is_available

                return (
                  <button
                    type="button"
                    key={item.id}
                    disabled={disabled}
                    onClick={() => changeQuantity(item, 1)}
                    className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition ${
                      disabled
                        ? 'cursor-not-allowed border-white/5 bg-slate-900/40 opacity-50'
                        : 'border-white/10 bg-slate-900/60 hover:border-amber-400/40 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="shrink-0 text-sm font-semibold text-amber-300">
                          {formatMoney(item.price_cents, currency)}
                        </p>
                      </div>
                      {item.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.description}</p>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      {disabled ? (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-200">
                          Sold out
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">
                          {item.sku ?? 'Tap to add'}
                        </span>
                      )}
                      {quantity > 0 ? (
                        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-950">
                          {quantity}
                        </span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Current order</h3>
              <span className="text-xs text-slate-500">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Order type">
                <Select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)}>
                  {ORDER_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Customer name" hint="Optional.">
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Name or table"
                  maxLength={120}
                />
              </Field>
            </div>

            {cartLines.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-white/10 px-3 py-8 text-center text-sm text-slate-500">
                Tap menu items to start an order.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {cartLines.map(({ item, quantity }) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-white/5 bg-white/5 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatMoney(item.price_cents, currency)} each
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-amber-300">
                        {formatMoney(item.price_cents * quantity, currency)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <QuantityButton onClick={() => changeQuantity(item, -1)}>−</QuantityButton>
                      <span className="w-8 text-center text-sm">{quantity}</span>
                      <QuantityButton onClick={() => changeQuantity(item, 1)}>+</QuantityButton>
                      <button
                        type="button"
                        className="ml-auto text-xs text-slate-500 hover:text-red-300"
                        onClick={() => setCart((current) => {
                          const updated = { ...current }
                          delete updated[item.id]
                          return updated
                        })}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Field label="Order notes" hint="Optional. Allergies, packing, etc.">
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
                placeholder="Notes for the kitchen"
                className="mt-3"
              />
            </Field>

            <div className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>{formatMoney(totalCents, currency)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="text-amber-300">{formatMoney(totalCents, currency)}</span>
              </div>
            </div>

            <FormError message={error} />

            <Button
              type="button"
              className="mt-4 w-full"
              disabled={cartLines.length === 0}
              onClick={openPayment}
            >
              Charge cash · {formatMoney(totalCents, currency)}
            </Button>
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-slate-500">
            Cash payments only in v1. The order is created and settled in one step, and the change
            due is recorded on the receipt.
          </p>
        </aside>
      </div>

      {paymentOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !checkout.isPending) setPaymentOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Cash payment</h3>
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-white"
                disabled={checkout.isPending}
                onClick={() => setPaymentOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-center">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Amount due</p>
              <p className="mt-1 text-3xl font-semibold text-amber-300">
                {formatMoney(totalCents, currency)}
              </p>
            </div>

            <form onSubmit={submitPayment} className="mt-4 space-y-4">
              <Field label={`Cash received (${currency})`}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value)}
                  autoFocus
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                {quickAmounts.map((amount, index) => (
                  <button
                    key={`${amount}-${index}`}
                    type="button"
                    onClick={() => setTendered((amount / 100).toFixed(2))}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
                  >
                    {index === 0 ? 'Exact' : formatMoney(amount, currency)}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-sm">
                <span className="text-slate-400">Change due</span>
                <span className={changeDue ? 'font-semibold text-red-300' : 'font-semibold text-emerald-300'}>
                  {changeDue
                    ? `Short ${formatMoney(totalCents - tenderedCents, currency)}`
                    : formatMoney(changeCents, currency)}
                </span>
              </div>

              <FormError message={error} />

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  disabled={checkout.isPending}
                  onClick={() => setPaymentOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={checkout.isPending || changeDue}>
                  {checkout.isPending ? 'Settling…' : 'Complete sale'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {receipt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center shadow-2xl">
            <p className="text-xs uppercase tracking-widest text-emerald-300">Payment received</p>
            <p className="mt-2 text-2xl font-semibold">{receipt.order_number}</p>
            <p className="mt-1 text-xs text-slate-500">{formatTime(receipt.paid_at)}</p>

            <dl className="mt-5 space-y-2 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-left text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Items</dt>
                <dd>{receipt.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Total</dt>
                <dd>{formatMoney(receipt.total_cents, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Cash received</dt>
                <dd>{formatMoney(receipt.amount_paid_cents, currency)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Change</dt>
                <dd className="text-amber-300">{formatMoney(receipt.change_cents, currency)}</dd>
              </div>
            </dl>

            <Button type="button" className="mt-5 w-full" onClick={() => setReceipt(null)}>
              New order
            </Button>
          </div>
        </div>
      ) : null}
    </WorkspaceLayout>
  )
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'bg-amber-400 text-slate-950'
          : 'border border-white/10 text-slate-300 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}

function QuantityButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-sm text-slate-200 transition hover:bg-white/10"
    >
      {children}
    </button>
  )
}
