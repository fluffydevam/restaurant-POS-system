import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { authApi, errorMessage, primaryMembership } from '../lib/api'
import { useAuth } from '../store/auth'
import { AuthLayout } from '../components/AuthLayout'
import { Button, FormError } from '../components/Form'

export function PendingPage() {
  const user = useAuth((state) => state.user)
  const clear = useAuth((state) => state.clear)
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const membership = primaryMembership(user)

  if (membership?.tenant.status === 'active') {
    return <Navigate to="/" replace />
  }

  async function resendVerification() {
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const response = await authApi.resendVerification()
      setNotice(response.message)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    try {
      await authApi.logout()
    } finally {
      clear()
      navigate('/login', { replace: true })
    }
  }

  return (
    <AuthLayout
      title="Application under review"
      subtitle="A human reviews every restaurant account before it goes live."
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
            {membership?.tenant.status_label ?? 'Pending approval'}
          </p>
          <p className="mt-1 text-lg font-semibold text-white">
            {membership?.tenant.name ?? 'Your restaurant'}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            We will email you at <span className="text-white">{user?.email}</span> once your account is
            approved.
          </p>
        </div>

        <div className="space-y-2 text-sm text-slate-400">
          <p>
            Status: <span className="text-slate-200">{membership?.tenant.status_label ?? 'Pending'}</span>
          </p>
          <p>
            Email:{' '}
            <span className="text-slate-200">
              {user?.email_verified_at ? 'Verified' : 'Not verified yet'}
            </span>
          </p>
        </div>

        <FormError message={error} />
        {notice ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {!user?.email_verified_at ? (
            <Button type="button" onClick={resendVerification} disabled={busy}>
              {busy ? 'Sending…' : 'Resend verification email'}
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
