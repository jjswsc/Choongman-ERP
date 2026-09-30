/** 미수·미지급 조회 기간 금액 집계 (양수=발생, 음수=수령·지급) */

export type ReceivablePayablePeriodTotals = {
  salesSum: number
  receiveSum: number
  periodNet: number
  lineCount: number
}

function roundMoney(n: number): number {
  const rounded = Math.round(n * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
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

export function isPayableAccrualRow(refType: string | undefined, amount: number): boolean {
  const t = String(refType || '')
  if (t === 'Inbound' || t === 'PO') return amount > 0
  if (t === 'Opening') return amount > 0
  return false
}

/** 매입 지급 시 원천세 상계. 금액은 음수라 잔액에서는 빠지지만, 통장 지급과 금액으로 짝짓지 않는다. */
export const PAYABLE_WITHHOLDING_REF_TYPE = 'Withholding'

export function isPayableWithholdingRow(refType: string | undefined): boolean {
  return String(refType || '') === PAYABLE_WITHHOLDING_REF_TYPE
}

export function isPayableSettlementRow(refType: string | undefined, amount: number): boolean {
  if (isPayableWithholdingRow(refType)) return false
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
  /** 수동 연결로 묶인 매입 발생이 2건 이상일 때 */
  accruals?: T[]
  settlements: T[]
  status: LedgerPairStatus
  openAmount: number
  /** 미지급 수동 연결(payable_settlement_links)로 묶인 그룹 */
  manualLink?: boolean
}

export type LedgerRowGroupMeta = {
  groupId: number
  role: 'accrual' | 'settlement' | 'standalone'
}

export function resolveLedgerPairStatusForAmounts(
  accrualAmtGross: number,
  settlements: { amount?: number }[]
): { status: LedgerPairStatus; openAmount: number } {
  const accrualAmt = Math.max(0, Number(accrualAmtGross) || 0)
  const settledAmt = settlements.reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0)
  if (accrualAmt <= 0.009 && settlements.length > 0) {
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

function resolveLedgerPairStatus(
  accrual: { amount?: number } | null,
  settlements: { amount?: number }[]
): { status: LedgerPairStatus; openAmount: number } {
  if (!accrual) {
    return { status: 'standalone', openAmount: 0 }
  }
  return resolveLedgerPairStatusForAmounts(Math.max(0, Number(accrual.amount ?? 0)), settlements)
}

type LedgerPairRow = {
  id?: number
  ref_type?: string
  ref_id?: number
  amount?: number
  trans_date?: string
  bank_transaction_id?: number | null
}

export type { LedgerPairRow }

export function groupLedgerRowsByAccrualSettlement(
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

const PAYABLE_WHT_MATCH_EPS = 0.5

function payableBankId(row: LedgerPairRow): number {
  const id = Number(row.bank_transaction_id || 0)
  return Number.isFinite(id) && id > 0 ? id : 0
}

/**
 * 통장 실이체와 같은 통장의 원천세를 한 묶음으로 보고, 입고 총액과 같으면 지급 완료로 짝짓는다.
 * 원천세 행 자체는 금액이 같은 입고와 1:1로 붙지 않는다.
 * 같은 날 입고가 여러 줄이고 그 합이 한 지급 묶음과 같으면 함께 지급 완료로 본다.
 */
export function groupPayableLedgerRows(
  items: LedgerPairRow[] | undefined
): LedgerPairGroup<LedgerPairRow>[] {
  const rows = items ?? []
  const used = new Set<number>()
  const groups: LedgerPairGroup<LedgerPairRow>[] = []
  let nextGroupId = 1

  const whtByBank = new Map<number, LedgerPairRow[]>()
  for (const row of rows) {
    if (!isPayableWithholdingRow(row.ref_type)) continue
    const bankId = payableBankId(row)
    if (!bankId) continue
    const list = whtByBank.get(bankId) ?? []
    list.push(row)
    whtByBank.set(bankId, list)
  }

  const payments = rows
    .filter((row) => String(row.ref_type || '') === 'Payment')
    .sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))
  const usedPayment = new Set<LedgerPairRow>()

  const takeBundle = (grossTarget: number) => {
    let best: { payment: LedgerPairRow; wht: LedgerPairRow[]; gross: number } | null = null
    let bestDiff = Infinity
    for (const payment of payments) {
      if (usedPayment.has(payment)) continue
      const bankId = payableBankId(payment)
      const wht = (bankId ? whtByBank.get(bankId) ?? [] : []).filter(
        (row) => row.id == null || !used.has(row.id)
      )
      const gross = roundMoney(
        Math.abs(Number(payment.amount ?? 0)) +
          wht.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0)
      )
      const diff = Math.abs(gross - grossTarget)
      if (diff <= PAYABLE_WHT_MATCH_EPS && diff < bestDiff) {
        best = { payment, wht, gross }
        bestDiff = diff
      }
    }
    if (!best) return null
    usedPayment.add(best.payment)
    return best
  }

  const pushCovered = (accrualList: LedgerPairRow[], settlements: LedgerPairRow[]) => {
    const accrualAmt = accrualList.reduce((sum, row) => sum + Math.max(0, Number(row.amount ?? 0)), 0)
    const settledAmt = settlements.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0)
    const closeEnough =
      accrualAmt > 0 &&
      settlements.length > 0 &&
      Math.abs(accrualAmt - settledAmt) <= PAYABLE_WHT_MATCH_EPS
    const resolved = resolveLedgerPairStatusForAmounts(accrualAmt, settlements)
    const status = closeEnough ? 'settled' : resolved.status
    const openAmount = closeEnough ? 0 : resolved.openAmount
    groups.push({
      groupId: nextGroupId++,
      accrual: accrualList[0] ?? null,
      accruals: accrualList.length > 1 ? accrualList : undefined,
      settlements,
      status,
      openAmount,
    })
    for (const row of accrualList) {
      if (row.id != null) used.add(row.id)
    }
    for (const row of settlements) {
      if (row.id != null) used.add(row.id)
    }
  }

  const accruals = rows
    .filter((row) => isPayableAccrualRow(row.ref_type, Number(row.amount ?? 0)))
    .sort((a, b) => sliceYmd(a.trans_date).localeCompare(sliceYmd(b.trans_date)))

  const unmatchedAccruals: LedgerPairRow[] = []
  for (const accrual of accruals) {
    const target = roundMoney(Math.abs(Number(accrual.amount ?? 0)))
    const bundle = takeBundle(target)
    if (!bundle) {
      unmatchedAccruals.push(accrual)
      continue
    }
    pushCovered([accrual], [bundle.payment, ...bundle.wht])
  }

  const byDate = new Map<string, LedgerPairRow[]>()
  for (const accrual of unmatchedAccruals) {
    const date = sliceYmd(accrual.trans_date)
    const list = byDate.get(date) ?? []
    list.push(accrual)
    byDate.set(date, list)
  }
  for (const list of byDate.values()) {
    if (list.length < 2) continue
    const sum = roundMoney(list.reduce((total, row) => total + Math.max(0, Number(row.amount ?? 0)), 0))
    const bundle = takeBundle(sum)
    if (!bundle) continue
    pushCovered(list, [bundle.payment, ...bundle.wht])
  }

  const remaining = rows.filter((row) => row.id == null || !used.has(row.id))
  const autoGroups = groupLedgerRowsByAccrualSettlement(
    remaining,
    isPayableAccrualRow,
    isPayableSettlementRow,
    false
  )
  for (const group of autoGroups) {
    groups.push({ ...group, groupId: nextGroupId++ })
  }
  return groups
}

export function ledgerAccrualStatusById<T extends { id?: number }>(
  groups: LedgerPairGroup<T>[]
): Map<number, LedgerPairStatus> {
  const map = new Map<number, LedgerPairStatus>()
  for (const group of groups) {
    const accrualRows = group.accruals?.length ? group.accruals : group.accrual ? [group.accrual] : []
    for (const accrual of accrualRows) {
      if (accrual.id != null) map.set(accrual.id, group.status)
    }
  }
  return map
}

export function payableLineSettlementKind(
  row: { id?: number; ref_type?: string },
  statusByAccrualId: Map<number, LedgerPairStatus>
): 'withholding' | 'paid' | 'partial' | 'unpaid' {
  if (isPayableWithholdingRow(row.ref_type)) return 'withholding'
  if (String(row.ref_type || '') === 'Payment') return 'paid'
  const status = row.id != null ? statusByAccrualId.get(row.id) : undefined
  if (status === 'settled') return 'paid'
  if (status === 'partial') return 'partial'
  return 'unpaid'
}

export function buildLedgerRowGroupMeta<T extends { id?: number }>(
  groups: LedgerPairGroup<T>[]
): Map<number, LedgerRowGroupMeta> {
  const map = new Map<number, LedgerRowGroupMeta>()
  for (const g of groups) {
    const accrualRows = g.accruals?.length ? g.accruals : g.accrual ? [g.accrual] : []
    for (const a of accrualRows) {
      if (a.id != null) {
        map.set(a.id, { groupId: g.groupId, role: 'accrual' })
      }
    }
    for (const s of g.settlements) {
      if (s.id != null) {
        map.set(s.id, {
          groupId: g.groupId,
          role: accrualRows.length > 0 ? 'settlement' : 'standalone',
        })
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
    const accrualRows = g.accruals?.length ? g.accruals : g.accrual ? [g.accrual] : []
    const accrualVisible = accrualRows.some((a) => a.id != null && visibleIds.has(a.id))
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
