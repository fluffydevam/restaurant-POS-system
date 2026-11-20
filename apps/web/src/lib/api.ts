import type {
  AdminActionResponse,
  AdminStats,
  AdminTenant,
  AuthResponse,
  Branch,
  BranchUpdatePayload,
  DiningTablePayload,
  MeResponse,
  MenuCategory,
  MenuCategoryPayload,
  MenuItem,
  MenuItemPayload,
  MenuMutationResponse,
  CreateOrderPayload,
  Order,
  OrderMutationResponse,
  OrderStatus,
  OrderSummary,
  Paginated,
  RegisterPayload,
  StaffListResponse,
  StaffMutationResponse,
  StaffPayload,
  TableListResponse,
  TableMutationResponse,
  TableStatus,
  TenantContextResponse,
  TenantStatus,
  TenantUpdatePayload,
  User,
} from './types'

const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
const TOKEN_KEY = 'pos_token'

export class ApiError extends Error {
  status: number
  data: Record<string, unknown>

  constructor(status: number, data: Record<string, unknown>) {
    super(typeof data.message === 'string' ? data.message : 'Request failed')
    this.status = status
    this.data = data
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const errors = error.data.errors as Record<string, string[]> | undefined
    if (errors) {
      const first = Object.values(errors)[0]?.[0]
      if (first) return first
    }
    return error.message
  }

  return error instanceof Error ? error.message : 'Something went wrong.'
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(
  path: string,
  options: RequestInit & { tenantId?: number } = {},
): Promise<T> {
  const { tenantId, headers, ...rest } = options
  const merged = new Headers(headers)
  merged.set('Accept', 'application/json')

  if (rest.body) {
    merged.set('Content-Type', 'application/json')
  }

  const token = getStoredToken()
  if (token) {
    merged.set('Authorization', `Bearer ${token}`)
  }

  if (tenantId) {
    merged.set('X-Tenant-Id', String(tenantId))
  }

  const response = await fetch(`${API_URL}/api/v1${path}`, { ...rest, headers: merged })

  if (response.status === 204) {
    return null as T
  }

  const contentType = response.headers.get('content-type') ?? ''

  if (!contentType.includes('application/json')) {
    throw new ApiError(response.status, {
      message:
        'The API is not reachable from this deployment. Set VITE_API_URL in Vercel and redeploy.',
    })
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(response.status, (data ?? {}) as Record<string, unknown>)
  }

  return data as T
}

export const authApi = {
  login(email: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  register(payload: RegisterPayload) {
    return request<AuthResponse & { message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  me() {
    return request<MeResponse>('/me')
  },

  logout() {
    return request<null>('/auth/logout', { method: 'POST' })
  },

  tenant(tenantId: number) {
    return request<TenantContextResponse>('/tenant', { tenantId })
  },

  updateTenant(tenantId: number, payload: TenantUpdatePayload) {
    return request<{ message: string; tenant: TenantContextResponse['tenant'] }>('/tenant', {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  updateBranch(tenantId: number, branchId: number, payload: BranchUpdatePayload) {
    return request<{ message: string; branch: Branch }>(`/branches/${branchId}`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  resendVerification() {
    return request<{ message: string }>('/auth/email/verification-notification', {
      method: 'POST',
    })
  },
}

export function primaryMembership(user: User | null) {
  if (!user) return null
  return user.memberships.find((membership) => membership.is_active) ?? user.memberships[0] ?? null
}

export const menuApi = {
  async categories(tenantId: number): Promise<MenuCategory[]> {
    const response = await request<{ data: MenuCategory[] }>('/menu/categories', { tenantId })

    return response.data
  },

  items(tenantId: number) {
    return request<Paginated<MenuItem>>('/menu/items?per_page=100', { tenantId })
  },

  createCategory(tenantId: number, payload: MenuCategoryPayload) {
    return request<MenuMutationResponse>('/menu/categories', {
      method: 'POST',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  updateCategory(tenantId: number, id: number, payload: MenuCategoryPayload) {
    return request<MenuMutationResponse>(`/menu/categories/${id}`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  deleteCategory(tenantId: number, id: number) {
    return request<null>(`/menu/categories/${id}`, { method: 'DELETE', tenantId })
  },

  createItem(tenantId: number, payload: MenuItemPayload) {
    return request<MenuMutationResponse>('/menu/items', {
      method: 'POST',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  updateItem(tenantId: number, id: number, payload: MenuItemPayload) {
    return request<MenuMutationResponse>(`/menu/items/${id}`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  deleteItem(tenantId: number, id: number) {
    return request<null>(`/menu/items/${id}`, { method: 'DELETE', tenantId })
  },
}

export const orderApi = {
  summary(tenantId: number) {
    return request<OrderSummary>('/orders/summary', { tenantId })
  },

  list(
    tenantId: number,
    params: { status?: OrderStatus; date?: string; search?: string; page?: number } = {},
  ) {
    const query = new URLSearchParams()

    if (params.status) query.set('status', params.status)
    if (params.date) query.set('date', params.date)
    if (params.search) query.set('search', params.search)
    if (params.page && params.page > 1) query.set('page', String(params.page))

    const suffix = query.toString()

    return request<Paginated<Order>>(`/orders${suffix ? `?${suffix}` : ''}`, { tenantId })
  },

  show(tenantId: number, orderId: number) {
    return request<{ order: Order }>(`/orders/${orderId}`, { tenantId })
  },

  create(tenantId: number, payload: CreateOrderPayload) {
    return request<OrderMutationResponse>('/orders', {
      method: 'POST',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  pay(tenantId: number, orderId: number, amountPaidCents: number) {
    return request<OrderMutationResponse>(`/orders/${orderId}/pay`, {
      method: 'POST',
      tenantId,
      body: JSON.stringify({ amount_paid_cents: amountPaidCents }),
    })
  },

  void(tenantId: number, orderId: number) {
    return request<OrderMutationResponse>(`/orders/${orderId}/void`, {
      method: 'POST',
      tenantId,
    })
  },
}

export const tableApi = {
  async list(
    tenantId: number,
    params: { branchId?: number | null; status?: TableStatus; search?: string } = {},
  ): Promise<TableListResponse> {
    const query = new URLSearchParams()

    if (params.branchId) query.set('branch_id', String(params.branchId))
    if (params.status) query.set('status', params.status)
    if (params.search) query.set('search', params.search)

    const suffix = query.toString()
    const response = await request<TableListResponse>(`/tables${suffix ? `?${suffix}` : ''}`, {
      tenantId,
    })

    // Never let an unexpected response shape blank the floor view.
    return { ...response, data: Array.isArray(response.data) ? response.data : [] }
  },

  create(tenantId: number, payload: DiningTablePayload) {
    return request<TableMutationResponse>('/tables', {
      method: 'POST',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  update(tenantId: number, id: number, payload: Partial<DiningTablePayload>) {
    return request<TableMutationResponse>(`/tables/${id}`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  status(tenantId: number, id: number, status: TableStatus) {
    return request<TableMutationResponse>(`/tables/${id}/status`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify({ status }),
    })
  },

  remove(tenantId: number, id: number) {
    return request<{ message: string }>(`/tables/${id}`, { method: 'DELETE', tenantId })
  },
}

export const staffApi = {
  async list(
    tenantId: number,
    params: { role?: StaffPayload['role']; search?: string } = {},
  ): Promise<StaffListResponse> {
    const query = new URLSearchParams()

    if (params.role) query.set('role', params.role)
    if (params.search) query.set('search', params.search)

    const suffix = query.toString()
    const response = await request<StaffListResponse>(`/staff${suffix ? `?${suffix}` : ''}`, {
      tenantId,
    })

    return { ...response, data: Array.isArray(response.data) ? response.data : [] }
  },

  create(tenantId: number, payload: StaffPayload) {
    return request<StaffMutationResponse>('/staff', {
      method: 'POST',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  update(tenantId: number, id: number, payload: Partial<StaffPayload>) {
    return request<StaffMutationResponse>(`/staff/${id}`, {
      method: 'PATCH',
      tenantId,
      body: JSON.stringify(payload),
    })
  },

  remove(tenantId: number, id: number) {
    return request<{ message: string }>(`/staff/${id}`, { method: 'DELETE', tenantId })
  },
}

export const adminApi = {
  stats() {
    return request<AdminStats>('/admin/stats')
  },

  tenants(params: { status?: TenantStatus; search?: string; page?: number } = {}) {
    const query = new URLSearchParams()

    if (params.status) query.set('status', params.status)
    if (params.search) query.set('search', params.search)
    if (params.page && params.page > 1) query.set('page', String(params.page))

    const suffix = query.toString()

    return request<Paginated<AdminTenant>>(`/admin/tenants${suffix ? `?${suffix}` : ''}`)
  },

  approve(tenantId: number) {
    return request<AdminActionResponse>(`/admin/tenants/${tenantId}/approve`, { method: 'POST' })
  },

  suspend(tenantId: number, reason: string) {
    return request<AdminActionResponse>(`/admin/tenants/${tenantId}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || null }),
    })
  },

  reactivate(tenantId: number) {
    return request<AdminActionResponse>(`/admin/tenants/${tenantId}/reactivate`, { method: 'POST' })
  },
}
