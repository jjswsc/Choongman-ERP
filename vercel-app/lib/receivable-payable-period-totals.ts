/** 미수·미지급 조회 기간 금액 집계 (양수=발생, 음수=수령·지급) */

export type ReceivablePayablePeriodTotals = {
  salesSum: number
  receiveSum: number
  periodNet: number
  lineCount: number
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function sumReceivablePayablePeriodAmounts(
  items: { amount?: number }[] | undefined
): ReceivablePayablePeriodTotals {
  const rows = items ?? []
  let salesSum = 0
  let receiveSum = 0
  let periodNet = 0
  for (const r of rows) {
    const amount = Number(r.amount ?? 0)
    if (!Number.isFinite(amount)) continue
    periodNet += amount
    salesSum += Math.max(0, amount)
    receiveSum += Math.max(0, -amount)
  }
  return {
    salesSum: roundMoney(salesSum),
    receiveSum: roundMoney(receiveSum),
    periodNet: roundMoney(periodNet),
    lineCount: rows.length,
  }
}

/** 종료일 누적 잔액 − 조회 기간 순잔액 = 기간 시작 이전 잔액 */
export function priorCumulativeBalance(
  cumulative: number | undefined,
  periodNet: number
): number | undefined {
  if (cumulative == null || !Number.isFinite(cumulative)) return undefined
  return roundMoney(cumulative - periodNet)
}

export function periodTotalsReconcile(
  periodNet: number,
  salesSum: number,
  receiveSum: number,
  epsilon = 0.02
): boolean {
  return Math.abs(roundMoney(salesSum - receiveSum) - roundMoney(periodNet)) <= epsilon
}

export type ReceivableLedgerDatePair = {
  salesDate?: string
  receiveDate?: string
}

function sliceYmd(d: string | undefined): string {
  return String(d || '').trim().slice(0, 10)
}

function isReceivableAccrualRow(refType: string | undefined, amount: number): boolean {
  const t = String(refType || '')
  if (t === 'Order' || t === 'ForceOutbound' || t === 'AccountingPO') return amount > 0
  if (t === 'Opening') return amount > 0
  return false
}

function isReceivableSettlementRow(refType: string | undefined, amount: number): boolean {
  if (String(refType || '') === 'Receive') return true
  return amount < 0
}

/** 같은 매출처 그룹 내 매출·입금 행을 금액으로 1:1 짝지어 양쪽 날짜를 표시 */
export function pairReceivableLedgerDates(
  items: { id?: number; ref_type?: string; amount?: number; trans_date?: string }[] | undefined
): Map<number, ReceivableLedgerDatePair> {
  const out = new Map<number, ReceivableLedgerDatePair>()
  const rows = items ?? []

  const receivePool = new Map<number, { id?: number; trans_date?: string }[]>()
  for (const r of rows) {
    const amount = Number(r.amount ?? 0)
    if (!isReceivableSettlementRow(r.ref_type, amount)) continue
    const amt = roundMoney(Math.abs(amount))
    if (amt <= 0) continue
    if (!receivePool.has(amt)) receivePool.set(amt, [])
    receivePool.get(amt)!.push(r)
  }
  for (const pool of receivePool.values()) {
    pool.sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))
  }

  const accruals = rows
    .filter((r) => isReceivableAccrualRow(r.ref_type, Number(r.amount ?? 0)))
    .sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))

  for (const acc of accruals) {
    const salesDate = sliceYmd(acc.trans_date)
    const amt = roundMoney(Math.abs(Number(acc.amount ?? 0)))
    const pool = receivePool.get(amt)
    const recv = pool?.shift()
    const receiveDate = recv ? sliceYmd(recv.trans_date) : undefined
    const pair: ReceivableLedgerDatePair = { salesDate, receiveDate }
    if (acc.id != null) out.set(acc.id, pair)
    if (recv?.id != null) out.set(recv.id, pair)
  }

  for (const r of rows) {
    if (r.id == null || out.has(r.id)) continue
    const amount = Number(r.amount ?? 0)
    if (isReceivableSettlementRow(r.ref_type, amount)) {
      out.set(r.id, { receiveDate: sliceYmd(r.trans_date) })
    } else if (isReceivableAccrualRow(r.ref_type, amount)) {
      out.set(r.id, { salesDate: sliceYmd(r.trans_date) })
    }
  }

  return out
}
