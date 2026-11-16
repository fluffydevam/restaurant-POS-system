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
