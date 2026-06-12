import 'server-only'

import { fetchErpStoresMaster } from '@/lib/erp-store-master'
import {
  isMemberPortalPrepayStore,
  loadMemberPortalPrepayConfig,
} from '@/lib/member-portal-prepay-config'
import {
  isMemberPortalPublicStore,
  memberPortalStoresFromMasters,
  type MemberPortalStoreDto,
} from '@/lib/member-portal-stores-shared'

export async function memberPortalStoresForSession(): Promise<MemberPortalStoreDto[]> {
  const rows = await fetchErpStoresMaster()
  const prepay = await loadMemberPortalPrepayConfig()
  return memberPortalStoresFromMasters(rows, {
    orderStoreFilter: (store) =>
      isMemberPortalPublicStore(store) ||
      (prepay.enabled && isMemberPortalPrepayStore(store, prepay)),
  })
}
