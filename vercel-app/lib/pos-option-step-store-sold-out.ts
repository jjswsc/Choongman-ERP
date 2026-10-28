/**
 * 매장별 옵션 단계(부위 등) 품절 — step_key/step_value 키 유틸.
 * sold_out_date 가 있으면 품절(수동 해제 전까지 유지).
 */

import type { PosMenuSoldOutScope } from '@/lib/pos-menu-sold-out'
import { normalizePosMenuSoldOutScope } from '@/lib/pos-menu-sold-out'

export const OPTION_STEP_SOLD_OUT_PART_KEY = 'part'

/** storefront = 홀·포장·QR·픽업, delivery = Grab 등 배달 */
export type OptionStepSoldOutChannel = 'storefront' | 'delivery'

export function optionStepSoldOutKey(stepKey: string, stepValue: string): string {
  return `${String(stepKey || '').trim()}:${String(stepValue || '').trim()}`
}

export function normalizeOptionStepKey(raw: unknown): string {
  return String(raw || '').trim()
}

export function normalizeOptionStepValue(raw: unknown): string {
  return String(raw || '').trim()
}

/** option_step_values 가 매장 품절 Set 에 걸리면 true (delivery + scope=store 는 호출측에서 스킵) */
export function optionStepValuesHitSoldOut(
  optionStepValues: Record<string, string> | null | undefined,
  soldOutKeys: ReadonlySet<string>
): boolean {
  if (!optionStepValues || soldOutKeys.size === 0) return false
  for (const [k, v] of Object.entries(optionStepValues)) {
    const key = normalizeOptionStepKey(k)
    const val = normalizeOptionStepValue(v)
    if (!key || !val) continue
    if (soldOutKeys.has(optionStepSoldOutKey(key, val))) return true
  }
  return false
}

export function shouldApplyOptionStepSoldOutForChannel(
  channel: OptionStepSoldOutChannel,
  scope: PosMenuSoldOutScope
): boolean {
  if (channel === 'delivery' && scope === 'store') return false
  return true
}

/**
 * 옵션 응답에 매장 부위 품절을 sell_* 플래그로 반영.
 * - storefrontKeys: 홀·포장·픽업 off (scope=store|all)
 * - deliveryKeys: 배달 off (scope=all 만 — load 시 channel=delivery)
 */
export function applyPartSoldOutToOptionFlags<
  T extends {
    optionStepValues?: Record<string, string> | null
    sellHall?: boolean
    sellDelivery?: boolean
    sellPackaging?: boolean
    sellMember?: boolean
  },
>(
  options: T[],
  keys: {
    storefrontKeys?: ReadonlySet<string>
    deliveryKeys?: ReadonlySet<string>
  }
): T[] {
  const storefrontKeys = keys.storefrontKeys
  const deliveryKeys = keys.deliveryKeys
  if ((!storefrontKeys || !storefrontKeys.size) && (!deliveryKeys || !deliveryKeys.size)) {
    return options
  }
  return options.map((opt) => {
    const hitStore =
      !!storefrontKeys?.size && optionStepValuesHitSoldOut(opt.optionStepValues, storefrontKeys)
    const hitDelivery =
      !!deliveryKeys?.size && optionStepValuesHitSoldOut(opt.optionStepValues, deliveryKeys)
    if (!hitStore && !hitDelivery) return opt
    return {
      ...opt,
      ...(hitStore
        ? { sellHall: false, sellPackaging: false, sellMember: false }
        : null),
      ...(hitDelivery ? { sellDelivery: false } : null),
    }
  })
}

/** @deprecated applyPartSoldOutToOptionFlags 사용 — 하위 호환 */
export function applyStorefrontPartSoldOutToOptionFlags<
  T extends {
    optionStepValues?: Record<string, string> | null
    sellHall?: boolean
    sellDelivery?: boolean
    sellPackaging?: boolean
    sellMember?: boolean
  },
>(options: T[], soldOutKeys: ReadonlySet<string>): T[] {
  return applyPartSoldOutToOptionFlags(options, { storefrontKeys: soldOutKeys })
}

export { normalizePosMenuSoldOutScope }
export type { PosMenuSoldOutScope }
