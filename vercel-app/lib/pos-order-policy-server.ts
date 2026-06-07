import 'server-only'

import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
import { resolvePosBusinessAccountingDate } from '@/lib/pos-order-policy'

export async function resolvePosBusinessAccountingDateForStore(
  createdAtIso: string | undefined,
  storeCode: string
): Promise<string> {
  const hours = await loadPosBusinessHoursForServer(storeCode)
  return resolvePosBusinessAccountingDate(createdAtIso, hours)
}
