import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi, errorMessage } from '../lib/api'
import { useAuth } from '../store/auth'
import type { RegisterPayload } from '../lib/types'
import { AuthLayout } from '../components/AuthLayout'
import { Button, Field, FormError, Input, Select } from '../components/Form'

const COUNTRIES = [
  ['PH', 'Philippines'],
  ['KR', 'South Korea'],
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['AU', 'Australia'],
  ['SG', 'Singapore'],
  ['AE', 'United Arab Emirates'],
  ['IN', 'India'],
]

const TIMEZONES = [
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Dubai',
  'Asia/Kolkata',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Australia/Sydney',
  'UTC',
]

export function RegisterPage() {
  const navigate = useNavigate()
  const setSession = useAuth((state) => state.setSession)

  const [form, setForm] = useState<RegisterPayload>({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    restaurant_name: '',
    country: 'PH',
    timezone: 'Asia/Manila',
    restaurant_type: 'cafe',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function update<K extends keyof RegisterPayload>(field: K, value: RegisterPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const response = await authApi.register(form)
      setSession(response.token, response.user)
      navigate('/pending', { replace: true })
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Apply for an account"
      subtitle="Applications are reviewed manually. No subscription, free forever."
      footer={
        <>
          Already have an account?{' '}
          <Link className="font-medium text-amber-300 hover:text-amber-200" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormError message={error} />

        <Field label="Your name">
          <Input
            required
            autoComplete="name"
            value={form.name}
            onChange={(event) => update('name', event.target.value)}
          />
        </Field>

        <Field label="Email">
          <Input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Password">
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
            />
          </Field>
          <Field label="Confirm password">
            <Input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password_confirmation}
              onChange={(event) => update('password_confirmation', event.target.value)}
            />
          </Field>
        </div>

        <Field label="Restaurant name">
          <Input
            required
            value={form.restaurant_name}
            onChange={(event) => update('restaurant_name', event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <Select
              value={form.country}
              onChange={(event) => update('country', event.target.value)}
            >
              {COUNTRIES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Timezone">
            <Select
              value={form.timezone}
              onChange={(event) => update('timezone', event.target.value)}
            >
              {TIMEZONES.map((timezone) => (
                <option key={timezone} value={timezone}>
                  {timezone}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Restaurant type">
          <Select
            value={form.restaurant_type}
            onChange={(event) =>
              update('restaurant_type', event.target.value as RegisterPayload['restaurant_type'])
            }
          >
            <option value="cafe">Café</option>
            <option value="fast_food">Fast food</option>
            <option value="fine_dining">Fine dining</option>
            <option value="food_truck">Food truck</option>
            <option value="other">Other</option>
          </Select>
        </Field>

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit application'}
        </Button>
      </form>
    </AuthLayout>
  )
}
