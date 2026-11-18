import { useParams } from 'react-router-dom'
import type { Membership, User } from './types'

export const LAST_SLUG_KEY = 'pos_last_slug'

export function activeMemberships(user: User | null): Membership[] {
  if (!user) return []

  return user.memberships.filter(
    (membership) => membership.is_active && membership.tenant.status === 'active',
  )
}

export function membershipForSlug(user: User | null, slug?: string | null): Membership | null {
  if (!user || !slug) return null

  return activeMemberships(user).find((membership) => membership.tenant.slug === slug) ?? null
}

export function pendingMembership(user: User | null): Membership | null {
  if (!user) return null

  return (
    user.memberships.find(
      (membership) => membership.is_active && membership.tenant.status !== 'active',
    ) ?? null
  )
}

export function firstWorkspaceSlug(user: User | null): string | null {
  return activeMemberships(user)[0]?.tenant.slug ?? null
}

export function rememberSlug(slug: string): void {
  try {
    localStorage.setItem(LAST_SLUG_KEY, slug)
  } catch {
    // Private browsing can block storage; the switcher still works per session.
  }
}

export function rememberedSlug(user: User | null): string | null {
  try {
    const slug = localStorage.getItem(LAST_SLUG_KEY)
    if (slug && activeMemberships(user).some((membership) => membership.tenant.slug === slug)) {
      return slug
    }
  } catch {
    // Fall through to the first active membership.
  }

  return null
}

export function workspaceBase(slug?: string | null): string {
  return slug ? `/t/${slug}` : ''
}

export function workspacePath(slug: string | null | undefined, path = ''): string {
  const base = workspaceBase(slug)
  if (!path) return base || '/'
  return `${base}/${path.replace(/^\/+/, '')}`
}

/** Current `/t/{slug}` prefix for the active route, or an empty string on legacy paths. */
export function useWorkspaceBase(): string {
  const { slug } = useParams<{ slug?: string }>()

  return workspaceBase(slug)
}
