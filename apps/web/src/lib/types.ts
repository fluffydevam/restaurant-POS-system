export type TenantStatus = 'pending_approval' | 'active' | 'suspended' | 'cancelled'

export interface Branch {
  id: number
  name: string
  address: string | null
  timezone: string | null
  is_default: boolean
  is_active: boolean
}

export interface Tenant {
  id: number
  name: string
  slug: string
  status: TenantStatus
  status_label: string
  country: string | null
  timezone: string
  currency: string
  settings: Record<string, unknown> | null
  approved_at: string | null
  branches?: Branch[]
}

export interface Membership {
  id: number
  tenant_id: number
  branch_id: number | null
  role: string
  is_active: boolean
  tenant: Tenant
}

export interface User {
  id: number
  name: string
  email: string
  email_verified_at: string | null
  is_platform_admin: boolean
  memberships: Membership[]
  created_at?: string
}

export interface AuthResponse {
  token: string
  user: User
}

export interface MeResponse {
  user: User
}

export interface TenantContextResponse {
  tenant: Tenant
  membership: Membership
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  password_confirmation: string
  restaurant_name: string
  country: string
  timezone: string
  restaurant_type: 'cafe' | 'fast_food' | 'fine_dining' | 'food_truck' | 'other'
}

export interface AdminTenantOwner {
  name: string | null
  email: string | null
  email_verified_at: string | null
}

export interface AdminTenant {
  id: number
  name: string
  slug: string
  status: TenantStatus
  status_label: string
  country: string | null
  timezone: string
  currency: string
  settings: Record<string, unknown> | null
  branches_count: number
  suspended_reason: string | null
  approved_at: string | null
  created_at: string | null
  owner: AdminTenantOwner | null
}

export interface AdminStats {
  total: number
  pending: number
  active: number
  suspended: number
  cancelled: number
}

export interface PaginationMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
  links: Record<string, string | null>
}

export interface AdminActionResponse {
  message: string
  tenant: AdminTenant
}
