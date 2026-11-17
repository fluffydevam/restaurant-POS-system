import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { adminApi, authApi, errorMessage, primaryMembership } from '../lib/api'
import { useAuth } from '../store/auth'
import { Button, FormError } from '../components/Form'
import type { AdminTenant, TenantStatus } from '../lib/types'

type StatusFilter = TenantStatus | 'all'

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'Pending', value: 'pending_approval' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'All', value: 'all' },
]

type AdminAction =
  | { type: 'approve'; tenant: AdminTenant }
  | { type: 'suspend'; tenant: AdminTenant; reason: string }
  | { type: 'reactivate'; tenant: AdminTenant }

export function AdminPage() {
  const user = useAuth((state) => state.user)
  const clear = useAuth((state) => state.clear)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState<StatusFilter>('pending_approval')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const membership = primaryMembership(user)

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: adminApi.stats,
    enabled: user?.is_platform_admin === true,
  })

  const tenants = useQuery({
    queryKey: ['admin', 'tenants', filter, search, page],
    queryFn: () =>
      adminApi.tenants({
        status: filter === 'all' ? undefined : filter,
        search: search || undefined,
        page,
      }),
    enabled: user?.is_platform_admin === true,
    placeholderData: keepPreviousData,
  })

  const action = useMutation({
    mutationFn: (payload: AdminAction) => {
      switch (payload.type) {
        case 'approve':
          return adminApi.approve(payload.tenant.id)
        case 'suspend':
          return adminApi.suspend(payload.tenant.id, payload.reason)
        case 'reactivate':
          return adminApi.reactivate(payload.tenant.id)
      }
    },
    onSuccess: (data) => {
      setError(null)
      setNotice(data.message)
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (requestError) => {
      setNotice(null)
      setError(errorMessage(requestError))
    },
  })

  if (user && !user.is_platform_admin) {
    return <Navigate to="/" replace />
  }

  function approve(tenant: AdminTenant) {
    setNotice(null)
    action.mutate({ type: 'approve', tenant })
  }

  function suspend(tenant: AdminTenant) {
    const reason = window.prompt(
      `Why is ${tenant.name} being suspended? Leave blank for no reason shown to the owner.`,
      tenant.suspended_reason ?? '',
    )

    if (reason === null) return

    setNotice(null)
    action.mutate({ type: 'suspend', tenant, reason })
  }

  function reactivate(tenant: AdminTenant) {
    setNotice(null)
    action.mutate({ type: 'reactivate', tenant })
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

  async function signOut() {
    try {
      await authApi.logout()
    } finally {
      clear()
      navigate('/login', { replace: true })
    }
  }

  const rows = tenants.data?.data ?? []
  const meta = tenants.data?.meta

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-white/5 bg-slate-900/50">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-base font-black text-slate-950">
              R
            </span>
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Platform admin</p>
              <p className="text-sm font-semibold">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {membership ? (
              <Link
                to="/"
                className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/5"
              >
                {membership.tenant.name}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/5"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 lg:px-8">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Approval queue</h1>
          <p className="mt-1 text-sm text-slate-400">
            Every restaurant application is reviewed manually before the workspace unlocks.
          </p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Pending review" value={stats.data?.pending} accent />
          <Stat label="Active" value={stats.data?.active} />
          <Stat label="Suspended" value={stats.data?.suspended} />
          <Stat label="Total tenants" value={stats.data?.total} />
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changeFilter(item.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === item.value
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <form className="flex w-full gap-2 sm:w-auto" onSubmit={submitSearch}>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name, slug, or email"
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/20 sm:w-64"
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

        {tenants.isError ? <FormError message={errorMessage(tenants.error)} /> : null}

        {tenants.isLoading ? (
          <ul className="space-y-3">
            {[0, 1, 2].map((key) => (
              <li key={key} className="h-24 animate-pulse rounded-xl border border-white/5 bg-slate-900/40" />
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-300">Nothing here</p>
            <p className="mt-1 text-sm text-slate-500">
              {filter === 'pending_approval'
                ? 'No applications are waiting for review.'
                : 'No restaurants match this filter.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((tenant) => {
              const busy = action.isPending && action.variables?.tenant.id === tenant.id

              return (
                <li
                  key={tenant.id}
                  className="rounded-xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-white/20"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{tenant.name}</p>
                        <StatusBadge status={tenant.status} label={tenant.status_label} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        /t/{tenant.slug} · {tenant.country ?? '—'} · {tenant.timezone}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        {tenant.owner?.name ?? 'No owner'}{' '}
                        {tenant.owner?.email ? (
                          <span className="text-slate-500">· {tenant.owner.email}</span>
                        ) : null}
                        {tenant.owner && !tenant.owner.email_verified_at ? (
                          <span className="ml-2 rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                            Email unverified
                          </span>
                        ) : null}
                      </p>
                      {tenant.suspended_reason ? (
                        <p className="mt-2 text-xs text-red-300">Reason: {tenant.suspended_reason}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="text-[11px] text-slate-500">
                        Applied {formatDate(tenant.created_at)} · {tenant.branches_count} branch
                        {tenant.branches_count === 1 ? '' : 'es'}
                      </p>

                      <div className="flex flex-wrap justify-end gap-2">
                        {tenant.status === 'pending_approval' ? (
                          <Button type="button" disabled={busy} onClick={() => approve(tenant)}>
                            {busy ? 'Working…' : 'Approve'}
                          </Button>
                        ) : null}

                        {tenant.status === 'active' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => suspend(tenant)}
                          >
                            {busy ? 'Working…' : 'Suspend'}
                          </Button>
                        ) : null}

                        {tenant.status === 'suspended' || tenant.status === 'cancelled' ? (
                          <Button type="button" disabled={busy} onClick={() => reactivate(tenant)}>
                            {busy ? 'Working…' : 'Reactivate'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {meta && meta.last_page > 1 ? (
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {meta.current_page} of {meta.last_page} · {meta.total} tenants
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={meta.current_page <= 1 || tenants.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={meta.current_page >= meta.last_page || tenants.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accent ? 'text-amber-300' : 'text-white'}`}>
        {value ?? '—'}
      </p>
    </div>
  )
}

function StatusBadge({ status, label }: { status: TenantStatus; label: string }) {
  const styles: Record<TenantStatus, string> = {
    pending_approval: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    suspended: 'border-red-500/30 bg-red-500/10 text-red-200',
    cancelled: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  }

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles[status]}`}
    >
      {label}
    </span>
  )
}

function formatDate(value: string | null): string {
  if (!value) return '—'

  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
