/**
 * 손익「배달앱·카드 수수료」— 통장 입금 채널 정산(pos_channel_settlements) 반영.
 * 같은 매장·채널에 월별 일괄 등록(GRAB_FEE·CARD_FEE 등 통장/지급예정)이 있으면 그 달은 일괄 금액만 쓴다(이중 계상 방지).
 * 수수료율이 채널 정상 범위를 벗어난 정산은 입금 오매칭일 가능성이 커서 제외하고 경고로 알린다.
 */
import { storeMatchesIncomeFilter } from '@/lib/accounting-store-match'
import {
  feeAccountSubjectIdsFromMeta,
  type AccountSubjectMetaRow,
} from '@/lib/accounting-reports-expense-routing'
import {
  ACCOUNTING_ROWS_MAX,
  isCardFeeWithdrawRow,
  isDeliveryAppFeeWithdrawRow,
  round2,
} from '@/lib/accounting-reports-shared'
import { channelFeePctBand, isPlausibleCoverFee } from '@/lib/pos-channel-cover-gross'
import { normalizePosChannelSettlementChannel } from '@/lib/pos-channel-settlement'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'

/** 수수료율 범위를 벗어나도 직원이 확인했거나 앱 정산서(CSV)에서 온 금액은 손익에 인정 */
export const CHANNEL_FEE_SOURCE_MANUAL_CONFIRMED = 'manual_confirmed'
const TRUSTED_OUT_OF_BAND_FEE_SOURCES = new Set([CHANNEL_FEE_SOURCE_MANUAL_CONFIRMED, 'csv_import'])

const ANY_DELIVERY = '*delivery'
const DELIVERY_CHANNELS = ['grab', 'lineman', 'shopee'] as const

function storeKey(store: string | null | undefined): string {
  return String(store || '').trim()
}

/** 월별 일괄 등록 행이 덮는 채널 정산 채널 (ROBINHOOD 는 채널 정산이 없음) */
export function feeBatchChannelsForRow(row: { vendor_code?: string | null; memo?: string | null }): string[] {
  const code = String(row.vendor_code || '').split('::')[0].trim().toUpperCase()
  if (code === 'GRAB_FEE') return ['grab']
  if (code === 'LINEMAN_FEE') return ['lineman']
  if (code === 'SHOPEE_FEE') return ['shopee']
  if (code === 'ROBINHOOD_FEE') return []
  if (code === 'CARD_FEE' || code === 'CARD_INSTALLMENT_FEE') return ['card']
  if (isDeliveryAppFeeWithdrawRow(row)) return [ANY_DELIVERY]
  if (isCardFeeWithdrawRow(row)) return ['card']
  return []
}

export function addFeeBatchCoverage(
  coverage: Set<string>,
  store: string | null | undefined,
  row: { vendor_code?: string | null; memo?: string | null }
): void {
  const sk = storeKey(store)
  if (!sk) return
  for (const ch of feeBatchChannelsForRow(row)) coverage.add(`${sk}|${ch}`)
}

function coveringChannels(channel: string): string[] {
  if (channel === 'card') return ['card']
  if (channel === 'delivery_all') return [ANY_DELIVERY, ...DELIVERY_CHANNELS]
  return [ANY_DELIVERY, channel]
}

/** 통장 store(매장명)와 정산 store_code 표기가 달라도 같은 매장이면 일괄로 본다 */
function isCoveredByBatch(coverage: ReadonlySet<string>, store: string, channel: string): boolean {
  const sk = storeKey(store)
  const wanted = coveringChannels(channel)
  for (const key of coverage) {
    const sep = key.lastIndexOf('|')
    if (sep <= 0) continue
    if (!wanted.includes(key.slice(sep + 1))) continue
    const covStore = key.slice(0, sep)
    if (covStore.toLowerCase() === sk.toLowerCase() || storeMatchesIncomeFilter(store, covStore)) return true
  }
  return false
}

export type ChannelSettlementFeeSourceRow = {
  id?: number | null
  store_code?: string | null
  settle_date?: string | null
  channel?: string | null
  gross_amt?: number | null
  fee_amt?: number | null
  net_amt?: number | null
  fee_source?: string | null
  memo?: string | null
  bank_transaction_id?: number | null
}

export type ChannelSettlementFeePlRow = {
  id: number
  settleDate: string
  store: string
  channel: string
  amount: number
  accountSubjectId: number
  memo: string | null
  bankTransactionId: number | null
}

/** 수수료율이 정상 범위를 벗어나 손익에서 뺀 정산 — 직원이 입금 재매칭할 목록 */
export type ChannelSettlementFeeExcludedRow = {
  id: number
  settleDate: string
  store: string
  channel: string
  gross: number
  net: number
  fee: number
  feePct: number
  maxPct: number
  accountSubjectId: number
  bankTransactionId: number | null
}

export type ChannelSettlementFeesForPl = {
  bySubject: Map<number | null, number>
  deliveryAppFees: number
  cardFees: number
  rows: ChannelSettlementFeePlRow[]
  excludedRows: ChannelSettlementFeeExcludedRow[]
  skippedBatch: { count: number; fee: number }
  implausible: { count: number; fee: number }
}

export function emptyChannelSettlementFeesForPl(): ChannelSettlementFeesForPl {
  return {
    bySubject: new Map(),
    deliveryAppFees: 0,
    cardFees: 0,
    rows: [],
    excludedRows: [],
    skippedBatch: { count: 0, fee: 0 },
    implausible: { count: 0, fee: 0 },
  }
}

export function aggregateChannelSettlementFeesForPl(
  rows: ChannelSettlementFeeSourceRow[],
  opts: {
    coverage: ReadonlySet<string>
    deliverySubjectId: number | null
    cardSubjectId: number | null
    storeFilter?: string
  }
): ChannelSettlementFeesForPl {
  const out = emptyChannelSettlementFeesForPl()
  let delivery = 0
  let card = 0
  let skippedFee = 0
  let implausibleFee = 0
  for (const r of rows) {
    const channel = normalizePosChannelSettlementChannel(r.channel)
    if (!channel) continue
    const store = String(r.store_code || '').trim()
    if (!store) continue
    if (opts.storeFilter && opts.storeFilter !== 'All' && !storeMatchesIncomeFilter(store, opts.storeFilter)) continue
    const fee = round2(Math.abs(Number(r.fee_amt) || 0))
    if (fee <= 0) continue
    const subjectId = channel === 'card' ? opts.cardSubjectId : opts.deliverySubjectId
    if (subjectId == null) continue
    if (isCoveredByBatch(opts.coverage, store, channel)) {
      out.skippedBatch.count++
      skippedFee += fee
      continue
    }
    const bankTransactionId = Math.floor(Number(r.bank_transaction_id) || 0) || null
    const trusted = TRUSTED_OUT_OF_BAND_FEE_SOURCES.has(String(r.fee_source || '').trim().toLowerCase())
    const gross = Number(r.gross_amt) || 0
    const net = Number(r.net_amt) || 0
    if (!trusted && !isPlausibleCoverFee(channel, gross, net)) {
      out.implausible.count++
      implausibleFee += fee
      out.excludedRows.push({
        id: Math.floor(Number(r.id) || 0),
        settleDate: String(r.settle_date || '').slice(0, 10),
        store,
        channel,
        gross: round2(gross),
        net: round2(net),
        fee,
        feePct: gross > 0 ? Math.round((fee / gross) * 1000) / 10 : 0,
        maxPct: channelFeePctBand(channel).max,
        accountSubjectId: subjectId,
        bankTransactionId,
      })
      continue
    }
    out.bySubject.set(subjectId, (out.bySubject.get(subjectId) || 0) + fee)
    if (channel === 'card') card += fee
    else delivery += fee
    out.rows.push({
      id: Math.floor(Number(r.id) || 0),
      settleDate: String(r.settle_date || '').slice(0, 10),
      store,
      channel,
      amount: fee,
      accountSubjectId: subjectId,
      memo: r.memo != null ? String(r.memo) : null,
      bankTransactionId,
    })
  }
  for (const [k, v] of out.bySubject) out.bySubject.set(k, round2(v))
  out.deliveryAppFees = round2(delivery)
  out.cardFees = round2(card)
  out.skippedBatch.fee = round2(skippedFee)
  out.implausible.fee = round2(implausibleFee)
  return out
}

export async function loadChannelSettlementFeesForPl(params: {
  startStr: string
  endStr: string
  storeFilter: string
  isHQ: boolean
  subjectMeta: Map<number, AccountSubjectMetaRow>
  coverage: ReadonlySet<string>
}): Promise<ChannelSettlementFeesForPl & { fetched: number }> {
  if (params.isHQ) return { ...emptyChannelSettlementFeesForPl(), fetched: 0 }
  const { deliveryIds, cardIds } = feeAccountSubjectIdsFromMeta(params.subjectMeta)
  const deliverySubjectId = deliveryIds.size > 0 ? [...deliveryIds][0]! : null
  const cardSubjectId = cardIds.size > 0 ? [...cardIds][0]! : null
  if (deliverySubjectId == null && cardSubjectId == null) {
    return { ...emptyChannelSettlementFeesForPl(), fetched: 0 }
  }
  try {
    const rows = (await supabaseSelectFilterAllPages(
      'pos_channel_settlements',
      `settle_date=gte.${params.startStr}&settle_date=lte.${params.endStr}`,
      {
        select: 'id,store_code,settle_date,channel,gross_amt,fee_amt,net_amt,fee_source,memo,bank_transaction_id',
        order: 'id.asc',
        pageSize: 5000,
        maxRows: ACCOUNTING_ROWS_MAX,
      }
    )) as ChannelSettlementFeeSourceRow[]
    const agg = aggregateChannelSettlementFeesForPl(rows || [], {
      coverage: params.coverage,
      deliverySubjectId,
      cardSubjectId,
      storeFilter: params.storeFilter,
    })
    return { ...agg, fetched: rows?.length || 0 }
  } catch (e) {
    console.warn('loadChannelSettlementFeesForPl:', e)
    return { ...emptyChannelSettlementFeesForPl(), fetched: 0 }
  }
}

export function channelSettlementImplausibleWarning(implausible: { count: number; fee: number }): string | null {
  if (implausible.count <= 0) return null
  return `채널 정산 중 수수료율이 정상 범위를 벗어난 ${implausible.count}건(약 ฿${Math.round(implausible.fee).toLocaleString('en-US')})은 손익 수수료에서 제외했습니다. 통장 입금이 다른 날짜 것으로 연결됐을 수 있으니 채널 정산에서 입금을 다시 확인하세요.`
}
