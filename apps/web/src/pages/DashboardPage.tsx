import { Navigate, useNavigate } from 'react-router-dom'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'

export function DashboardPage() {
  const { user, clear, membership, tenant, branches, isLoading } = useWorkspace()
  const navigate = useNavigate()

  if (user && !membership) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 text-center">
          <h1 className="text-lg font-semibold">
            {user?.is_platform_admin ? 'Platform admin' : 'No restaurant account'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {user?.is_platform_admin
              ? 'This login manages the platform. Open the approval queue to review applications.'
              : 'This login is not linked to a restaurant yet.'}
          </p>

          {user.is_platform_admin ? (
            <button
              className="mt-4 w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
              onClick={() => navigate('/admin', { replace: true })}
            >
              Open approval queue
            </button>
          ) : null}

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

  if (membership && membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  if (!tenant) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        Loading workspace…
      </div>
    )
  }

  const itemCount = branches.length

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="dashboard"
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top_left,_#1e293b,_#0f172a_55%)] p-6">
          <p className="text-xs uppercase tracking-widest text-amber-300">Getting started</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Welcome, {user?.name.split(' ')[0] ?? 'there'}.
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Build your menu, then start taking orders. Cash payments and the point-of-sale screen
            are the next milestones.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Orders today" value="0" />
          <Stat label="Open shifts" value="0" />
          <Stat label="Branches" value={String(itemCount)} />
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
                No branches yet. Setup wizard comes in a later milestone.
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
              <Row label="Role" value={membership?.role ?? '—'} />
            </dl>
          </div>
        </section>
      </div>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-right text-slate-200">{value}</dd>
    </div>
  )
}
