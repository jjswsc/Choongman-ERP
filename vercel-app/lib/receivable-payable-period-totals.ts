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

/** 같은 매출처 그룹 내 매출·입금 행을 ref_id·금액으로 짝지어 양쪽 날짜를 표시 */
export function pairReceivableLedgerDates(
  items:
    | { id?: number; ref_type?: string; ref_id?: number; amount?: number; trans_date?: string }[]
    | undefined
): Map<number, ReceivableLedgerDatePair> {
  const out = new Map<number, ReceivableLedgerDatePair>()
  const rows = items ?? []
  const byId = new Map<number, (typeof rows)[number]>()
  for (const r of rows) {
    if (r.id != null) byId.set(r.id, r)
  }

  for (const recv of rows) {
    if (String(recv.ref_type || '') !== 'Receive' || recv.ref_id == null || recv.id == null) continue
    const parent = byId.get(Number(recv.ref_id))
    if (!parent) continue
    const pair: ReceivableLedgerDatePair = {
      salesDate: sliceYmd(parent.trans_date),
      receiveDate: sliceYmd(recv.trans_date),
    }
    out.set(Number(recv.ref_id), pair)
    out.set(recv.id, pair)
  }

  const receivePool = new Map<number, { id?: number; trans_date?: string }[]>()
  for (const r of rows) {
    if (r.id != null && out.has(r.id)) continue
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
    if (acc.id != null && out.has(acc.id)) continue
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

export type PayableLedgerDatePair = {
  purchaseDate?: string
  paymentDate?: string
}

function isPayableAccrualRow(refType: string | undefined, amount: number): boolean {
  const t = String(refType || '')
  if (t === 'Inbound' || t === 'PO') return amount > 0
  if (t === 'Opening') return amount > 0
  return false
}

function isPayableSettlementRow(refType: string | undefined, amount: number): boolean {
  if (String(refType || '') === 'Payment') return true
  return amount < 0
}

/** 같은 매입처 그룹 내 매입·지급 행을 금액으로 짝지어 양쪽 날짜를 표시 */
export function pairPayableLedgerDates(
  items:
    | { id?: number; ref_type?: string; ref_id?: number; amount?: number; trans_date?: string }[]
    | undefined
): Map<number, PayableLedgerDatePair> {
  const out = new Map<number, PayableLedgerDatePair>()
  const rows = items ?? []

  const paymentPool = new Map<number, { id?: number; trans_date?: string }[]>()
  for (const r of rows) {
    if (r.id != null && out.has(r.id)) continue
    const amount = Number(r.amount ?? 0)
    if (!isPayableSettlementRow(r.ref_type, amount)) continue
    const amt = roundMoney(Math.abs(amount))
    if (amt <= 0) continue
    if (!paymentPool.has(amt)) paymentPool.set(amt, [])
    paymentPool.get(amt)!.push(r)
  }
  for (const pool of paymentPool.values()) {
    pool.sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))
  }

  const accruals = rows
    .filter((r) => isPayableAccrualRow(r.ref_type, Number(r.amount ?? 0)))
    .sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))

  for (const acc of accruals) {
    if (acc.id != null && out.has(acc.id)) continue
    const purchaseDate = sliceYmd(acc.trans_date)
    const amt = roundMoney(Math.abs(Number(acc.amount ?? 0)))
    const pool = paymentPool.get(amt)
    const pay = pool?.shift()
    const paymentDate = pay ? sliceYmd(pay.trans_date) : undefined
    const pair: PayableLedgerDatePair = { purchaseDate, paymentDate }
    if (acc.id != null) out.set(acc.id, pair)
    if (pay?.id != null) out.set(pay.id, pair)
  }

  for (const r of rows) {
    if (r.id == null || out.has(r.id)) continue
    const amount = Number(r.amount ?? 0)
    if (isPayableSettlementRow(r.ref_type, amount)) {
      out.set(r.id, { paymentDate: sliceYmd(r.trans_date) })
    } else if (isPayableAccrualRow(r.ref_type, amount)) {
      out.set(r.id, { purchaseDate: sliceYmd(r.trans_date) })
    }
  }

  return out
}

export type LedgerPairStatus = 'settled' | 'open' | 'partial' | 'standalone'

export type LedgerPairGroup<T extends { id?: number }> = {
  groupId: number
  accrual: T | null
  settlements: T[]
  status: LedgerPairStatus
  openAmount: number
}

export type LedgerRowGroupMeta = {
  groupId: number
  role: 'accrual' | 'settlement' | 'standalone'
}

function resolveLedgerPairStatus(
  accrual: { amount?: number } | null,
  settlements: { amount?: number }[]
): { status: LedgerPairStatus; openAmount: number } {
  const accrualAmt = accrual ? Math.max(0, Number(accrual.amount ?? 0)) : 0
  const settledAmt = settlements.reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0)
  if (!accrual) {
    return { status: 'standalone', openAmount: 0 }
  }
  if (settlements.length === 0) {
    return { status: 'open', openAmount: roundMoney(accrualAmt) }
  }
  if (settledAmt >= accrualAmt - 0.01) {
    return { status: 'settled', openAmount: 0 }
  }
  if (settledAmt > 0.009) {
    return { status: 'partial', openAmount: roundMoney(Math.max(0, accrualAmt - settledAmt)) }
  }
  return { status: 'open', openAmount: roundMoney(accrualAmt) }
}

type LedgerPairRow = {
  id?: number
  ref_type?: string
  ref_id?: number
  amount?: number
  trans_date?: string
}

function groupLedgerRowsByAccrualSettlement(
  rows: LedgerPairRow[],
  isAccrual: (refType: string | undefined, amount: number) => boolean,
  isSettlement: (refType: string | undefined, amount: number) => boolean,
  linkByRefId: boolean
): LedgerPairGroup<LedgerPairRow>[] {
  const used = new Set<number>()
  const groups: LedgerPairGroup<LedgerPairRow>[] = []
  let nextGroupId = 1

  const byId = new Map<number, LedgerPairRow>()
  for (const r of rows) {
    if (r.id != null) byId.set(r.id, r)
  }

  const pushGroup = (accrual: LedgerPairRow | null, settlements: LedgerPairRow[]) => {
    const { status, openAmount } = resolveLedgerPairStatus(accrual, settlements)
    groups.push({
      groupId: nextGroupId++,
      accrual,
      settlements,
      status,
      openAmount,
    })
    if (accrual?.id != null) used.add(accrual.id)
    for (const s of settlements) {
      if (s.id != null) used.add(s.id)
    }
  }

  if (linkByRefId) {
    for (const recv of rows) {
      if (String(recv.ref_type || '') !== 'Receive' || recv.ref_id == null || recv.id == null) continue
      if (used.has(recv.id)) continue
      const parent = byId.get(Number(recv.ref_id))
      if (!parent || parent.id == null || used.has(parent.id)) continue
      pushGroup(parent, [recv])
    }
  }

  const settlementPool = new Map<number, LedgerPairRow[]>()
  for (const r of rows) {
    if (r.id != null && used.has(r.id)) continue
    const amount = Number(r.amount ?? 0)
    if (!isSettlement(r.ref_type, amount)) continue
    const amt = roundMoney(Math.abs(amount))
    if (amt <= 0) continue
    if (!settlementPool.has(amt)) settlementPool.set(amt, [])
    settlementPool.get(amt)!.push(r)
  }
  for (const pool of settlementPool.values()) {
    pool.sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))
  }

  const accruals = rows
    .filter((r) => {
      if (r.id != null && used.has(r.id)) return false
      return isAccrual(r.ref_type, Number(r.amount ?? 0))
    })
    .sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))

  for (const acc of accruals) {
    const amt = roundMoney(Math.abs(Number(acc.amount ?? 0)))
    const pool = settlementPool.get(amt)
    const settlement = pool?.shift()
    pushGroup(acc, settlement ? [settlement] : [])
  }

  for (const pool of settlementPool.values()) {
    for (const s of pool) {
      if (s.id != null && !used.has(s.id)) pushGroup(null, [s])
    }
  }

  for (const r of rows) {
    if (r.id == null || used.has(r.id)) continue
    const amount = Number(r.amount ?? 0)
    if (isAccrual(r.ref_type, amount)) pushGroup(r, [])
    else if (isSettlement(r.ref_type, amount)) pushGroup(null, [r])
    else pushGroup(r, [])
  }

  return groups
}

/** 같은 매출처 그룹 내 매출·입금 행을 짝지어 블록 단위로 반환 */
export function groupReceivableLedgerRows(
  items: LedgerPairRow[] | undefined
): LedgerPairGroup<LedgerPairRow>[] {
  return groupLedgerRowsByAccrualSettlement(
    items ?? [],
    isReceivableAccrualRow,
    isReceivableSettlementRow,
    true
  )
}

/** 같은 매입처 그룹 내 매입·지급 행을 짝지어 블록 단위로 반환 */
export function groupPayableLedgerRows(
  items: LedgerPairRow[] | undefined
): LedgerPairGroup<LedgerPairRow>[] {
  return groupLedgerRowsByAccrualSettlement(
    items ?? [],
    isPayableAccrualRow,
    isPayableSettlementRow,
    false
  )
}

export function buildLedgerRowGroupMeta<T extends { id?: number }>(
  groups: LedgerPairGroup<T>[]
): Map<number, LedgerRowGroupMeta> {
  const map = new Map<number, LedgerRowGroupMeta>()
  for (const g of groups) {
    if (g.accrual?.id != null) {
      map.set(g.accrual.id, { groupId: g.groupId, role: 'accrual' })
    }
    for (const s of g.settlements) {
      if (s.id != null) {
        map.set(s.id, { groupId: g.groupId, role: g.accrual ? 'settlement' : 'standalone' })
      }
    }
  }
  return map
}

export function filterLedgerPairGroupsForDisplay<T extends { id?: number }>(
  groups: LedgerPairGroup<T>[],
  visibleRows: T[],
  unpaidOnly: boolean
): LedgerPairGroup<T>[] {
  const visibleIds = new Set(
    visibleRows.map((r) => r.id).filter((id): id is number => id != null && id > 0)
  )
  return groups.filter((g) => {
    const accrualVisible = g.accrual?.id != null && visibleIds.has(g.accrual.id)
    const settlementVisible = g.settlements.some((s) => s.id != null && visibleIds.has(s.id))
    if (unpaidOnly) {
      return accrualVisible && g.status !== 'settled'
    }
    return accrualVisible || settlementVisible
  })
}

export function sortLedgerPairGroupsDesc<T extends { id?: number; trans_date?: string }>(
  groups: LedgerPairGroup<T>[]
): LedgerPairGroup<T>[] {
  const primaryDate = (g: LedgerPairGroup<T>) =>
    sliceYmd(g.accrual?.trans_date || g.settlements[0]?.trans_date)
  return [...groups].sort((a, b) => primaryDate(b).localeCompare(primaryDate(a)))
}
