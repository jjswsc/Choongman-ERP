/**
 * Banban(반반) 맛 전용 매장 품절 — 단품 치킨 sold_out 과 분리.
 */

import type { PosMenuSoldOutScope } from '@/lib/pos-menu-sold-out'
import { normalizePosMenuSoldOutScope } from '@/lib/pos-menu-sold-out'

/** storefront = 홀·포장·QR·픽업, delivery = Grab 등 배달 */
export type BanbanFlavorSoldOutChannel = 'storefront' | 'delivery'

export function shouldApplyBanbanFlavorSoldOutForChannel(
  channel: BanbanFlavorSoldOutChannel,
  scope: PosMenuSoldOutScope
): boolean {
  if (channel === 'delivery' && scope === 'store') return false
  return true
}

export { normalizePosMenuSoldOutScope }
