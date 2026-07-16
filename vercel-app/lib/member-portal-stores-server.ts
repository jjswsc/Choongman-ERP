import 'server-only'

import {
  fetchErpStoresMaster,
  fetchErpStoresMasterForTenant,
} from '@/lib/erp-store-master'
import { resolveMemberPortalTenantScope } from '@/lib/member-portal-tenant-scope'
import {
  isMemberPortalPrepayStore,
  loadMemberPortalPrepayConfig,
} from '@/lib/member-portal-prepay-config'
import {
  isMemberPortalPublicStore,
  memberPortalStoresFromMasters,
  type MemberPortalStoreDto,
} from '@/lib/member-portal-stores-shared'
import type { NextRequest } from 'next/server'

export async function memberPortalStoresForSession(
  request?: NextRequest,
  memberId?: number | null
): Promise<MemberPortalStoreDto[]> {
  const tenantScope = await resolveMemberPortalTenantScope({ request, memberId })
  const rows =
    tenantScope.enforce && tenantScope.tenantId
      ? await fetchErpStoresMasterForTenant(tenantScope.tenantId)
      : await fetchErpStoresMaster()
  const prepay = await loadMemberPortalPrepayConfig()
  return memberPortalStoresFromMasters(rows, {
    orderStoreFilter: (store) =>
      isMemberPortalPublicStore(store) ||
      (prepay.enabled && isMemberPortalPrepayStore(store, prepay)),
  })
}
