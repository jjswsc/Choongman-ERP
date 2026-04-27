import type { PosMenu, PosMenuOption } from '@/lib/api-client'

/** POS 주문/표시 맥락 (URL·화면 type 와 맞춤) */
export type PosDescriptionChannel = 'dine_in' | 'takeout' | 'delivery'

function trimS(s: string | null | undefined): string {
  return (s ?? '').trim()
}

/**
 * 메뉴 설명: 관리자에서 입력한 채널별 필드 → 주문 맥락에 맞는 한 문단.
 * - delivery: 배달용 → 기본
 * - dine_in: 테이블/홀(테이블오더) → 테이블용 → 기본
 * - takeout: 포장 → 기본
 */
export function resolvePosMenuDescriptionForChannel(
  menu: Pick<PosMenu, 'descriptionDefault' | 'descriptionDelivery' | 'descriptionTable'>,
  channel: PosDescriptionChannel
): string {
  const def = trimS(menu.descriptionDefault)
  if (channel === 'delivery') {
    return trimS(menu.descriptionDelivery) || def
  }
  if (channel === 'dine_in') {
    return trimS(menu.descriptionTable) || def
  }
  return def
}

export function resolvePosMenuOptionDescriptionForChannel(
  opt: Pick<PosMenuOption, 'descriptionDefault' | 'descriptionDelivery' | 'descriptionTable'>,
  channel: PosDescriptionChannel
): string {
  const def = trimS(opt.descriptionDefault)
  if (channel === 'delivery') {
    return trimS(opt.descriptionDelivery) || def
  }
  if (channel === 'dine_in') {
    return trimS(opt.descriptionTable) || def
  }
  return def
}

export function posDescriptionChannelFromTerminalType(
  orderType: 'dine-in' | 'takeout' | 'delivery'
): PosDescriptionChannel {
  if (orderType === 'dine-in') return 'dine_in'
  return orderType
}
