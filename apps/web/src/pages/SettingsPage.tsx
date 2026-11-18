import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button, Field, FormError, Input } from '../components/Form'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'
import { authApi, errorMessage } from '../lib/api'
import { basisPointsToPercent } from '../lib/totals'
import { useWorkspaceBase } from '../lib/workspace'
import type { Branch, Tenant } from '../lib/types'

export function SettingsPage() {
  const { user, membership, tenant, tenantId, branches } = useWorkspace()

  if (membership && membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  if (!tenant) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        Loading settings…
      </div>
    )
  }

  const canManage = membership?.role === 'owner' || membership?.role === 'manager'
  const defaultBranch = branches.find((branch) => branch.is_default) ?? branches[0]

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="settings"
    >
      <SettingsForm
        key={tenant.id + (tenant.settings?.onboarding?.completed_at ?? '')}
        tenant={tenant}
        tenantId={tenantId}
        defaultBranch={defaultBranch}
        canManage={canManage}
      />
    </WorkspaceLayout>
  )
}

function SettingsForm({
  tenant,
  tenantId,
  defaultBranch,
  canManage,
}: {
  tenant: Tenant
  tenantId: number
  defaultBranch?: Branch
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const base = useWorkspaceBase()

  const [name, setName] = useState(tenant.name)
  const [phone, setPhone] = useState(tenant.settings?.phone ?? '')
  const [country, setCountry] = useState(tenant.country ?? '')
  const [timezone, setTimezone] = useState(tenant.timezone)
  const [currency, setCurrency] = useState(tenant.currency)
  const [taxEnabled, setTaxEnabled] = useState(tenant.settings?.tax?.enabled ?? false)
  const [taxRate, setTaxRate] = useState(basisPointsToPercent(tenant.settings?.tax?.rate_bps ?? 0))
  const [serviceEnabled, setServiceEnabled] = useState(
    tenant.settings?.service_charge?.enabled ?? false,
  )
  const [serviceRate, setServiceRate] = useState(
    basisPointsToPercent(tenant.settings?.service_charge?.rate_bps ?? 0),
  )
  const [receiptFooter, setReceiptFooter] = useState(tenant.settings?.receipt_footer ?? '')
  const [branchName, setBranchName] = useState(defaultBranch?.name ?? '')
  const [branchAddress, setBranchAddress] = useState(defaultBranch?.address ?? '')
  const [branchTimezone, setBranchTimezone] = useState(defaultBranch?.timezone ?? tenant.timezone)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      const response = await authApi.updateTenant(tenantId, {
        name: name.trim(),
        phone: phone.trim() || null,
        country: country.trim().toUpperCase() || null,
        timezone: timezone.trim(),
        currency: currency.trim().toUpperCase(),
        receipt_footer: receiptFooter.trim() || null,
        tax_enabled: taxEnabled,
        tax_rate: Number(taxRate) || 0,
        service_charge_enabled: serviceEnabled,
        service_charge_rate: Number(serviceRate) || 0,
      })

      if (defaultBranch) {
        await authApi.updateBranch(tenantId, defaultBranch.id, {
          name: branchName.trim(),
          address: branchAddress.trim() || null,
          timezone: branchTimezone.trim() || null,
        })
      }

      return response
    },
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] })
    },
    onError: (requestError) => {
      setNotice(null)
      setError(errorMessage(requestError))
    },
  })

  const onboardingComplete = tenant.settings?.onboarding?.completed === true

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-300">Workspace</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Settings</h2>
          <p className="mt-1 text-sm text-slate-400">
            Restaurant profile, charges, receipts, and your default branch.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              onboardingComplete
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
            }`}
          >
            {onboardingComplete ? 'Setup complete' : 'Setup incomplete'}
          </span>
          {!onboardingComplete && canManage ? (
            <Link
              to={`${base}/onboarding`}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/5"
            >
              Open wizard
            </Link>
          ) : null}
        </div>
      </section>

      {!canManage ? (
        <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400">
          Your role can view these settings, but only owners and managers can change them.
        </p>
      ) : null}

      <FormError message={error} />
      {notice ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          setNotice(null)
          save.mutate()
        }}
      >
        <fieldset disabled={!canManage} className="space-y-5">
          <Section title="Restaurant profile">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Restaurant name">
                <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
              </Field>
              <Field label="Phone" hint="Optional, printed on receipts.">
                <Input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={40} />
              </Field>
              <Field label="Country" hint="Two-letter code, e.g. PH.">
                <Input
                  value={country}
                  onChange={(event) => setCountry(event.target.value.toUpperCase())}
                  maxLength={2}
                />
              </Field>
              <Field label="Timezone" hint="IANA name, e.g. Asia/Manila.">
                <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
              </Field>
              <Field label="Currency" hint="Three-letter ISO code, e.g. PHP or USD.">
                <Input
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
              </Field>
              <Field label="Workspace slug">
                <Input value={tenant.slug} readOnly disabled />
              </Field>
            </div>
          </Section>

          <Section title="Charges" subtitle="Applied to new orders. Existing orders keep their original totals.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Toggle
                  label="Service charge"
                  checked={serviceEnabled}
                  onChange={setServiceEnabled}
                />
                <div className="mt-3">
                  <Field label="Rate (%)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={serviceRate}
                      onChange={(event) => setServiceRate(event.target.value)}
                      disabled={!serviceEnabled}
                    />
                  </Field>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Toggle label="Tax" checked={taxEnabled} onChange={setTaxEnabled} />
                <div className="mt-3">
                  <Field label="Rate (%)" hint="Tax is calculated on subtotal plus service charge.">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={taxRate}
                      onChange={(event) => setTaxRate(event.target.value)}
                      disabled={!taxEnabled}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Receipt">
            <Field label="Receipt footer" hint="Shown after the totals on the printed receipt.">
              <Input
                value={receiptFooter}
                onChange={(event) => setReceiptFooter(event.target.value)}
                maxLength={300}
                placeholder="Thank you for dining with us!"
              />
            </Field>
          </Section>

          {defaultBranch ? (
            <Section title="Default branch">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Branch name">
                  <Input
                    value={branchName}
                    onChange={(event) => setBranchName(event.target.value)}
                    required
                    maxLength={120}
                  />
                </Field>
                <Field label="Branch timezone">
                  <Input
                    value={branchTimezone}
                    onChange={(event) => setBranchTimezone(event.target.value)}
                    placeholder={tenant.timezone}
                  />
                </Field>
                <Field label="Address" hint="Optional.">
                  <Input
                    value={branchAddress}
                    onChange={(event) => setBranchAddress(event.target.value)}
                    maxLength={500}
                  />
                </Field>
              </div>
            </Section>
          ) : null}

          {canManage ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
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
