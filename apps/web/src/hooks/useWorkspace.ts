import { useQuery } from '@tanstack/react-query'
import { authApi, primaryMembership } from '../lib/api'
import { useAuth } from '../store/auth'

export function useWorkspace() {
  const user = useAuth((state) => state.user)
  const clear = useAuth((state) => state.clear)
  const membership = primaryMembership(user)
  const tenantId = membership?.tenant_id ?? 0

  const query = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => authApi.tenant(tenantId),
    enabled: tenantId > 0,
  })

  return {
    user,
    clear,
    membership,
    tenantId,
    tenant: query.data?.tenant ?? membership?.tenant,
    branches: query.data?.tenant.branches ?? membership?.tenant.branches ?? [],
    isLoading: query.isLoading,
  }
}
