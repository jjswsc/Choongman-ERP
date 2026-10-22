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

export function settlementPostedMatchesForm(
  posted: { gross?: number; fee?: number; net?: number } | null | undefined,
  form: { gross: number; fee: number; net: number },
  eps = 0.02
): boolean {
  if (!posted) return false
  return (
    Math.abs(Number(posted.gross) - form.gross) <= eps &&
    Math.abs(Number(posted.fee) - form.fee) <= eps &&
    Math.abs(Number(posted.net) - form.net) <= eps
  )
}

/**
 * POS GROSS 조회가 비었을 때, 이미 저장된 채널 정산(Posted)으로 폼 금액을 채운다.
 * 은행 화면에서 GROSS=0처럼 보여 Posted와 불일치로 보이던 UX를 줄인다.
 */
export function resolveChannelSettlementFormAmounts(params: {
  posGross: number
  posted?: { gross?: number; fee?: number; net?: number } | null
  preferredNet?: number | null
}): {
  gross: number
  fee: number
  net: number
  source: 'pos' | 'posted' | 'empty'
} {
  const preferredNet = roundSettlementMoney(Number(params.preferredNet) || 0)
  const posGross = roundSettlementMoney(Number(params.posGross) || 0)
  if (posGross > 0.02) {
    return {
      gross: posGross,
      net: preferredNet,
      fee: deriveFeeFromGrossNet(posGross, preferredNet),
      source: 'pos',
    }
  }
  const postedGross = roundSettlementMoney(Number(params.posted?.gross) || 0)
  if (postedGross <= 0.02) {
    return { gross: 0, fee: 0, net: preferredNet, source: 'empty' }
  }
  const postedNet = roundSettlementMoney(Number(params.posted?.net) || 0)
  const net = preferredNet > 0.02 ? preferredNet : postedNet
  const postedFee = roundSettlementMoney(Number(params.posted?.fee) || 0)
  const fee =
    postedFee > 0.02 && Math.abs(postedGross - postedFee - net) <= 0.02
      ? postedFee
      : deriveFeeFromGrossNet(postedGross, net)
  return { gross: postedGross, fee, net, source: 'posted' }
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
  /** 일일 판매가 이미 현금/은행에 올라간 경우. 수수료만 현금에서 뺀다. */
  salesAlreadyOnCash?: boolean
}): ChannelSettlementJournalLine[] {
  const gross = roundSettlementMoney(Math.abs(Number(params.gross) || 0))
  const fee = roundSettlementMoney(Math.abs(Number(params.fee) || 0))
  const net = roundSettlementMoney(Math.abs(Number(params.net) || 0))
  const feeCode = feeAccountCodeForChannel(params.channel)
  const feeName = feeAccountNameForChannel(params.channel)
  if (params.salesAlreadyOnCash) {
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
        accountCode: '1010',
        accountName: '현금및예금',
        side: 'credit',
        amount: fee,
        memo: '일일매출에서 수수료 차감',
      },
    ]
  }
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

