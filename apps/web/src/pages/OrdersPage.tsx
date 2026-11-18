import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, FormError, Input } from '../components/Form'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'
import { errorMessage, orderApi } from '../lib/api'
import { formatDateTime, formatMoney } from '../lib/money'
import type { Order, OrderStatus } from '../lib/types'

type StatusFilter = 'all' | OrderStatus

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Completed', value: 'completed' },
  { label: 'Voided', value: 'voided' },
]

export function OrdersPage() {
  const { user, membership, tenant, tenantId, branches } = useWorkspace()
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState<StatusFilter>('all')
  const [date, setDate] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currency = tenant?.currency ?? 'USD'
  const canVoid = membership?.role === 'owner' || membership?.role === 'manager'

  const summary = useQuery({
    queryKey: ['order-summary', tenantId],
    queryFn: () => orderApi.summary(tenantId),
    enabled: tenantId > 0,
  })

  const orders = useQuery({
    queryKey: ['orders', tenantId, filter, date, search, page],
    queryFn: () =>
      orderApi.list(tenantId, {
        status: filter === 'all' ? undefined : filter,
        date: date || undefined,
        search: search || undefined,
        page,
      }),
    enabled: tenantId > 0,
    placeholderData: keepPreviousData,
  })

  const detail = useQuery({
    queryKey: ['orders', tenantId, 'detail', detailId],
    queryFn: () => orderApi.show(tenantId, detailId as number),
    enabled: tenantId > 0 && detailId !== null,
  })

  const voidOrder = useMutation({
    mutationFn: (order: Order) => orderApi.void(tenantId, order.id),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      setDetailId(null)
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
        Loading orders…
      </div>
    )
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function changeFilter(value: StatusFilter) {
    setFilter(value)
    setPage(1)
  }

  function changeDate(value: string) {
    setDate(value)
    setPage(1)
  }

  function confirmVoid(order: Order) {
    if (!window.confirm(`Void ${order.order_number}? This cannot be undone.`)) return
    setError(null)
    voidOrder.mutate(order)
  }

  const rows = orders.data?.data ?? []
  const meta = orders.data?.meta
  const current = detail.data?.order ?? rows.find((row) => row.id === detailId) ?? null

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="orders"
    >
      <div className="space-y-6">
        <section>
          <p className="text-xs uppercase tracking-widest text-amber-300">Ledger</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Orders</h2>
          <p className="mt-1 text-sm text-slate-400">
            Every sale is snapshotted at the moment it is rung up, so menu price changes never
            rewrite history.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Sales today" value={formatMoney(summary.data?.sales_today_cents ?? 0, currency)} accent />
          <Stat label="Orders today" value={String(summary.data?.orders_today ?? 0)} />
          <Stat label="Open orders" value={String(summary.data?.open_orders ?? 0)} />
          <Stat label="Average order" value={formatMoney(summary.data?.average_order_cents ?? 0, currency)} />
        </section>

        <section className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeFilter(option.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === option.value
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Input
            type="date"
            value={date}
            onChange={(event) => changeDate(event.target.value)}
            className="w-40"
          />

          <form className="ml-auto flex gap-2" onSubmit={submitSearch}>
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search order number or customer"
              className="w-56"
            />
            <Button type="submit" variant="ghost">
              Search
            </Button>
          </form>
        </section>

        <FormError message={error} />
        {notice ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}
        {orders.isError ? <FormError message={errorMessage(orders.error)} /> : null}

        {orders.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-20 animate-pulse rounded-xl border border-white/5 bg-slate-900/40" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-300">No orders found</p>
            <p className="mt-1 text-sm text-slate-500">
              Start selling from the point-of-sale screen, or widen the filters.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{order.order_number}</p>
                    <OrderStatusBadge status={order.status} label={order.status_label} />
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {order.type_label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(order.placed_at)} · {order.items_count ?? 0} item
                    {(order.items_count ?? 0) === 1 ? '' : 's'}
                    {order.customer_name ? ` · ${order.customer_name}` : ''}
                    {order.cashier?.name ? ` · ${order.cashier.name}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-amber-300">
                    {formatMoney(order.total_cents, currency)}
                  </p>
                  <Button type="button" variant="ghost" onClick={() => setDetailId(order.id)}>
                    View
                  </Button>
                  {canVoid && order.status === 'open' ? (
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-red-300"
                      disabled={voidOrder.isPending}
                      onClick={() => confirmVoid(order)}
                    >
                      Void
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {meta && meta.last_page > 1 ? (
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {meta.current_page} of {meta.last_page} · {meta.total} orders
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={meta.current_page <= 1 || orders.isFetching}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={meta.current_page >= meta.last_page || orders.isFetching}
                onClick={() => setPage((currentPage) => currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {detailId !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailId(null)
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">Order</p>
                <h3 className="text-xl font-semibold">{current?.order_number ?? 'Loading…'}</h3>
              </div>
              <button type="button" className="text-sm text-slate-500 hover:text-white" onClick={() => setDetailId(null)}>
                Close
              </button>
            </div>

            {detail.isLoading ? (
              <p className="mt-6 text-sm text-slate-500">Loading order…</p>
            ) : current ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <OrderStatusBadge status={current.status} label={current.status_label} />
                  <span>{current.type_label}</span>
                  <span>· {formatDateTime(current.placed_at)}</span>
                  {current.customer_name ? <span>· {current.customer_name}</span> : null}
                </div>

                <ul className="mt-5 space-y-2">
                  {(current.items ?? []).map((line) => (
                    <li
                      key={line.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm">
                          <span className="text-slate-400">{line.quantity}× </span>
                          {line.name}
                        </p>
                        {line.notes ? <p className="text-xs text-slate-500">{line.notes}</p> : null}
                      </div>
                      <p className="text-sm">{formatMoney(line.line_total_cents, currency)}</p>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-sm">
                  <Row label="Subtotal" value={formatMoney(current.subtotal_cents, currency)} />
                  {current.service_charge_cents > 0 ? (
                    <Row
                      label="Service charge"
                      value={formatMoney(current.service_charge_cents, currency)}
                    />
                  ) : null}
                  {current.tax_cents > 0 ? (
                    <Row label="Tax" value={formatMoney(current.tax_cents, currency)} />
                  ) : null}
                  <Row label="Total" value={formatMoney(current.total_cents, currency)} strong />
                  {current.status === 'completed' ? (
                    <>
                      <Row label="Cash received" value={formatMoney(current.amount_paid_cents, currency)} />
                      <Row label="Change" value={formatMoney(current.change_cents, currency)} />
                    </>
                  ) : null}
                  {current.cashier?.name ? <Row label="Cashier" value={current.cashier.name} /> : null}
                  <Row label="Paid at" value={formatDateTime(current.paid_at)} />
                </dl>

                {current.notes ? (
                  <p className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400">
                    {current.notes}
                  </p>
                ) : null}

                {canVoid && current.status === 'open' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-5 w-full"
                    disabled={voidOrder.isPending}
                    onClick={() => confirmVoid(current)}
                  >
                    {voidOrder.isPending ? 'Voiding…' : 'Void this order'}
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="mt-6 text-sm text-red-300">This order could not be loaded.</p>
            )}
          </div>
        </div>
      ) : null}
    </WorkspaceLayout>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${accent ? 'text-amber-300' : 'text-white'}`}>{value}</p>
    </div>
  )
}

function OrderStatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  const styles: Record<OrderStatus, string> = {
    open: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    voided: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles[status]}`}>
      {label}
    </span>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className={strong ? 'font-semibold text-amber-300' : 'text-slate-200'}>{value}</dd>
    </div>
  )
}
