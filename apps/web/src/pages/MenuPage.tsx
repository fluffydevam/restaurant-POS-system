import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Field, FormError, Input, Select } from '../components/Form'
import { WorkspaceLayout } from '../components/WorkspaceLayout'
import { useWorkspace } from '../hooks/useWorkspace'
import { errorMessage, menuApi } from '../lib/api'
import type { MenuCategory, MenuCategoryPayload, MenuItem, MenuItemPayload } from '../lib/types'

type CategoryFilter = 'all' | 'uncategorized' | number
type CategoryDialog = { mode: 'create' } | { mode: 'edit'; category: MenuCategory } | null
type ItemDialog = { mode: 'create' } | { mode: 'edit'; item: MenuItem } | null

export function MenuPage() {
  const { user, membership, tenant, tenantId, branches } = useWorkspace()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialog>(null)
  const [itemDialog, setItemDialog] = useState<ItemDialog>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canManage = membership?.role === 'owner' || membership?.role === 'manager'

  const categories = useQuery({
    queryKey: ['menu', tenantId, 'categories'],
    queryFn: () => menuApi.categories(tenantId),
    enabled: tenantId > 0,
  })

  const items = useQuery({
    queryKey: ['menu', tenantId, 'items'],
    queryFn: () => menuApi.items(tenantId),
    enabled: tenantId > 0,
    placeholderData: keepPreviousData,
  })

  function invalidateMenu() {
    queryClient.invalidateQueries({ queryKey: ['menu', tenantId] })
  }

  const saveCategory = useMutation({
    mutationFn: (payload: { id?: number; data: MenuCategoryPayload }) =>
      payload.id
        ? menuApi.updateCategory(tenantId, payload.id, payload.data)
        : menuApi.createCategory(tenantId, payload.data),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      setCategoryDialog(null)
      invalidateMenu()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  const removeCategory = useMutation({
    mutationFn: (id: number) => menuApi.deleteCategory(tenantId, id),
    onSuccess: () => {
      setNotice('Category removed.')
      setError(null)
      setCategoryDialog(null)
      invalidateMenu()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  const saveItem = useMutation({
    mutationFn: (payload: { id?: number; data: MenuItemPayload }) =>
      payload.id
        ? menuApi.updateItem(tenantId, payload.id, payload.data)
        : menuApi.createItem(tenantId, payload.data),
    onSuccess: (response) => {
      setNotice(response.message)
      setError(null)
      setItemDialog(null)
      invalidateMenu()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  const removeItem = useMutation({
    mutationFn: (id: number) => menuApi.deleteItem(tenantId, id),
    onSuccess: () => {
      setNotice('Item removed from the menu.')
      setError(null)
      setItemDialog(null)
      invalidateMenu()
    },
    onError: (requestError) => setError(errorMessage(requestError)),
  })

  if (membership && membership.tenant.status !== 'active') {
    return <Navigate to="/pending" replace />
  }

  if (!tenant) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">
        Loading workspace…
      </div>
    )
  }

  const allItems = items.data?.data ?? []
  const allCategories = categories.data ?? []
  const term = search.trim().toLowerCase()

  const visibleItems = allItems.filter((item) => {
    if (!showInactive && !item.is_active) return false
    if (categoryFilter === 'uncategorized' && item.menu_category_id !== null) return false
    if (typeof categoryFilter === 'number' && item.menu_category_id !== categoryFilter) return false

    return (
      !term ||
      `${item.name} ${item.description ?? ''} ${item.sku ?? ''}`.toLowerCase().includes(term)
    )
  })

  const uncategorized = visibleItems.filter((item) => item.menu_category_id === null)
  const groups = allCategories
    .map((category) => ({
      category,
      items: visibleItems.filter((item) => item.menu_category_id === category.id),
    }))
    .filter((group) => group.items.length > 0)

  function openNewItem() {
    setError(null)
    setNotice(null)
    setItemDialog({ mode: 'create' })
  }

  function openNewCategory() {
    setError(null)
    setNotice(null)
    setCategoryDialog({ mode: 'create' })
  }

  function deleteItem(item: MenuItem) {
    if (!window.confirm(`Remove ${item.name} from the menu?`)) return
    setError(null)
    removeItem.mutate(item.id)
  }

  function deleteCategory(category: MenuCategory) {
    if (!window.confirm(`Remove the ${category.name} category?`)) return
    setError(null)
    removeCategory.mutate(category.id)
  }

  return (
    <WorkspaceLayout
      user={user}
      tenant={tenant}
      membership={membership}
      branches={branches}
      active="menu"
    >
      <div className="space-y-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-300">Catalog</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Menu</h2>
            <p className="mt-1 text-sm text-slate-400">
              Prices are entered in {tenant.currency} and stored precisely in cents.
            </p>
          </div>

          {canManage ? (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={openNewCategory}>
                New category
              </Button>
              <Button type="button" onClick={openNewItem}>
                New item
              </Button>
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Categories" value={allCategories.length} />
          <Stat label="Menu items" value={allItems.length} />
          <Stat label="Active" value={allItems.filter((item) => item.is_active).length} />
          <Stat
            label="Unavailable"
            value={allItems.filter((item) => item.is_active && !item.is_available).length}
          />
        </section>

        <FormError message={error} />
        {notice ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </p>
        ) : null}
        {categories.isError ? <FormError message={errorMessage(categories.error)} /> : null}
        {items.isError ? <FormError message={errorMessage(items.error)} /> : null}

        <section className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items, descriptions, SKUs"
            className="sm:max-w-xs"
          />

          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
              All
            </FilterChip>
            {allCategories.map((category) => (
              <FilterChip
                key={category.id}
                active={categoryFilter === category.id}
                onClick={() => setCategoryFilter(category.id)}
              >
                {category.name}
              </FilterChip>
            ))}
            <FilterChip
              active={categoryFilter === 'uncategorized'}
              onClick={() => setCategoryFilter('uncategorized')}
            >
              Uncategorized
            </FilterChip>
          </div>

          <label className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-amber-400"
            />
            Show inactive
          </label>
        </section>

        {categories.isLoading || items.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="h-32 animate-pulse rounded-2xl border border-white/5 bg-slate-900/40" />
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-300">No menu items yet</p>
            <p className="mt-1 text-sm text-slate-500">
              {term || categoryFilter !== 'all'
                ? 'Try a different search or filter.'
                : 'Add a category, then start filling it with items.'}
            </p>
            {canManage && !term && categoryFilter === 'all' ? (
              <Button type="button" className="mt-4" onClick={openNewItem}>
                Add your first item
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(({ category, items: groupItems }) => (
              <MenuSection
                key={category.id}
                title={category.name}
                subtitle={category.description ?? undefined}
                badge={category.is_active ? undefined : 'Inactive'}
                canManage={canManage}
                onEdit={canManage ? () => setCategoryDialog({ mode: 'edit', category }) : undefined}
                onDelete={canManage ? () => deleteCategory(category) : undefined}
              >
                <ItemGrid
                  items={groupItems}
                  currency={tenant.currency}
                  canManage={canManage}
                  onEdit={(item) => setItemDialog({ mode: 'edit', item })}
                  onDelete={deleteItem}
                />
              </MenuSection>
            ))}

            {uncategorized.length > 0 ? (
              <MenuSection title="Uncategorized" canManage={false}>
                <ItemGrid
                  items={uncategorized}
                  currency={tenant.currency}
                  canManage={canManage}
                  onEdit={(item) => setItemDialog({ mode: 'edit', item })}
                  onDelete={deleteItem}
                />
              </MenuSection>
            ) : null}
          </div>
        )}
      </div>

      {categoryDialog ? (
        <CategoryForm
          key={categoryDialog.mode === 'edit' ? categoryDialog.category.id : 'new'}
          category={categoryDialog.mode === 'edit' ? categoryDialog.category : null}
          busy={saveCategory.isPending || removeCategory.isPending}
          onClose={() => setCategoryDialog(null)}
          onDelete={categoryDialog.mode === 'edit' ? () => deleteCategory(categoryDialog.category) : undefined}
          onSave={(data) =>
            saveCategory.mutate({
              id: categoryDialog.mode === 'edit' ? categoryDialog.category.id : undefined,
              data,
            })
          }
        />
      ) : null}

      {itemDialog ? (
        <ItemForm
          key={itemDialog.mode === 'edit' ? itemDialog.item.id : 'new'}
          item={itemDialog.mode === 'edit' ? itemDialog.item : null}
          categories={allCategories}
          currency={tenant.currency}
          busy={saveItem.isPending}
          onClose={() => setItemDialog(null)}
          onSave={(data) =>
            saveItem.mutate({ id: itemDialog.mode === 'edit' ? itemDialog.item.id : undefined, data })
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
        active
          ? 'bg-amber-400 text-slate-950'
          : 'border border-white/10 text-slate-300 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}

function MenuSection({
  title,
  subtitle,
  badge,
  canManage,
  onEdit,
  onDelete,
  children,
}: {
  title: string
  subtitle?: string
  badge?: string
  canManage: boolean
  onEdit?: () => void
  onDelete?: () => void
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {badge ? (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {canManage ? (
          <div className="flex gap-2">
            {onEdit ? (
              <button type="button" onClick={onEdit} className="text-xs font-medium text-amber-300 hover:text-amber-200">
                Edit category
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" onClick={onDelete} className="text-xs font-medium text-slate-500 hover:text-red-300">
                Remove
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ItemGrid({
  items,
  currency,
  canManage,
  onEdit,
  onDelete,
}: {
  items: MenuItem[]
  currency: string
  canManage: boolean
  onEdit: (item: MenuItem) => void
  onDelete: (item: MenuItem) => void
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-white/5 bg-white/5 p-4 transition hover:border-white/15"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-white">{item.name}</p>
            <p className="shrink-0 text-sm font-semibold text-amber-300">
              {formatMoney(item.price_cents, currency)}
            </p>
          </div>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill active={item.is_active} label={item.is_active ? 'Active' : 'Inactive'} />
            {item.is_active && !item.is_available ? (
              <StatusPill active={false} label="Unavailable" />
            ) : null}
            {item.sku ? <span className="text-[10px] uppercase tracking-wide text-slate-500">{item.sku}</span> : null}
            {canManage ? (
              <span className="ml-auto flex gap-3 text-[11px]">
                <button type="button" className="text-slate-300 hover:text-white" onClick={() => onEdit(item)}>
                  Edit
                </button>
                <button type="button" className="text-slate-500 hover:text-red-300" onClick={() => onDelete(item)}>
                  Delete
                </button>
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
        active
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-white/10 text-slate-400'
      }`}
    >
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

function CategoryForm({
  category,
  busy,
  onClose,
  onDelete,
  onSave,
}: {
  category: MenuCategory | null
  busy: boolean
  onClose: () => void
  onDelete?: () => void
  onSave: (payload: MenuCategoryPayload) => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(category?.is_active ?? true)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
    })
  }

  return (
    <Modal title={category ? 'Edit category' : 'New category'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoFocus />
        </Field>
        <Field label="Description" hint="Optional, shown on the menu.">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </Field>
        <Field label="Sort order" hint="Lower numbers appear first.">
          <Input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </Field>
        <Checkbox label="Active" checked={isActive} onChange={setIsActive} />

        <div className="flex items-center justify-between gap-3 pt-2">
          {onDelete ? (
            <button type="button" onClick={onDelete} disabled={busy} className="text-sm text-red-400 hover:text-red-300">
              Remove category
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save category'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

function ItemForm({
  item,
  categories,
  currency,
  busy,
  onClose,
  onSave,
}: {
  item: MenuItem | null
  categories: MenuCategory[]
  currency: string
  busy: boolean
  onClose: () => void
  onSave: (payload: MenuItemPayload) => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [categoryId, setCategoryId] = useState(String(item?.menu_category_id ?? categories[0]?.id ?? ''))
  const [description, setDescription] = useState(item?.description ?? '')
  const [sku, setSku] = useState(item?.sku ?? '')
  const [price, setPrice] = useState(item ? (item.price_cents / 100).toFixed(2) : '')
  const [sortOrder, setSortOrder] = useState(String(item?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(item?.is_active ?? true)
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(price)

    onSave({
      menu_category_id: categoryId ? Number(categoryId) : null,
      name: name.trim(),
      description: description.trim() || null,
      sku: sku.trim() || null,
      price_cents: Number.isFinite(amount) ? Math.round(amount * 100) : 0,
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
      is_available: isAvailable,
    })
  }

  return (
    <Modal title={item ? 'Edit item' : 'New item'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Price (${currency})`}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
              required
            />
          </Field>
        </div>

        <Field label="Description" hint="Optional.">
          <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" hint="Optional.">
            <Input value={sku} onChange={(event) => setSku(event.target.value)} maxLength={64} />
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox label="Active (visible on the menu)" checked={isActive} onChange={setIsActive} />
          <Checkbox label="Available to order" checked={isAvailable} onChange={setIsAvailable} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !name.trim() || price === ''}>
            {busy ? 'Saving…' : 'Save item'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-amber-400"
      />
      {label}
    </label>
  )
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
  } catch {
    return (cents / 100).toFixed(2)
  }
}
