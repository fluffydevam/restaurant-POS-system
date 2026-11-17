import type {
  AdminActionResponse,
  AdminStats,
  AdminTenant,
  AuthResponse,
  MeResponse,
  Paginated,
  RegisterPayload,
  TenantContextResponse,
  TenantStatus,
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
