export type PosCartOrderType = 'dine-in' | 'delivery' | 'takeout'

/**
 * CartPanel과 동일 규칙 — 모듈 캐시/부모 단일 상태 모두 같은 키로 맞춤.
 * dine-in: 배달·포장 식별자는 키에서 제외(이미 CartPanel과 동일).
 */
export function getPosCartSessionKey(args: {
  currentStoreId: string
  orderType: PosCartOrderType
  selectedTableId: string
  deliveryApp?: string | null
  deliveryOrderNo?: string | null
  takeoutLabel?: string | null
}): string {
  const deliveryAppKey = args.orderType === 'delivery' ? (args.deliveryApp ?? '') : ''
  const deliveryOrderNoKey = args.orderType === 'delivery' ? (args.deliveryOrderNo ?? '') : ''
  const takeoutLabelCacheSegment =
    args.orderType === 'takeout' || args.orderType === 'delivery' ? (args.takeoutLabel ?? '') : ''
  return `${args.currentStoreId}|${args.orderType}|${args.selectedTableId}|${deliveryAppKey}|${deliveryOrderNoKey}|${takeoutLabelCacheSegment}`
}
