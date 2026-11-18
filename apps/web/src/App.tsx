import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
} from 'react-router-dom'
import { authApi } from './lib/api'
import {
  activeMemberships,
  firstWorkspaceSlug,
  membershipForSlug,
  pendingMembership,
  rememberedSlug,
  rememberSlug,
  workspacePath,
} from './lib/workspace'
import { useAuth } from './store/auth'
import { AdminPage } from './pages/AdminPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MenuPage } from './pages/MenuPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { OrdersPage } from './pages/OrdersPage'
import { PendingPage } from './pages/PendingPage'
import { PosPage } from './pages/PosPage'
import { RegisterPage } from './pages/RegisterPage'
import { SettingsPage } from './pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950">
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
        Loading workspace…
      </div>
    </div>
  )
}

function SessionBootstrap({ children }: { children: ReactNode }) {
  const token = useAuth((state) => state.token)
  const user = useAuth((state) => state.user)
  const loading = useAuth((state) => state.loading)
  const setUser = useAuth((state) => state.setUser)
  const clear = useAuth((state) => state.clear)

  useEffect(() => {
    if (!token) {
      if (loading) setUser(null)
      return
    }

    if (user) return

    let cancelled = false

    authApi
      .me()
      .then((response) => {
        if (!cancelled) setUser(response.user)
      })
      .catch(() => {
        if (!cancelled) clear()
      })

    return () => {
      cancelled = true
    }
  }, [token, user, loading, setUser, clear])

  if (loading && token && !user) {
    return <Splash />
  }

  return <>{children}</>
}

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((state) => state.token)

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

/** Validates `/t/{slug}` and renders the workspace pages nested below it. */
function WorkspaceGate() {
  const user = useAuth((state) => state.user)
  const { slug } = useParams<{ slug: string }>()
  const membership = membershipForSlug(user, slug)

  useEffect(() => {
    if (membership) rememberSlug(membership.tenant.slug)
  }, [membership])

  if (!user) return <Splash />
  if (membership) return <Outlet />

  if (pendingMembership(user) && activeMemberships(user).length === 0) {
    return <Navigate to="/pending" replace />
  }

  return <WorkspaceMissing />
}

function WorkspaceMissing() {
  const user = useAuth((state) => state.user)
  const clear = useAuth((state) => state.clear)
  const workspaces = activeMemberships(user)

  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6">
        <h1 className="text-lg font-semibold">Workspace not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          {workspaces.length > 0
            ? 'That restaurant link is not one of your workspaces. Pick one below.'
            : 'This login is not linked to an active restaurant yet.'}
        </p>

        <div className="mt-4 space-y-2">
          {workspaces.map((membership) => (
            <Link
              key={membership.id}
              to={workspacePath(membership.tenant.slug)}
              className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5"
            >
              <span className="truncate">{membership.tenant.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                {membership.role}
              </span>
            </Link>
          ))}
        </div>

        {user?.is_platform_admin ? (
          <Link
            to="/admin"
            className="mt-4 block rounded-lg border border-amber-400/20 px-3 py-2 text-center text-sm font-medium text-amber-200 transition hover:bg-amber-400/10"
          >
            Open platform admin
          </Link>
        ) : null}

        <button
          type="button"
          className="mt-4 text-sm text-slate-400 hover:text-white"
          onClick={() => {
            clear()
            window.location.assign('/login')
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

/** Sends legacy paths such as `/pos` to the remembered `/t/{slug}/pos`. */
function WorkspaceRedirect({ path = '' }: { path?: string }) {
  const token = useAuth((state) => state.token)
  const user = useAuth((state) => state.user)

  if (!token) return <Navigate to="/login" replace />
  if (!user) return <Splash />

  const slug = rememberedSlug(user) ?? firstWorkspaceSlug(user)
  if (slug) return <Navigate to={workspacePath(slug, path)} replace />

  if (pendingMembership(user)) return <Navigate to="/pending" replace />
  if (user.is_platform_admin) return <Navigate to="/admin" replace />

  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionBootstrap>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminPage />
                </RequireAuth>
              }
            />
            <Route
              path="/pending"
              element={
                <RequireAuth>
                  <PendingPage />
                </RequireAuth>
              }
            />
            <Route
              path="/t/:slug"
              element={
                <RequireAuth>
                  <WorkspaceGate />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="pos" element={<PosPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="onboarding" element={<OnboardingPage />} />
            </Route>
            <Route path="/pos" element={<WorkspaceRedirect path="pos" />} />
            <Route path="/orders" element={<WorkspaceRedirect path="orders" />} />
            <Route path="/menu" element={<WorkspaceRedirect path="menu" />} />
            <Route path="/settings" element={<WorkspaceRedirect path="settings" />} />
            <Route path="/onboarding" element={<WorkspaceRedirect path="onboarding" />} />
            <Route path="/" element={<WorkspaceRedirect />} />
            <Route path="*" element={<WorkspaceRedirect />} />
          </Routes>
        </SessionBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
