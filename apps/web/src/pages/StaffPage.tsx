import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Field, FormError, Input, Select } from '../components/Form'
import { LimitUsageNotice } from '../components/LimitUsageNotice'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'
import { errorMessage, staffApi } from '../lib/api'
import type { StaffMember, StaffPayload, StaffRole } from '../lib/types'

type StaffDialog = { mode: 'create' } | { mode: 'edit'; member: StaffMember } | null

const ROLES: StaffRole[] = ['owner', 'manager', 'staff']

export function StaffPage() {
  const { user, membership, tenant, tenantId, branches } = useWorkspace()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'all' | StaffRole>('all')
  const [showInactive, setShowInactive] = useState(true)
  const [dialog, setDialog] = useState<StaffDialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canManage = membership?.role === 'owner' || membership?.role === 'manager'
  const isOwner = membership?.role === 'owner'

  const staff = useQuery({
    queryKey: ['staff', tenantId, search, role, showInactive],
    queryFn: () =>
      staffApi.list(tenantId, {
        role: role === 'all' ? undefined : role,
        search: search.trim() || undefined,
      }),
    enabled: tenantId > 0,
    placeholderData: keepPreviousData,
  })

  function invalidateStaff() {
    queryClient.invalidateQueries({ queryKey: ['staff', tenantId] })
  }

  const saveMember = useMutation({
    mutationFn: (payload: { id?: number; data: StaffPayload | Partial<StaffPayload> }) =>
      payload.id
        ? staffApi.update(tenantId, payload.id, payload.data)
        : staffApi.create(tenantId, payload.data as StaffPayload),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      setDialog(null)
      invalidateStaff()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  const removeMember = useMutation({
    mutationFn: (id: number) => staffApi.remove(tenantId, id),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      setDialog(null)
      invalidateStaff()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  if (membership && membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  if (!tenant) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        Loading team…
      </div>
    )
  }

  const allStaff = Array.isArray(staff.data?.data) ? staff.data.data : []
  const visibleStaff = showInactive ? allStaff : allStaff.filter((member) => member.is_active)
  const usage = staff.data?.meta?.limits
  const atLimit = usage?.staff?.at_limit ?? false
  const busy = saveMember.isPending || removeMember.isPending

  function canEdit(member: StaffMember) {
    if (!canManage) return false
    if (!isOwner && member.role !== 'staff') return false
    return true
  }

  function openDelete(member: StaffMember) {
    if (!window.confirm(`Remove ${member.name ?? 'this member'} from the team?`)) return
    setError(null)
    removeMember.mutate(member.id)
  }

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="staff"
    >
      <div className="space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-300">Team</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Staff</h2>
            <p className="mt-1 text-sm text-slate-400">
              Owners manage the whole team. Managers can add and manage staff.
            </p>
          </div>
          {canManage ? (
            <Button
              type="button"
              disabled={atLimit}
              title={atLimit ? 'Free plan staff limit reached' : undefined}
              onClick={() => {
                setError(null)
                setNotice(null)
                setDialog({ mode: 'create' })
              }}
            >
              Add staff
            </Button>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Members" value={allStaff.filter((member) => member.is_active).length} />
          <Stat label="Owners" value={allStaff.filter((member) => member.role === 'owner' && member.is_active).length} />
          <Stat label="Managers" value={allStaff.filter((member) => member.role === 'manager' && member.is_active).length} />
          <Stat label="Staff" value={allStaff.filter((member) => member.role === 'staff' && member.is_active).length} />
        </section>

        <FormError message={error} />
        {notice ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}
        {staff.isError ? <FormError message={errorMessage(staff.error)} /> : null}

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or email"
              className="sm:max-w-xs"
            />
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-amber-400"
              />
              Show inactive
            </label>
          </div>
          <LimitUsageNotice usage={usage} resource="staff" label="Free plan staff" />
        </section>

        <section className="flex flex-wrap gap-1.5">
          <FilterChip active={role === 'all'} onClick={() => setRole('all')}>
            All
          </FilterChip>
          {ROLES.map((value) => (
            <FilterChip key={value} active={role === value} onClick={() => setRole(value)}>
              {value[0].toUpperCase() + value.slice(1)}
            </FilterChip>
          ))}
        </section>

        {staff.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-24 animate-pulse rounded-2xl border border-white/5 bg-slate-900/40" />
            ))}
          </div>
        ) : visibleStaff.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-300">No team members found</p>
            <p className="mt-1 text-sm text-slate-500">
              {search || role !== 'all'
                ? 'Try a different search or filter.'
                : 'Add staff so they can run the register for you.'}
            </p>
            {canManage && !atLimit && !search && role === 'all' ? (
              <Button type="button" className="mt-4" onClick={() => setDialog({ mode: 'create' })}>
                Add your first staff member
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleStaff.map((member) => {
              const editable = canEdit(member)
              const isSelf = member.user_id === user?.id

              return (
                <article
                  key={member.id}
                  className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-400/10 text-sm font-semibold text-amber-200">
                    {(member.name ?? '?').slice(0, 1).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{member.name}</p>
                      {isSelf ? (
                        <span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                          You
                        </span>
                      ) : null}
                      {!member.is_active ? (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-slate-500">{member.email}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${
                        member.role === 'owner'
                          ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                          : member.role === 'manager'
                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
                            : 'border-white/10 text-slate-400'
                      }`}
                    >
                      {member.role}
                    </span>
                    <span className="hidden text-[11px] text-slate-500 sm:inline">
                      {member.branch?.name ?? 'All branches'}
                    </span>
                  </div>

                  {editable ? (
                    <div className="flex gap-3 text-[11px]">
                      <button
                        type="button"
                        className="text-slate-300 hover:text-white"
                        onClick={() => {
                          setError(null)
                          setDialog({ mode: 'edit', member })
                        }}
                      >
                        Edit
                      </button>
                      {!isSelf ? (
                        <button
                          type="button"
                          className="text-slate-500 hover:text-red-300"
                          onClick={() => openDelete(member)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </div>

      {dialog ? (
        <StaffForm
          key={dialog.mode === 'edit' ? dialog.member.id : 'new'}
          member={dialog.mode === 'edit' ? dialog.member : null}
          branches={branches}
          canAssignRoles={isOwner}
          isSelf={dialog.mode === 'edit' && dialog.member.user_id === user?.id}
          busy={busy}
          onClose={() => setDialog(null)}
          onDelete={
            dialog.mode === 'edit' && dialog.member.user_id !== user?.id
              ? () => openDelete(dialog.member)
              : undefined
          }
          onSave={(data) =>
            saveMember.mutate({
              id: dialog.mode === 'edit' ? dialog.member.id : undefined,
              data,
            })
          }
        />
      ) : null}
    </WorkspaceLayout>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
        active ? 'bg-amber-400 text-slate-950' : 'border border-white/10 text-slate-300 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-white">
            Close
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}

function StaffForm({
  member,
  branches,
  canAssignRoles,
  isSelf,
  busy,
  onClose,
  onDelete,
  onSave,
}: {
  member: StaffMember | null
  branches: { id: number; name: string }[]
  canAssignRoles: boolean
  isSelf: boolean
  busy: boolean
  onClose: () => void
  onDelete?: () => void
  onSave: (payload: StaffPayload | Partial<StaffPayload>) => void
}) {
  const [name, setName] = useState(member?.name ?? '')
  const [email, setEmail] = useState(member?.email ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<StaffRole>(member?.role ?? 'staff')
  const [branchId, setBranchId] = useState(String(member?.branch?.id ?? ''))
  const [isActive, setIsActive] = useState(member?.is_active ?? true)

  const availableRoles = canAssignRoles ? ROLES : (['staff'] as StaffRole[])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (member) {
      const payload: Partial<StaffPayload> = { name: name.trim() }

      if (!isSelf) {
        payload.role = role
        payload.is_active = isActive
        payload.branch_id = branchId ? Number(branchId) : null
      }

      onSave(payload)
      return
    }

    onSave({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      branch_id: branchId ? Number(branchId) : null,
    })
  }

  return (
    <Modal title={member ? 'Edit team member' : 'Add team member'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoFocus />
        </Field>

        {member ? null : (
          <>
            <Field label="Email" hint="They can sign in immediately with the password below.">
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={190}
              />
            </Field>
            <Field label="Temporary password" hint="At least 8 characters.">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                maxLength={100}
              />
            </Field>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" hint={canAssignRoles ? undefined : 'Managers can only add staff.'}>
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as StaffRole)}
              disabled={member ? isSelf : !canAssignRoles}
            >
              {availableRoles.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Branch">
            <Select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              disabled={Boolean(member && isSelf)}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {member ? (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={isActive}
              disabled={isSelf}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-amber-400"
            />
            Active
          </label>
        ) : null}

        {isSelf ? (
          <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
            Your own role and active state are protected. Update those from another owner account.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 pt-2">
          {onDelete ? (
            <button type="button" onClick={onDelete} disabled={busy} className="text-sm text-red-400 hover:text-red-300">
              Remove member
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || (!member && (!email.trim() || password.length < 8))}>
              {busy ? 'Saving…' : member ? 'Save member' : 'Add member'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
