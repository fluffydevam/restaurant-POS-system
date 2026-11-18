import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { authApi, primaryMembership } from '../lib/api'
import { membershipForSlug } from '../lib/workspace'
import { useAuth } from '../store/auth'

export function useWorkspace(slugOverride?: string) {
  const { slug: routeSlug } = useParams<{ slug?: string }>()
  const slug = slugOverride ?? routeSlug ?? null
  const user = useAuth((state) => state.user)
  const clear = useAuth((state) => state.clear)
  const membership = slug ? membershipForSlug(user, slug) : primaryMembership(user)
  const tenantId = membership?.tenant_id ?? 0

  const query = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => authApi.tenant(tenantId),
    enabled: tenantId > 0,
  })

  return {
    user,
    clear,
    slug,
    membership,
    tenantId,
    tenant: query.data?.tenant ?? membership?.tenant,
    branches: query.data?.tenant.branches ?? membership?.tenant.branches ?? [],
    isLoading: query.isLoading,
  }
}
