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
  return channel === 'card' ? '5529' : '5528'
}

export function feeAccountNameForChannel(channel: PosChannelSettlementChannel): string {
  return channel === 'card' ? '카드수수료' : '배달앱수수료'
}

export function roundSettlementMoney(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100)
}

export function deriveFeeFromGrossNet(gross: number, net: number): number {
  return roundSettlementMoney(Math.max(0, gross - net))
}

export type ChannelSettlementJournalLine = {
  accountCode: string
  accountName: string
  side: 'debit' | 'credit'
  amount: number
  memo?: string
}

/**
 * 채널 정산 분개.
 * - 통장이 아직 1010을 안 올린 경우: Dr 1010(NET) + Dr 수수료(FEE), Cr 1130(GROSS)
 * - 매출 수령으로 NET을 이미 올린 경우: Dr 수수료(FEE), Cr 1130(FEE) 만 (현금 이중 금지)
 */
export function linesForPosChannelSettlement(params: {
  channel: PosChannelSettlementChannel
  gross: number
  fee: number
  net: number
  bankNetAlreadyPosted?: boolean
}): ChannelSettlementJournalLine[] {
  const gross = roundSettlementMoney(Math.abs(Number(params.gross) || 0))
  const fee = roundSettlementMoney(Math.abs(Number(params.fee) || 0))
  const net = roundSettlementMoney(Math.abs(Number(params.net) || 0))
  const feeCode = feeAccountCodeForChannel(params.channel)
  const feeName = feeAccountNameForChannel(params.channel)
  if (params.bankNetAlreadyPosted) {
    if (fee <= 0.02) return []
    return [
      {
        accountCode: feeCode,
        accountName: feeName,
        side: 'debit',
        amount: fee,
        memo: '채널 정산 수수료',
      },
      {
        accountCode: '1130',
        accountName: '결제대기자산',
        side: 'credit',
        amount: fee,
        memo: `${params.channel} 수수료 채권 소거`,
      },
    ]
  }
  const lines: ChannelSettlementJournalLine[] = []
  if (net > 0) {
    lines.push({
      accountCode: '1010',
        accountName: '현금및예금',
      side: 'debit',
      amount: net,
      memo: `${params.channel} 정산 입금`,
    })
  }
  if (fee > 0) {
    lines.push({
      accountCode: feeCode,
      accountName: feeName,
      side: 'debit',
      amount: fee,
      memo: '채널 정산 수수료',
    })
  }
  if (gross > 0) {
    lines.push({
      accountCode: '1130',
      accountName: '결제대기자산',
      side: 'credit',
      amount: gross,
      memo: `${params.channel} 채권 소거`,
    })
  }
  return lines
}

export type PosChannelGrossRow = {
  gross: number
  orderCount: number
  cardFeeTotal: number
}

