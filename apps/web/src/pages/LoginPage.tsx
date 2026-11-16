import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi, errorMessage } from '../lib/api'
import { useAuth } from '../store/auth'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Field, FormError, Input } from '../components/Form'

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuth((state) => state.setSession)

  const [email, setEmail] = useState('owner@demo.test')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const response = await authApi.login(email, password)
      setSession(response.token, response.user)

      const membership = response.user.memberships[0]
      navigate(membership?.tenant.status === 'active' ? '/' : '/pending', { replace: true })
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Open your restaurant workspace."
      footer={
        <>
          New here?{' '}
          <Link className="font-medium text-amber-300 hover:text-amber-200" to="/register">
            Apply for an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormError message={error} />

        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-4 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-400">
        Demo account: <span className="text-slate-200">owner@demo.test</span> /{' '}
        <span className="text-slate-200">password</span>
      </p>
    </AuthLayout>
  )
}
