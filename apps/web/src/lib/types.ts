export type TenantStatus = 'pending_approval' | 'active' | 'suspended' | 'cancelled'

export interface Branch {
  id: number
  name: string
  address: string | null
  timezone: string | null
  is_default: boolean
  is_active: boolean
}

export interface ChargeSetting {
  enabled: boolean
  rate_bps: number
}

export interface TenantSettings {
  restaurant_type?: string
  phone?: string | null
  receipt_footer?: string | null
  tax?: ChargeSetting
  service_charge?: ChargeSetting
  onboarding?: { completed: boolean; completed_at?: string | null }
  [key: string]: unknown
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
  settings: TenantSettings | null
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

export interface MenuCategory {
  id: number
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  items_count?: number
}

export interface MenuItem {
  id: number
  menu_category_id: number | null
  name: string
  description: string | null
  sku: string | null
  price_cents: number
  image_url: string | null
  sort_order: number
  is_active: boolean
  is_available: boolean
}

export interface MenuCategoryPayload {
  name: string
  description?: string | null
  sort_order?: number
  is_active?: boolean
}

export interface MenuItemPayload {
  menu_category_id?: number | null
  name: string
  description?: string | null
  sku?: string | null
  price_cents: number
  image_url?: string | null
  sort_order?: number
  is_active?: boolean
  is_available?: boolean
}

export interface MenuMutationResponse {
  message: string
  item?: MenuItem
  category?: MenuCategory
}

export type OrderStatus = 'open' | 'completed' | 'voided'
export type OrderType = 'dine_in' | 'takeaway' | 'delivery'

export interface OrderItem {
  id: number
  menu_item_id: number | null
  name: string
  sku: string | null
  unit_price_cents: number
  quantity: number
  line_total_cents: number
  notes: string | null
}

export interface Order {
  id: number
  order_number: string
  status: OrderStatus
  status_label: string
  type: OrderType
  type_label: string
  customer_name: string | null
  notes: string | null
  subtotal_cents: number
  discount_cents: number
  service_charge_cents: number
  tax_cents: number
  total_cents: number
  amount_paid_cents: number
  change_cents: number
  payment_method: string | null
  items_count?: number
  items?: OrderItem[]
  branch?: Branch
  cashier?: { id: number | null; name: string | null }
  placed_at: string | null
  paid_at: string | null
  created_at: string | null
}

export interface OrderSummary {
  date: string
  orders_today: number
  sales_today_cents: number
  items_sold_today: number
  open_orders: number
  average_order_cents: number
}

export interface OrderMutationResponse {
  message: string
  order: Order
}

export interface CreateOrderPayload {
  type?: OrderType
  branch_id?: number | null
  customer_name?: string | null
  notes?: string | null
  items: { menu_item_id: number; quantity: number; notes?: string | null }[]
}

export interface TenantUpdatePayload {
  name?: string
  country?: string | null
  timezone?: string
  currency?: string
  phone?: string | null
  receipt_footer?: string | null
  tax_enabled?: boolean
  tax_rate?: number
  service_charge_enabled?: boolean
  service_charge_rate?: number
  onboarding_completed?: boolean
}

export interface BranchUpdatePayload {
  name?: string
  address?: string | null
  timezone?: string | null
  is_active?: boolean
}

export interface LimitUsage {
  used: number
  limit: number
  percent: number
  near_limit: boolean
  at_limit: boolean
}

export type LimitResource = 'branches' | 'tables' | 'staff' | 'menu_items'

export type LimitUsageMap = Record<LimitResource, LimitUsage>

export interface LimitsMeta {
  limits: LimitUsageMap
}

export type TableStatus = 'available' | 'occupied' | 'reserved'

export interface DiningTable {
  id: number
  branch_id: number | null
  branch?: Branch | null
  name: string
  zone: string | null
  seats: number
  status: TableStatus
  status_label: string
  sort_order: number
  is_active: boolean
}

export interface DiningTablePayload {
  branch_id?: number | null
  name: string
  zone?: string | null
  seats?: number
  status?: TableStatus
  sort_order?: number
  is_active?: boolean
}

export interface TableListResponse {
  data: DiningTable[]
  meta: LimitsMeta
}

export interface TableMutationResponse {
  message: string
  table: DiningTable
  meta?: LimitsMeta
}

export type StaffRole = 'owner' | 'manager' | 'staff'

export interface StaffMember {
  id: number
  user_id: number
  name: string | null
  email: string | null
  role: StaffRole
  is_active: boolean
  branch?: Branch | null
  joined_at: string | null
}

export interface StaffPayload {
  name: string
  email?: string
  password?: string
  role: StaffRole
  branch_id?: number | null
  is_active?: boolean
}

export interface StaffListResponse {
  data: StaffMember[]
  meta: LimitsMeta
}

export interface StaffMutationResponse {
  message: string
  staff: StaffMember
  meta?: LimitsMeta
}
