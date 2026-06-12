import type { GrabPosCatalog } from '@/lib/grab-pos-order-enrich'
import {
  mergeGrabSetChildLinesIntoPromoParents,
  parseGrabSetChildLineName,
  type GrabSetPosLine,
} from '@/lib/grab-set-pos-lines'

/**
 * Grab 주방 인쇄 — 영수증과 동일하게 세트 자식을 부모 promoItems로 병합하고
 * `grabSetChild` 중복 줄을 제거한다. (미적용 시 Banban 맛·치킨 사이즈가 빠진 채 2장 출력됨)
 */
export function mergeGrabOrderItemsForKitchenPrint(
  items: GrabSetPosLine[],
  catalog: GrabPosCatalog
): GrabSetPosLine[] {
  const base = Array.isArray(items) ? items : []
  const needsMerge = base.some(
    (it) => parseGrabSetChildLineName(String(it.name ?? '')) || Boolean(it.grabSetChild)
  )
  const merged = needsMerge ? mergeGrabSetChildLinesIntoPromoParents(base, catalog) : base
  return merged.filter((it) => !it.grabSetChild)
}
