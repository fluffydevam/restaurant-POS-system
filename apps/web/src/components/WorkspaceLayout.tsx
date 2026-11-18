import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useAuth } from '../store/auth'
import type { Branch, Membership, Tenant, User } from '../lib/types'

type ActiveNav = 'dashboard' | 'pos' | 'orders' | 'menu'

export function WorkspaceLayout({
  user,
  tenant,
  membership,
  branches,
  active,
  children,
}: {
  user: User | null
  tenant?: Tenant
  membership?: Membership | null
  branches: Branch[]
  active: ActiveNav
  children: ReactNode
}) {
  const clear = useAuth((state) => state.clear)
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

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
              <p className="truncate text-sm font-semibold">{tenant?.name ?? 'Workspace'}</p>
              <p className="truncate text-xs text-slate-500">Free forever</p>
            </div>
          </div>

          <nav className="mt-4 space-y-1">
            <NavLink to="/" label="Dashboard" isActive={active === 'dashboard'} />
            <NavLink to="/pos" label="Point of sale" isActive={active === 'pos'} hint="Register" />
            <NavLink to="/orders" label="Orders" isActive={active === 'orders'} />
            <NavLink to="/menu" label="Menu" isActive={active === 'menu'} hint="Catalog" />
            {['Tables', 'Staff', 'Settings'].map((label) => (
              <div
                key={label}
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-500"
                title="Next milestone"
              >
                <span>{label}</span>
                <span className="text-[10px] uppercase tracking-wide">Soon</span>
              </div>
            ))}
            {user?.is_platform_admin ? (
              <Link
                to="/admin"
                className="mt-3 flex items-center justify-between rounded-lg border border-amber-400/20 px-3 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-400/10"
              >
                <span>Platform admin</span>
                <span className="text-[10px] uppercase tracking-wide">Queue</span>
              </Link>
            ) : null}
          </nav>

          <div className="mt-auto rounded-xl border border-white/5 bg-white/5 p-3">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
            {membership ? (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                {membership.role}
              </p>
            ) : null}
            <button
              className="mt-3 text-xs font-medium text-slate-300 hover:text-white"
              disabled={signingOut}
              onClick={signOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4 lg:px-8">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-slate-500">Workspace</p>
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {tenant?.name ?? 'Restaurant'}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden rounded-lg border border-white/10 px-3 py-2 text-right sm:block">
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Branch</p>
                <p className="text-sm">{primaryBranch?.name ?? 'No branch yet'}</p>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                {tenant?.status_label ?? 'Active'}
              </span>
            </div>
          </header>

          <div className="px-5 py-6 lg:px-8">{children}</div>

          <div className="border-t border-white/5 px-5 py-4 lg:hidden">
            <button
              className="text-xs font-medium text-slate-300"
              disabled={signingOut}
              onClick={signOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}

function NavLink({ to, label, isActive, hint }: { to: string; label: string; isActive: boolean; hint?: string }) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
        isActive
          ? 'bg-amber-400/10 font-medium text-amber-200'
          : 'text-slate-300 hover:bg-white/5'
      }`}
    >
      <span>{label}</span>
      {hint ? <span className="text-[10px] uppercase tracking-wide text-slate-500">{hint}</span> : null}
    </Link>
  )
}
