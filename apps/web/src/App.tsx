import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { authApi } from './lib/api'
import { useAuth } from './store/auth'
import { AdminPage } from './pages/AdminPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MenuPage } from './pages/MenuPage'
import { OrdersPage } from './pages/OrdersPage'
import { PendingPage } from './pages/PendingPage'
import { PosPage } from './pages/PosPage'
import { RegisterPage } from './pages/RegisterPage'

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
              path="/menu"
              element={
                <RequireAuth>
                  <MenuPage />
                </RequireAuth>
              }
            />
            <Route
              path="/pos"
              element={
                <RequireAuth>
                  <PosPage />
                </RequireAuth>
              }
            />
            <Route
              path="/orders"
              element={
                <RequireAuth>
                  <OrdersPage />
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SessionBootstrap>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
