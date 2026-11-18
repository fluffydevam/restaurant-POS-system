import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Button, Field, FormError, Input } from '../components/Form'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'
import { authApi, errorMessage } from '../lib/api'
import { basisPointsToPercent } from '../lib/totals'
import { useWorkspaceBase } from '../lib/workspace'

const STEPS = ['Profile', 'Charges', 'Branch', 'Review']

export function OnboardingPage() {
  const { user, membership, tenant, tenantId, branches } = useWorkspace()

  if (membership && membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  if (!tenant) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        Loading setup…
      </div>
    )
  }

  const canManage = membership?.role === 'owner' || membership?.role === 'manager'

  if (!canManage) {
    return <Navigate to="/" replace />
  }

  const defaultBranch = branches.find((branch) => branch.is_default) ?? branches[0]

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="settings"
    >
      <OnboardingWizard
        key={tenant.id}
        tenantId={tenantId}
        initial={{
          name: tenant.name,
          phone: tenant.settings?.phone ?? '',
          country: tenant.country ?? '',
          timezone: tenant.timezone,
          currency: tenant.currency,
          taxEnabled: tenant.settings?.tax?.enabled ?? false,
          taxRate: basisPointsToPercent(tenant.settings?.tax?.rate_bps ?? 0),
          serviceEnabled: tenant.settings?.service_charge?.enabled ?? false,
          serviceRate: basisPointsToPercent(tenant.settings?.service_charge?.rate_bps ?? 0),
          receiptFooter: tenant.settings?.receipt_footer ?? '',
          branchName: defaultBranch?.name ?? 'Main Branch',
          branchAddress: defaultBranch?.address ?? '',
          branchTimezone: defaultBranch?.timezone ?? tenant.timezone,
        }}
        branchId={defaultBranch?.id}
      />
    </WorkspaceLayout>
  )
}

interface Draft {
  name: string
  phone: string
  country: string
  timezone: string
  currency: string
  taxEnabled: boolean
  taxRate: string
  serviceEnabled: boolean
  serviceRate: string
  receiptFooter: string
  branchName: string
  branchAddress: string
  branchTimezone: string
}

function OnboardingWizard({
  tenantId,
  initial,
  branchId,
}: {
  tenantId: number
  initial: Draft
  branchId?: number
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const base = useWorkspaceBase()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(initial)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const finish = useMutation({
    mutationFn: async () => {
      const response = await authApi.updateTenant(tenantId, {
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        country: draft.country.trim().toUpperCase() || null,
        timezone: draft.timezone.trim(),
        currency: draft.currency.trim().toUpperCase(),
        receipt_footer: draft.receiptFooter.trim() || null,
        tax_enabled: draft.taxEnabled,
        tax_rate: Number(draft.taxRate) || 0,
        service_charge_enabled: draft.serviceEnabled,
        service_charge_rate: Number(draft.serviceRate) || 0,
        onboarding_completed: true,
      })

      if (branchId) {
        await authApi.updateBranch(tenantId, branchId, {
          name: draft.branchName.trim(),
          address: draft.branchAddress.trim() || null,
          timezone: draft.branchTimezone.trim() || null,
        })
      }

      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] })
      navigate(base || '/', { replace: true })
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  const profileComplete = draft.name.trim().length > 0
  const branchComplete = draft.branchName.trim().length > 0
  const canAdvance = step === 0 ? profileComplete : step === 2 ? branchComplete : true

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section>
        <p className="text-xs uppercase tracking-widest text-amber-300">Setup</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Get your restaurant ready</h2>
        <p className="mt-1 text-sm text-slate-400">
          Four short steps. You can change everything later in Settings.
        </p>
      </section>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                index === step
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                  : index < step
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/10 text-slate-500'
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10 text-[10px]">
                {index + 1}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <FormError message={error} />

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        {step === 0 ? (
          <div className="space-y-4">
            <StepHeading title="Restaurant profile" body="How your restaurant appears on the workspace and receipts." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Restaurant name">
                <Input
                  value={draft.name}
                  onChange={(event) => update('name', event.target.value)}
                  required
                  maxLength={120}
                  autoFocus
                />
              </Field>
              <Field label="Phone" hint="Optional.">
                <Input
                  value={draft.phone}
                  onChange={(event) => update('phone', event.target.value)}
                  maxLength={40}
                />
              </Field>
              <Field label="Country" hint="Two-letter code, e.g. PH.">
                <Input
                  value={draft.country}
                  onChange={(event) => update('country', event.target.value.toUpperCase())}
                  maxLength={2}
                />
              </Field>
              <Field label="Timezone" hint="IANA name, e.g. Asia/Manila.">
                <Input value={draft.timezone} onChange={(event) => update('timezone', event.target.value)} />
              </Field>
              <Field label="Currency" hint="Three-letter ISO code.">
                <Input
                  value={draft.currency}
                  onChange={(event) => update('currency', event.target.value.toUpperCase())}
                  maxLength={3}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <StepHeading
              title="Charges and receipts"
              body="These are applied to every new order. Leave them off if you do not use them."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Toggle label="Service charge" checked={draft.serviceEnabled} onChange={(value) => update('serviceEnabled', value)} />
                <div className="mt-3">
                  <Field label="Rate (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={draft.serviceRate}
                      onChange={(event) => update('serviceRate', event.target.value)}
                      disabled={!draft.serviceEnabled}
                    />
                  </Field>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Toggle label="Tax" checked={draft.taxEnabled} onChange={(value) => update('taxEnabled', value)} />
                <div className="mt-3">
                  <Field label="Rate (%)" hint="Applied to subtotal + service charge.">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={draft.taxRate}
                      onChange={(event) => update('taxRate', event.target.value)}
                      disabled={!draft.taxEnabled}
                    />
                  </Field>
                </div>
              </div>
            </div>
            <Field label="Receipt footer" hint="Optional. Printed below the totals.">
              <Input
                value={draft.receiptFooter}
                onChange={(event) => update('receiptFooter', event.target.value)}
                maxLength={300}
                placeholder="Thank you for dining with us!"
              />
            </Field>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <StepHeading title="Your first branch" body="Branches hold the register, menu availability, and orders." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Branch name">
                <Input
                  value={draft.branchName}
                  onChange={(event) => update('branchName', event.target.value)}
                  required
                  maxLength={120}
                  autoFocus
                />
              </Field>
              <Field label="Branch timezone" hint="Defaults to the restaurant timezone.">
                <Input
                  value={draft.branchTimezone}
                  onChange={(event) => update('branchTimezone', event.target.value)}
                />
              </Field>
              <Field label="Address" hint="Optional, shown on receipts.">
                <Input
                  value={draft.branchAddress}
                  onChange={(event) => update('branchAddress', event.target.value)}
                  maxLength={500}
                />
              </Field>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <StepHeading title="Ready to go" body="Review the essentials, then open the register." />
            <dl className="grid gap-3 sm:grid-cols-2">
              <Summary label="Restaurant" value={draft.name} />
              <Summary label="Phone" value={draft.phone || '—'} />
              <Summary label="Country" value={draft.country || '—'} />
              <Summary label="Timezone" value={draft.timezone} />
              <Summary label="Currency" value={draft.currency} />
              <Summary label="Branch" value={draft.branchName} />
              <Summary
                label="Service charge"
                value={draft.serviceEnabled ? `${draft.serviceRate || 0}%` : 'Off'}
              />
              <Summary label="Tax" value={draft.taxEnabled ? `${draft.taxRate || 0}%` : 'Off'} />
            </dl>
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
              After finishing, the menu is ready to edit and the register can take cash orders
              straight away.
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <button
            type="button"
            onClick={() => (step === 0 ? navigate(base || '/') : setStep((current) => current - 1))}
            className="text-sm text-slate-400 hover:text-white"
          >
            {step === 0 ? 'Skip for now' : 'Back'}
          </button>

          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={!canAdvance}
              onClick={() => {
                setError(null)
                setStep((current) => current + 1)
              }}
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              disabled={finish.isPending}
              onClick={() => {
                setError(null)
                finish.mutate()
              }}
            >
              {finish.isPending ? 'Saving…' : 'Finish setup'}
            </Button>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        Need the long version? <Link to={`${base}/settings`} className="text-amber-300">Open settings</Link>
      </p>
    </div>
  )
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{body}</p>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-slate-200">{value}</dd>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-200">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-amber-400"
      />
    </label>
  )
}
