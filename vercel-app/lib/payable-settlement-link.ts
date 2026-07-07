import {
  type LedgerPairGroup,
  type LedgerPairRow,
  isPayableAccrualRow,
  isPayableSettlementRow,
  groupLedgerRowsByAccrualSettlement,
  resolveLedgerPairStatusForAmounts,
} from '@/lib/receivable-payable-period-totals'

export type PayableSettlementLinkRow = {
  id?: number
  payment_id: number
  accrual_id: number
}

export type PayableLedgerRowLike = {
  id?: number
  ref_type?: string
  amount?: number
  vendor_code?: string
  trans_date?: string
  memo?: string
}

export function roundPayableLinkMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function isPayableLinkableAccrualRow(row: PayableLedgerRowLike): boolean {
  return isPayableAccrualRow(row.ref_type, Number(row.amount ?? 0)) && Number(row.id || 0) > 0
}

export function isPayableLinkablePaymentRow(row: PayableLedgerRowLike): boolean {
  return isPayableSettlementRow(row.ref_type, Number(row.amount ?? 0)) && Number(row.id || 0) > 0
}

export function sumPayableLinkSelectionAmount(rows: PayableLedgerRowLike[]): number {
  return roundPayableLinkMoney(
    rows.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0)
  )
}

export function payableLinkTotalsMatch(accrualTotal: number, paymentTotal: number): boolean {
  return Math.abs(accrualTotal - paymentTotal) <= 0.01
}

/** 링크에 이미 포함된 행 id 집합 */
export function linkedPayableTransactionIds(links: PayableSettlementLinkRow[] | undefined): Set<number> {
  const out = new Set<number>()
  for (const link of links ?? []) {
    if (link.payment_id > 0) out.add(link.payment_id)
    if (link.accrual_id > 0) out.add(link.accrual_id)
  }
  return out
}

/** 연결 그래프에서 한 컴포넌트(묶음)에 속한 모든 id */
export function payableLinkComponentIds(
  seedId: number,
  links: PayableSettlementLinkRow[]
): Set<number> {
  const adj = new Map<number, Set<number>>()
  const addEdge = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const link of links) {
    addEdge(link.payment_id, link.accrual_id)
  }
  const out = new Set<number>()
  const queue = [seedId]
  while (queue.length > 0) {
    const id = queue.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const next of adj.get(id) ?? []) {
      if (!out.has(next)) queue.push(next)
    }
  }
  return out
}

export type PayableLinkValidationResult =
  | { ok: true; links: { paymentId: number; accrualId: number }[] }
  | { ok: false; message: string }

/** N:M 연결 요청 검증 — 동일 매입처, 금액 합 일치, 이미 연결된 행 없음 */
export function validatePayableSettlementLinkRequest(params: {
  vendorCode: string
  accrualRows: PayableLedgerRowLike[]
  paymentRows: PayableLedgerRowLike[]
  existingLinks: PayableSettlementLinkRow[]
}): PayableLinkValidationResult {
  const vendor = String(params.vendorCode || '').trim().toLowerCase()
  if (!vendor) return { ok: false, message: '매입처가 필요합니다.' }

  const accruals = params.accrualRows.filter(isPayableLinkableAccrualRow)
  const payments = params.paymentRows.filter(isPayableLinkablePaymentRow)
  if (accruals.length === 0) {
    return { ok: false, message: '연결할 입고(매입) 내역을 1건 이상 선택해 주세요.' }
  }
  if (payments.length === 0) {
    return { ok: false, message: '연결할 지급 내역을 1건 이상 선택해 주세요.' }
  }

  for (const row of [...accruals, ...payments]) {
    const vc = String(row.vendor_code || '').trim().toLowerCase()
    if (vc !== vendor) {
      return { ok: false, message: '선택한 내역의 매입처가 일치하지 않습니다.' }
    }
  }

  const linked = linkedPayableTransactionIds(params.existingLinks)
  for (const row of [...accruals, ...payments]) {
    if (linked.has(Number(row.id))) {
      return {
        ok: false,
        message: '이미 다른 연결에 포함된 내역이 있습니다. 먼저 연결 해제 후 다시 시도해 주세요.',
      }
    }
  }

  const accrualTotal = sumPayableLinkSelectionAmount(accruals)
  const paymentTotal = sumPayableLinkSelectionAmount(payments)
  if (!payableLinkTotalsMatch(accrualTotal, paymentTotal)) {
    return {
      ok: false,
      message: `매입 합계(฿${accrualTotal.toLocaleString()})와 지급 합계(฿${paymentTotal.toLocaleString()})가 일치해야 합니다.`,
    }
  }

  const links: { paymentId: number; accrualId: number }[] = []
  if (payments.length === 1) {
    const paymentId = Number(payments[0]!.id)
    for (const acc of accruals) {
      links.push({ paymentId, accrualId: Number(acc.id) })
    }
    return { ok: true, links }
  }
  if (accruals.length === 1) {
    const accrualId = Number(accruals[0]!.id)
    for (const pay of payments) {
      links.push({ paymentId: Number(pay.id), accrualId })
    }
    return { ok: true, links }
  }

  return {
    ok: false,
    message:
      '한 번에 여러 입고와 여러 지급을 동시에 연결할 수 없습니다. 입고 여러 건↔지급 1건, 또는 입고 1건↔지급 여러 건으로 선택해 주세요.',
  }
}

function pushManualPayableGroup(
  groups: LedgerPairGroup<LedgerPairRow>[],
  nextGroupId: { value: number },
  used: Set<number>,
  accruals: LedgerPairRow[],
  settlements: LedgerPairRow[]
) {
  const accrualAmt = accruals.reduce((s, r) => s + Math.max(0, Number(r.amount ?? 0)), 0)
  const { status, openAmount } = resolveLedgerPairStatusForAmounts(accrualAmt, settlements)
  groups.push({
    groupId: nextGroupId.value++,
    accrual: accruals[0] ?? null,
    accruals: accruals.length > 1 ? accruals : undefined,
    settlements,
    status,
    openAmount,
    manualLink: true,
  })
  for (const a of accruals) {
    if (a.id != null) used.add(a.id)
  }
  for (const s of settlements) {
    if (s.id != null) used.add(s.id)
  }
}

/** 수동 연결을 반영한 매입채무 짝짓기 그룹 */
export function groupPayableLedgerRowsWithLinks(
  items: LedgerPairRow[] | undefined,
  links: PayableSettlementLinkRow[] | undefined
): LedgerPairGroup<LedgerPairRow>[] {
  const rows = items ?? []
  const linkRows = links ?? []
  if (linkRows.length === 0) {
    return groupLedgerRowsByAccrualSettlement(
      rows,
      isPayableAccrualRow,
      isPayableSettlementRow,
      false
    )
  }

  const byId = new Map<number, LedgerPairRow>()
  for (const r of rows) {
    if (r.id != null) byId.set(r.id, r)
  }

  const linkedIds = linkedPayableTransactionIds(linkRows)
  const visited = new Set<number>()
  const groups: LedgerPairGroup<LedgerPairRow>[] = []
  const used = new Set<number>()
  const nextGroupId = { value: 1 }

  for (const seedId of linkedIds) {
    if (visited.has(seedId)) continue
    const component = payableLinkComponentIds(seedId, linkRows)
    for (const id of component) visited.add(id)

    const accruals: LedgerPairRow[] = []
    const settlements: LedgerPairRow[] = []
    for (const id of component) {
      const row = byId.get(id)
      if (!row) continue
      const amount = Number(row.amount ?? 0)
      if (isPayableAccrualRow(row.ref_type, amount)) accruals.push(row)
      else if (isPayableSettlementRow(row.ref_type, amount)) settlements.push(row)
    }
    accruals.sort((a, b) => String(a.trans_date || '').localeCompare(String(b.trans_date || '')))
    settlements.sort((a, b) => String(a.trans_date || '').localeCompare(String(b.trans_date || '')))
    if (accruals.length > 0 || settlements.length > 0) {
      pushManualPayableGroup(groups, nextGroupId, used, accruals, settlements)
    }
  }

  const remaining = rows.filter((r) => r.id == null || !used.has(r.id))
  const autoGroups = groupLedgerRowsByAccrualSettlement(
    remaining,
    isPayableAccrualRow,
    isPayableSettlementRow,
    false
  )
  for (const g of autoGroups) {
    groups.push({ ...g, groupId: nextGroupId.value++ })
  }

  return groups
}

export function payableRowLinkStatus(
  rowId: number | undefined,
  links: PayableSettlementLinkRow[] | undefined
): 'linked' | 'open' {
  if (!rowId || !links?.length) return 'open'
  return linkedPayableTransactionIds(links).has(rowId) ? 'linked' : 'open'
}
