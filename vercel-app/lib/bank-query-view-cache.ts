/**
 * 은행 조회(ค้นหา) 결과 — 탭 전환으로 컴포넌트가 remount 되어도 복구.
 * (Next App Router + keep-alive element 캐시만으로는 fiber state가 비는 경우가 있음)
 *
 * 주의: remount 직후 초기 hasSearched=false effect에서 clear하지 말 것.
 * 복원 전에 지우면 조회 결과가 빈 화면으로 남는다.
 */

import type { BankTransactionRow } from "@/components/tabs/bank-transactions-tab-utils"

export type BankQueryViewSummary = {
  openingBalance: number
  beginningBalance: number
  periodDeposits: number
  periodWithdrawals: number
  calculatedBalance: number
}

export type BankQueryViewCache = {
  accountId: string
  startStr: string
  endStr: string
  actualBalance: string
  activeBankTab: string
  filterTransType: string
  filterCategory: string
  filterVendorCode: string
  filterAccountSubjectId: string
  filterAccountSubjectEmpty: boolean
  filterPlExpenseOnly: boolean
  filterNeedsAttention: boolean
  filterInvoiceNotReceived: boolean
  filterAmount: string
  filterKeyword: string
  queryRowEdits: Record<string, Record<string, string | undefined>>
  list: BankTransactionRow[]
  summary: BankQueryViewSummary | null
  hasSearched: boolean
}

let viewCache: BankQueryViewCache | null = null

export function saveBankQueryViewCache(snapshot: BankQueryViewCache): void {
  viewCache = snapshot
}

export function readBankQueryViewCache(): BankQueryViewCache | null {
  return viewCache
}

export function clearBankQueryViewCache(): void {
  viewCache = null
}
