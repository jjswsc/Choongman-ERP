import {
  resolveReceivableAttributedStore,
  type ReceivableAttributionMaps,
  type ReceivableTransactionRow,
} from '@/lib/receivable-ledger-pure'
import { receivableStoreGroupKey } from '@/lib/receivable-store-key'

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** 통장 매출 수령 통합 수금 — 인보이스(ref_id) 미배분 */
export function isConsolidatedBankReceiveRow(r: ReceivableTransactionRow): boolean {
  if (String(r.ref_type || '') !== 'Receive') return false
  const refId = r.ref_id
  if (refId != null && Number(refId) > 0) return false
  const bankId = Number(r.bank_transaction_id || 0)
  if (!bankId) return false
  const memo = String(r.memo || '').trim()
  return memo.startsWith('통장')
}

export type UnallocatedBankReceiveItem = {
  bankTransactionId: number
  transDate: string
  amountAbs: number
  memo?: string
  /** 해당 입금이 들어 있는 통장 계좌 — 클릭 시 이 계좌로 이동 */
  bankAccountId?: number
  bankAccountName?: string
  bankAccountStore?: string
}

export type BankTxAccountMeta = {
  accountId: number
  accountName?: string
  accountStore?: string
}

export function collectBankTransactionIdsFromReceivableGroups(
  groups: Array<{
    unallocatedBankDeposits?: UnallocatedBankReceiveItem[]
    items?: Array<{ bank_transaction_id?: number | null }>
  }>
): number[] {
  const ids = new Set<number>()
  for (const g of groups) {
    for (const dep of g.unallocatedBankDeposits || []) {
      const id = Number(dep.bankTransactionId)
      if (id > 0) ids.add(id)
    }
    for (const row of g.items || []) {
      const id = Number(row.bank_transaction_id)
      if (id > 0) ids.add(id)
    }
  }
  return [...ids]
}

export function applyBankAccountMetaToReceivableGroups<
  T extends {
    unallocatedBankDeposits?: UnallocatedBankReceiveItem[]
    items?: Array<{ bank_transaction_id?: number | null; bank_account_id?: number | null }>
  },
>(groups: T[], metaByTxId: Record<number, BankTxAccountMeta>): T[] {
  if (Object.keys(metaByTxId).length === 0) return groups
  return groups.map((g) => ({
    ...g,
    unallocatedBankDeposits: (g.unallocatedBankDeposits || []).map((dep) => {
      const meta = metaByTxId[Number(dep.bankTransactionId)]
      if (!meta) return dep
      return {
        ...dep,
        bankAccountId: meta.accountId,
        bankAccountName: meta.accountName,
        bankAccountStore: meta.accountStore,
      }
    }),
    items: (g.items || []).map((row) => {
      const meta = metaByTxId[Number(row.bank_transaction_id)]
      if (!meta) return row
      return { ...row, bank_account_id: meta.accountId }
    }),
  }))
}

/** 미수금 화면 → 통장 조회 딥링크. accountId가 있어야 다른 매장 통장으로 열리지 않는다. */
export function buildBankTransactionDeepLink(params: {
  bankTransactionId: number
  transDate?: string | null
  accountId?: number | string | null
}): string {
  const q = new URLSearchParams({
    tab: "query",
    openRegisterTxId: String(params.bankTransactionId),
  })
  const d = String(params.transDate || "").slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    q.set("startStr", d)
    q.set("endStr", d)
  }
  const aid = Number(params.accountId || 0)
  if (Number.isFinite(aid) && aid > 0) q.set("accountId", String(Math.floor(aid)))
  return `/admin/bank-transactions?${q.toString()}`
}

export function listUnallocatedBankReceives(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps,
  storeGroupKey?: string
): UnallocatedBankReceiveItem[] {
  const out: UnallocatedBankReceiveItem[] = []
  for (const r of rows) {
    if (!isConsolidatedBankReceiveRow(r)) continue
    const sn = resolveReceivableAttributedStore(r, attributionMaps)
    if (!sn) continue
    const gk = receivableStoreGroupKey(sn)
    if (storeGroupKey && gk !== storeGroupKey) continue
    const bankTransactionId = Number(r.bank_transaction_id || 0)
    if (!bankTransactionId) continue
    out.push({
      bankTransactionId,
      transDate: String(r.trans_date || '').slice(0, 10),
      amountAbs: roundMoney(Math.abs(Number(r.amount ?? 0))),
      memo: r.memo ? String(r.memo) : undefined,
    })
  }
  out.sort((a, b) => b.transDate.localeCompare(a.transDate) || b.bankTransactionId - a.bankTransactionId)
  return out
}

export function sumUnallocatedBankReceiveByStoreGroup(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps
): Record<string, number> {
  const byGroup: Record<string, number> = {}
  for (const item of listUnallocatedBankReceives(rows, attributionMaps)) {
    const row = rows.find(
      (r) => Number(r.bank_transaction_id || 0) === item.bankTransactionId && isConsolidatedBankReceiveRow(r)
    )
    if (!row) continue
    const sn = resolveReceivableAttributedStore(row, attributionMaps)
    if (!sn) continue
    const groupKey = receivableStoreGroupKey(sn)
    byGroup[groupKey] = roundMoney((byGroup[groupKey] || 0) + item.amountAbs)
  }
  return byGroup
}

export function sumUnallocatedBankReceiveForStoreName(
  rows: ReceivableTransactionRow[],
  attributionMaps: ReceivableAttributionMaps,
  storeName: string
): number {
  const groupKey = receivableStoreGroupKey(storeName)
  const byGroup = sumUnallocatedBankReceiveByStoreGroup(rows, attributionMaps)
  return byGroup[groupKey] || 0
}

/** 미수금 화면 수동 수금확인 가능 여부 (통장 연동·미할당 입금 정책) */
export function canManuallyToggleReceivableReceiveCheck(params: {
  receiveChecked: boolean
  linkedBankTransactionId: number
  unallocatedBankReceiveTotal: number
}): { allowed: boolean; reason?: 'bank_linked' | 'unallocated_bank' } {
  if (params.linkedBankTransactionId > 0) {
    return { allowed: false, reason: 'bank_linked' }
  }
  if (!params.receiveChecked && (params.unallocatedBankReceiveTotal || 0) > 0.009) {
    return { allowed: false, reason: 'unallocated_bank' }
  }
  return { allowed: true }
}
