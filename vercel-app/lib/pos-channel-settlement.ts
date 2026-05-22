/**
 * POS 채널 정산(카드·배달앱) — 채널 코드·수수료 계정·GROSS 조회
 */

export const POS_CHANNEL_SETTLEMENT_CHANNELS = [
  'card',
  'grab',
  'lineman',
  'shopee',
  'delivery_all',
] as const

export type PosChannelSettlementChannel = (typeof POS_CHANNEL_SETTLEMENT_CHANNELS)[number]

export function normalizePosChannelSettlementChannel(raw: unknown): PosChannelSettlementChannel | null {
  const c = String(raw ?? '')
    .trim()
    .toLowerCase()
  if ((POS_CHANNEL_SETTLEMENT_CHANNELS as readonly string[]).includes(c)) {
    return c as PosChannelSettlementChannel
  }
  return null
}

export function feeAccountCodeForChannel(channel: PosChannelSettlementChannel): string {
  return channel === 'card' ? '5521' : '5522'
}

export function feeAccountNameForChannel(channel: PosChannelSettlementChannel): string {
  return channel === 'card' ? '카드정산수수료' : '배달플랫폼수수료'
}

export function roundSettlementMoney(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100)
}

export function deriveFeeFromGrossNet(gross: number, net: number): number {
  return roundSettlementMoney(Math.max(0, gross - net))
}

export type PosChannelGrossRow = {
  gross: number
  orderCount: number
  cardFeeTotal: number
}

