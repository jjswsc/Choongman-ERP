import { addDaysYmd } from '@/lib/pos-business-day'
import {
  deriveFeeFromGrossNet,
  roundSettlementMoney,
  type PosChannelSettlementChannel,
} from '@/lib/pos-channel-settlement'

/** 방콕 달력일 요일 (0=일 … 6=토). YYYY-MM-DD 는 날짜만 쓰므로 UTC 달력과 같음 */
export function bangkokYmdWeekday(ymd: string): number {
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(5, 7))
  const d = Number(ymd.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return -1
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** 카드사 주말 묶음이 붙는 입금일(금·토·일·월) */
export function isWeekendBatchSettleDate(ymd: string): boolean {
  const w = bangkokYmdWeekday(ymd)
  return w === 5 || w === 6 || w === 0 || w === 1
}

export function channelFeePctBand(channel: PosChannelSettlementChannel): { min: number; max: number } {
  if (channel === 'card') return { min: 0, max: 8 }
  if (channel === 'grab') return { min: 0, max: 28 }
  if (channel === 'lineman') return { min: 0, max: 26 }
  if (channel === 'shopee') return { min: 0, max: 20 }
  return { min: 0, max: 28 }
}

export function isPlausibleCoverFee(
  channel: PosChannelSettlementChannel,
  gross: number,
  net: number
): boolean {
  const g = roundSettlementMoney(gross)
  const n = roundSettlementMoney(net)
  if (g + 0.02 < n) return false
  const fee = deriveFeeFromGrossNet(g, n)
  const pct = g > 0 ? (fee / g) * 100 : 0
  const { min, max } = channelFeePctBand(channel)
  return pct + 1e-9 >= min && pct <= max + 1e-9
}

export function weekendCoverNeighborDates(settleDate: string): string[] {
  return [-3, -2, -1, 0, 1, 2, 3].map((delta) => addDaysYmd(settleDate, delta))
}

const COVER_MEMO_RE = /\[cover\s+([0-9,\s-]+)\]/i

export function formatCoverMemoTag(dates: string[]): string {
  const uniq = [...new Set(dates.map((d) => String(d || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))]
  uniq.sort()
  return `[cover ${uniq.join(',')}]`
}

export function parseCoverDatesFromText(...texts: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const t of texts) {
    const m = COVER_MEMO_RE.exec(String(t || ''))
    if (!m) continue
    for (const p of m[1].split(/[,\s]+/)) {
      const ymd = p.trim().slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && !out.includes(ymd)) out.push(ymd)
    }
  }
  return out
}

export function appendCoverMemo(memo: string | null | undefined, dates: string[]): string {
  const tag = formatCoverMemoTag(dates)
  const cur = String(memo || '').trim()
  if (!tag || dates.length <= 1) return cur
  if (COVER_MEMO_RE.test(cur)) return cur.replace(COVER_MEMO_RE, tag).trim()
  return cur ? `${cur} ${tag}` : tag
}

export function claimedCoverDatesFromSettlements(
  rows: Array<{ settle_date?: string | null; memo?: string | null; fee_source?: string | null }>
): Set<string> {
  const claimed = new Set<string>()
  for (const r of rows) {
    const d = String(r.settle_date || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) claimed.add(d)
    for (const x of parseCoverDatesFromText(r.memo, r.fee_source)) claimed.add(x)
  }
  return claimed
}

export type GrossCoverPick = {
  coverDates: string[]
  gross: number
  fee: number
  /** 옆날 POS 통째가 아니라, 모자란 금액만 옆날에서 가져온 경우 */
  partial?: boolean
}

/**
 * 하루 GROSS 가 NET 보다 작을 때, 정산일 + 옆날(최대 3일)을 골라 NET 을 덮는다.
 * 큰 날을 통째로 넣으면 수수료가 비정상이라, 작은 날부터 조합한다.
 */
function eachNonemptySubset<T>(items: T[], maxSize: number, visit: (subset: T[]) => void): void {
  const n = items.length
  const limit = Math.min(Math.max(0, maxSize), n)
  const acc: T[] = []
  const walk = (start: number) => {
    if (acc.length > 0) visit(acc.slice())
    if (acc.length >= limit) return
    for (let i = start; i < n; i++) {
      acc.push(items[i]!)
      walk(i + 1)
      acc.pop()
    }
  }
  walk(0)
}

export function pickGrossCoveringNet(params: {
  settleDate: string
  net: number
  channel: PosChannelSettlementChannel
  grossByDate: Map<string, number> | Record<string, number>
  claimedDates?: Iterable<string>
  settleDateGross?: number
}): GrossCoverPick | null {
  const settleDate = String(params.settleDate || '').slice(0, 10)
  const net = roundSettlementMoney(params.net)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settleDate) || net <= 0) return null

  const byDate = params.grossByDate instanceof Map ? params.grossByDate : new Map(Object.entries(params.grossByDate))
  const dayGross = roundSettlementMoney(
    params.settleDateGross != null ? params.settleDateGross : Number(byDate.get(settleDate) || 0)
  )
  if (dayGross > 0 && dayGross + 0.02 >= net) {
    return { coverDates: [settleDate], gross: dayGross, fee: deriveFeeFromGrossNet(dayGross, net) }
  }
  if (dayGross <= 0.02) return null

  const claimed = new Set<string>()
  for (const d of params.claimedDates || []) {
    const ymd = String(d || '').slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && ymd !== settleDate) claimed.add(ymd)
  }

  const extras = weekendCoverNeighborDates(settleDate).filter((d) => {
    if (d === settleDate || claimed.has(d)) return false
    return roundSettlementMoney(Number(byDate.get(d) || 0)) > 0.02
  })

  type Cand = GrossCoverPick & { extra: number; overshoot: number }
  const cands: Cand[] = []
  const consider = (coverDates: string[]) => {
    let gross = 0
    for (const d of coverDates) {
      gross += roundSettlementMoney(Number(byDate.get(d) || 0))
    }
    gross = roundSettlementMoney(gross)
    if (gross + 0.02 < net) return
    if (!isPlausibleCoverFee(params.channel, gross, net)) return
    const dates = [...coverDates].sort()
    cands.push({
      coverDates: dates,
      gross,
      fee: deriveFeeFromGrossNet(gross, net),
      extra: coverDates.length,
      overshoot: roundSettlementMoney(gross - net),
    })
  }

  eachNonemptySubset(extras, 3, (subset) => consider([settleDate, ...subset]))
  if (cands.length) {
    cands.sort((a, b) => a.extra - b.extra || a.overshoot - b.overshoot)
    const best = cands[0]!
    return { coverDates: best.coverDates, gross: best.gross, fee: best.fee }
  }

  // 옆날이 너무 크면 통째 합산은 수수료가 비정상. 모자란 금액(gap)만 옆날 POS에서 가져온다.
  const gap = roundSettlementMoney(net - dayGross)
  if (gap <= 0.02) return null
  const extrasBySize = [...extras].sort(
    (a, b) =>
      roundSettlementMoney(Number(byDate.get(a) || 0)) - roundSettlementMoney(Number(byDate.get(b) || 0))
  )
  let cap = 0
  const used: string[] = []
  for (const d of extrasBySize) {
    const g = roundSettlementMoney(Number(byDate.get(d) || 0))
    if (g <= 0.02) continue
    used.push(d)
    cap = roundSettlementMoney(cap + g)
    if (cap + 0.02 >= gap) {
      return {
        coverDates: [settleDate, ...used].sort(),
        gross: net,
        fee: 0,
        partial: true,
      }
    }
  }
  return null
}
