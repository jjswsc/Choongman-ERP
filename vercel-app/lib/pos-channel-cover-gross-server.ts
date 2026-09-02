import { supabaseSelectFilter } from '@/lib/supabase-server'
import { fetchPosChannelSettlementGross } from '@/lib/pos-channel-settlement-gross-server'
import {
  appendCoverMemo,
  claimedCoverDatesFromSettlements,
  pickGrossCoveringNet,
  weekendCoverNeighborDates,
} from '@/lib/pos-channel-cover-gross'
import { roundSettlementMoney, type PosChannelGrossRow, type PosChannelSettlementChannel } from '@/lib/pos-channel-settlement'

export type ChannelGrossCoverRow = PosChannelGrossRow & {
  coverDates: string[]
  expanded: boolean
  partial?: boolean
}

export async function fetchChannelGrossCoveringNet(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  net: number
}): Promise<ChannelGrossCoverRow> {
  const storeCode = String(params.storeCode || '').trim()
  const settleDate = String(params.settleDate || '').slice(0, 10)
  const channel = params.channel
  const net = roundSettlementMoney(Math.abs(Number(params.net) || 0))
  const day0 = await fetchPosChannelSettlementGross({ storeCode, settleDate, channel })
  const single: ChannelGrossCoverRow = {
    ...day0,
    coverDates: [settleDate],
    expanded: false,
    partial: false,
  }
  if (net <= 0) return single
  if (day0.gross + 0.02 >= net) return single

  const neighbors = weekendCoverNeighborDates(settleDate)
  const claimedRows = (await supabaseSelectFilter(
    'pos_channel_settlements',
    `store_code=eq.${encodeURIComponent(storeCode)}&channel=eq.${encodeURIComponent(channel)}` +
      `&settle_date=gte.${encodeURIComponent(neighbors[0]!)}&settle_date=lte.${encodeURIComponent(neighbors[neighbors.length - 1]!)}`,
    { select: 'settle_date,memo,fee_source', limit: 50 }
  )) as { settle_date?: string; memo?: string | null; fee_source?: string | null }[] | null

  const claimed = claimedCoverDatesFromSettlements(claimedRows || [])
  const otherDates = neighbors.filter((d) => d !== settleDate)
  const otherRows = await Promise.all(
    otherDates.map((d) => fetchPosChannelSettlementGross({ storeCode, settleDate: d, channel }))
  )
  const grossByDate = new Map<string, number>([[settleDate, day0.gross]])
  const orderByDate = new Map<string, number>([[settleDate, day0.orderCount]])
  const feeByDate = new Map<string, number>([[settleDate, day0.cardFeeTotal]])
  otherDates.forEach((d, i) => {
    const row = otherRows[i]!
    grossByDate.set(d, row.gross)
    orderByDate.set(d, row.orderCount)
    feeByDate.set(d, row.cardFeeTotal)
  })

  const pick = pickGrossCoveringNet({
    settleDate,
    net,
    channel,
    settleDateGross: day0.gross,
    grossByDate,
    claimedDates: claimed,
  })
  if (!pick || pick.coverDates.length <= 1) return single

  let orderCount = 0
  let cardFeeTotal = 0
  if (pick.partial) {
    orderCount = day0.orderCount
    cardFeeTotal = day0.cardFeeTotal
  } else {
    for (const d of pick.coverDates) {
      orderCount += Number(orderByDate.get(d) || 0)
      cardFeeTotal += Number(feeByDate.get(d) || 0)
    }
  }
  return {
    gross: pick.gross,
    orderCount,
    cardFeeTotal: roundSettlementMoney(cardFeeTotal),
    coverDates: pick.coverDates,
    expanded: true,
    partial: Boolean(pick.partial),
  }
}

export function memoWithWeekendCover(memo: string | null | undefined, coverDates: string[]): string {
  return appendCoverMemo(memo, coverDates)
}
