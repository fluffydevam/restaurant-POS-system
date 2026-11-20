import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Field, FormError, Input, Select } from '../components/Form'
import { LimitUsageNotice } from '../components/LimitUsageNotice'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'
import { errorMessage, tableApi } from '../lib/api'
import type { DiningTable, DiningTablePayload, TableStatus } from '../lib/types'

type TableDialog = { mode: 'create' } | { mode: 'edit'; table: DiningTable } | null

const STATUSES: TableStatus[] = ['available', 'occupied', 'reserved']

export function TablesPage() {
  const { user, membership, tenant, tenantId, branches } = useWorkspace()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [branchId, setBranchId] = useState('all')
  const [status, setStatus] = useState<'all' | TableStatus>('all')
  const [dialog, setDialog] = useState<TableDialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canManage = membership?.role === 'owner' || membership?.role === 'manager'

  const tables = useQuery({
    queryKey: ['tables', tenantId, search, branchId, status],
    queryFn: () =>
      tableApi.list(tenantId, {
        branchId: branchId === 'all' ? null : Number(branchId),
        status: status === 'all' ? undefined : status,
        search: search.trim() || undefined,
      }),
    enabled: tenantId > 0,
    placeholderData: keepPreviousData,
  })

  function invalidateTables() {
    queryClient.invalidateQueries({ queryKey: ['tables', tenantId] })
  }

  const saveTable = useMutation({
    mutationFn: (payload: { id?: number; data: DiningTablePayload }) =>
      payload.id
        ? tableApi.update(tenantId, payload.id, payload.data)
        : tableApi.create(tenantId, payload.data),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      setDialog(null)
      invalidateTables()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  const changeStatus = useMutation({
    mutationFn: (payload: { id: number; status: TableStatus }) =>
      tableApi.status(tenantId, payload.id, payload.status),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      invalidateTables()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  const removeTable = useMutation({
    mutationFn: (id: number) => tableApi.remove(tenantId, id),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      setDialog(null)
      invalidateTables()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  if (membership && membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  if (!tenant) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        Loading floor plan…
      </div>
    )
  }

  const allTables = Array.isArray(tables.data?.data) ? tables.data.data : []
  const usage = tables.data?.meta?.limits
  const atLimit = usage?.tables?.at_limit ?? false
  const busy = saveTable.isPending || changeStatus.isPending || removeTable.isPending

  function openDelete(table: DiningTable) {
    if (!window.confirm(`Remove ${table.name} from the floor?`)) return
    setError(null)
    removeTable.mutate(table.id)
  }

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="tables"
    >
      <div className="space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-300">Floor</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Tables</h2>
            <p className="mt-1 text-sm text-slate-400">
              Track which tables are open, seated, or reserved. Staff can update statuses.
            </p>
          </div>
          {canManage ? (
            <Button
              type="button"
              disabled={atLimit}
              title={atLimit ? 'Free plan table limit reached' : undefined}
              onClick={() => {
                setError(null)
                setNotice(null)
                setDialog({ mode: 'create' })
              }}
            >
              New table
            </Button>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Tables" value={allTables.length} />
          <Stat label="Available" value={allTables.filter((table) => table.status === 'available').length} />
          <Stat label="Occupied" value={allTables.filter((table) => table.status === 'occupied').length} />
          <Stat label="Reserved" value={allTables.filter((table) => table.status === 'reserved').length} />
        </section>

        <FormError message={error} />
        {notice ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}
        {tables.isError ? <FormError message={errorMessage(tables.error)} /> : null}

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search table names or zones"
              className="sm:max-w-xs"
            />
            <Select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="sm:w-48">
              <option value="all">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </div>
          <LimitUsageNotice usage={usage} resource="tables" label="Free plan tables" />
        </section>

        <section className="flex flex-wrap gap-1.5">
          <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>
            All
          </FilterChip>
          {STATUSES.map((value) => (
            <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
              {value[0].toUpperCase() + value.slice(1)}
            </FilterChip>
          ))}
        </section>

        {tables.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="h-40 animate-pulse rounded-2xl border border-white/5 bg-slate-900/40" />
            ))}
          </div>
        ) : allTables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-300">No tables on the floor</p>
            <p className="mt-1 text-sm text-slate-500">
              {search || status !== 'all' || branchId !== 'all'
                ? 'Try a different search or filter.'
                : 'Add your dining tables to start tracking their status.'}
            </p>
            {canManage && !atLimit && !search && status === 'all' ? (
              <Button type="button" className="mt-4" onClick={() => setDialog({ mode: 'create' })}>
                Add your first table
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {allTables.map((table) => (
              <article
                key={table.id}
                className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-4 transition hover:border-white/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-white">{table.name}</h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {table.zone ? `${table.zone} · ` : ''}
                      {table.seats} {table.seats === 1 ? 'seat' : 'seats'}
                    </p>
                  </div>
                  <StatusPill status={table.status} label={table.status_label} />
                </div>
                <p className="mt-2 truncate text-[11px] text-slate-500">
                  {table.branch?.name ?? 'No branch'}
                  {!table.is_active ? ' · Inactive' : ''}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {STATUSES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={busy || table.status === value}
                      onClick={() => changeStatus.mutate({ id: table.id, status: value })}
                      className={`rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-wide transition disabled:cursor-default ${
                        table.status === value
                          ? 'bg-amber-400 text-slate-950'
                          : 'border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>

                {canManage ? (
                  <div className="mt-4 flex gap-3 border-t border-white/5 pt-3 text-[11px]">
                    <button
                      type="button"
                      className="text-slate-300 hover:text-white"
                      onClick={() => {
                        setError(null)
                        setDialog({ mode: 'edit', table })
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-slate-500 hover:text-red-300"
                      onClick={() => openDelete(table)}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>

      {dialog ? (
        <TableForm
          key={dialog.mode === 'edit' ? dialog.table.id : 'new'}
          table={dialog.mode === 'edit' ? dialog.table : null}
          branches={branches}
          busy={saveTable.isPending}
          onClose={() => setDialog(null)}
          onDelete={dialog.mode === 'edit' ? () => openDelete(dialog.table) : undefined}
          onSave={(data) =>
            saveTable.mutate({
              id: dialog.mode === 'edit' ? dialog.table.id : undefined,
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

function StatusPill({ status, label }: { status: TableStatus; label: string }) {
  const styles =
    status === 'available'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : status === 'occupied'
        ? 'border-red-500/30 bg-red-500/10 text-red-200'
        : 'border-sky-500/30 bg-sky-500/10 text-sky-200'

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles}`}>
      {label}
    </span>
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

function TableForm({
  table,
  branches,
  busy,
  onClose,
  onDelete,
  onSave,
}: {
  table: DiningTable | null
  branches: { id: number; name: string }[]
  busy: boolean
  onClose: () => void
  onDelete?: () => void
  onSave: (payload: DiningTablePayload) => void
}) {
  const [name, setName] = useState(table?.name ?? '')
  const [zone, setZone] = useState(table?.zone ?? '')
  const [seats, setSeats] = useState(String(table?.seats ?? 2))
  const [status, setStatus] = useState<TableStatus>(table?.status ?? 'available')
  const [branchId, setBranchId] = useState(String(table?.branch_id ?? ''))
  const [sortOrder, setSortOrder] = useState(String(table?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(table?.is_active ?? true)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    onSave({
      name: name.trim(),
      zone: zone.trim() || null,
      seats: Number(seats) || 1,
      status,
      branch_id: branchId ? Number(branchId) : null,
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
    })
  }

  return (
    <Modal title={table ? 'Edit table' : 'New table'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" hint="Keep it short so it fits on tickets and receipts.">
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zone" hint="Optional, e.g. Patio or Window.">
            <Input value={zone} onChange={(event) => setZone(event.target.value)} maxLength={60} />
          </Field>
          <Field label="Seats">
            <Input
              type="number"
              min={1}
              max={99}
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch">
            <Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Default branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as TableStatus)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Sort order" hint="Lower numbers appear first.">
          <Input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-amber-400"
          />
          Active
        </label>

        <div className="flex items-center justify-between gap-3 pt-2">
          {onDelete ? (
            <button type="button" onClick={onDelete} disabled={busy} className="text-sm text-red-400 hover:text-red-300">
              Remove table
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save table'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
