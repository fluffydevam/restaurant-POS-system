import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { authApi, primaryMembership } from '../lib/api'
import { useAuth } from '../store/auth'

const NAV_ITEMS = [
  { label: 'Point of sale', hint: 'Next milestone' },
  { label: 'Orders', hint: 'Next milestone' },
  { label: 'Menu', hint: 'Next milestone' },
  { label: 'Tables', hint: 'Next milestone' },
  { label: 'Staff', hint: 'Next milestone' },
  { label: 'Settings', hint: 'Next milestone' },
]

export function DashboardPage() {
  const user = useAuth((state) => state.user)
  const clear = useAuth((state) => state.clear)
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const membership = primaryMembership(user)
  const tenantId = membership?.tenant_id ?? 0

  const { data, isLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => authApi.tenant(tenantId),
    enabled: tenantId > 0,
  })

  if (!membership) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center">
          <h1 className="text-lg font-semibold">No restaurant account</h1>
          <p className="mt-2 text-sm text-slate-400">
            This login is not linked to a restaurant yet.
          </p>
          <button
            className="mt-4 text-sm font-medium text-amber-300"
            onClick={() => {
              clear()
              navigate('/login', { replace: true })
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  const tenant = data?.tenant ?? membership.tenant
  const branches = data?.tenant.branches ?? []
  const primaryBranch = branches.find((branch) => branch.is_default) ?? branches[0]

  async function signOut() {
    setSigningOut(true)
    try {
      await authApi.logout()
    } finally {
      clear()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-slate-900/50 p-4 lg:flex">
          <div className="flex items-center gap-3 px-2 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-400 text-base font-black text-slate-950">
              R
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{tenant.name}</p>
              <p className="truncate text-xs text-slate-500">Free forever</p>
            </div>
          </div>

          <nav className="mt-4 space-y-1">
            <div className="flex items-center justify-between rounded-lg bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200">
              Dashboard
            </div>
            {NAV_ITEMS.map((item) => (
              <div
                key={item.label}
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-500"
                title={item.hint}
              >
                <span>{item.label}</span>
                <span className="text-[10px] uppercase tracking-wide">Soon</span>
              </div>
            ))}
          </nav>

          <div className="mt-auto rounded-xl border border-white/5 bg-white/5 p-3">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
            <button
              className="mt-3 text-xs font-medium text-slate-300 hover:text-white"
              disabled={signingOut}
              onClick={signOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <header className="flex items-center justify-between border-b border-white/5 px-5 py-4 lg:px-8">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">Workspace</p>
              <h1 className="text-xl font-semibold tracking-tight">{tenant.name}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden rounded-lg border border-white/10 px-3 py-2 text-right sm:block">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Branch</p>
                <p className="text-sm">{primaryBranch?.name ?? 'No branch yet'}</p>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                {tenant.status_label}
              </span>
            </div>
          </header>

          <div className="space-y-6 px-5 py-6 lg:px-8">
            <section className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_#1e293b,_#0f172a_55%)] p-6">
              <p className="text-xs uppercase tracking-widest text-amber-300">Getting started</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Welcome, {user?.name.split(' ')[0] ?? 'there'}.
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                Your restaurant account is active. Order taking, menu management, and cash payments are
                next on the roadmap.
              </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Orders today" value="0" />
              <Stat label="Open shifts" value="0" />
              <Stat label="Branches" value={String(branches.length)} />
              <Stat label="Plan" value="Free forever" accent />
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Branches</h3>
                  <span className="text-xs text-slate-500">Site setup</span>
                </div>

                {isLoading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading branches…</p>
                ) : branches.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-sm text-slate-500">
                    No branches yet. Setup wizard comes in the next milestone.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {branches.map((branch) => (
                      <li
                        key={branch.id}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-medium">{branch.name}</p>
                          <p className="text-xs text-slate-500">{branch.timezone ?? tenant.timezone}</p>
                        </div>
                        {branch.is_default ? (
                          <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                            Default
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <h3 className="text-sm font-semibold">Account</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <Row label="Slug" value={tenant.slug} />
                  <Row label="Country" value={tenant.country ?? '—'} />
                  <Row label="Timezone" value={tenant.timezone} />
                  <Row label="Currency" value={tenant.currency} />
                  <Row label="Role" value={membership.role} />
                </dl>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right text-slate-200">{value}</dd>
    </div>
  )
}
