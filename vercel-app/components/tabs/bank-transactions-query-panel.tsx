"use client"

import { TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatBankAccountLabel } from "@/lib/bank-account-display"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { AlertCircle, FileSpreadsheet, Save, Search, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { formatMoneyAmountParam, normalizeMoneyInputString } from "@/lib/money-amount"
import { BankQuickMemoChipBar } from "./bank-misc-dialogs"
import {
  AccountingDataTable,
  AccountingTbodyRow,
  AccountingTh,
  AccountingTheadRow,
} from "@/components/erp/accounting-data-table"
import { bankRowNeedsAttention } from "@/lib/bank-transaction-attention"
import {
  BANK_WITHDRAW_UI_CATEGORIES,
  isBankExpenseRelatedWithdrawCategory,
  isBankWithdrawCategoryWithoutSubject,
} from "@/lib/bank-expense-via-expense-mgmt"
import {
  applyBankDepositCategorySelect,
  bankChannelSettlementRowAction,
  bankDepositCategorySelectValue,
} from "@/lib/pos-bank-chip-settlement"
import { bankNoteUserDisplayText } from "@/lib/bank-transaction-note-meta"
import { suggestPurchaseWhtFromNetPayment } from "@/lib/purchase-payment-wht"
import { BankAdvanceTargetCell } from "@/components/erp/bank-advance-target-cell"
import { isBankDepositWithoutChannelGl } from "@/lib/bank-import-deposit-category"
import {
  formatBankLedgerDepositCell,
  formatBankLedgerWithdrawCell,
  BANK_EDIT_BTN_CN,
  formatBankBaht,
  type QueryRowEdit,
  type BankTransactionRow,
} from "./bank-transactions-tab-utils"
import { defaultBankDepositSalesDateForRow } from "@/lib/pos-channel-reconcile-match"
import { bankWithdrawOpensCardBillRegister, memoLooksLikeCardBill } from "@/lib/card-bill-memo"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { bankDepositNeedsReceivableOrderLink } from "@/lib/bank-receivable-link"
import { Checkbox } from "@/components/ui/checkbox"
import type { AccountSubjectItem } from "@/lib/api-client"
import type * as React from "react"
import type { useRouter } from "next/navigation"

export type BankTransactionsQueryPanelProps = {
  accountId: string
  accounts: { id: number; name: string; store: string; bankName?: string; openingBalance?: number; openingBalanceDate?: string | null; }[]
  activeFilterChips: string[]
  actualBalance: string
  applyQueryQuickMemo: (phrase: string) => void
  asDisplayName: (a: AccountSubjectItem) => string
  bankAttentionCounts: { unclassified: number; noSubject: number; expenseLinkPending: number; receivableLinkPending: number; noVendor: number; total: number; }
  bankQuickMemos: string[]
  cardAccounts: { id: number; name: string; }[]
  clearListFilters: () => void
  deletingBankTxId: number | null
  depositsHiddenByFilter: boolean
  diff: number | null
  displayPeriodDeposits: number
  displayPeriodWithdrawals: number
  endStr: string
  exportBankTransactionsExcel: () => Promise<void>
  filterAccountSubjectEmpty: boolean
  filterAccountSubjectId: string
  filterAccountSubjectOptionsFiltered: AccountSubjectItem[]
  filterAmount: string
  filterCategory: string
  filterCategoryOptions: string[]
  filteredList: BankTransactionRow[]
  filterInvoiceNotReceived: boolean
  filterKeyword: string
  filterNeedsAttention: boolean
  filterTransType: string
  getCategoryLabel: (cat: string, transType: string) => string
  getMemo: (memo: string | undefined) => string
  handleBankInvoiceChange: (r: BankTransactionRow, newChecked: boolean) => void
  handleDeleteBankRow: (r: BankTransactionRow) => Promise<void>
  handleQueryRowSave: (r: BankTransactionRow, overrideEdits?: QueryRowEdit) => Promise<void>
  hidePosRevenueCategories: boolean
  isOffice: boolean
  list: BankTransactionRow[]
  listFilterActive: boolean
  listTypeCounts: { total: number; deposits: number; withdraws: number; shownTotal: number; shownDeposits: number; shownWithdraws: number; }
  loadData: () => Promise<void>
  loading: boolean
  loadPurchaseVendorOptions: (forceFresh?: boolean) => Promise<void>
  openBankQuickMemosEdit: () => void
  openReceivableLinkedView: (row: BankTransactionRow) => Promise<void>
  openReceivablePick: (row: BankTransactionRow) => Promise<void>
  patchCategoryEditsForAdvance: (edits: QueryRowEdit, category: string) => QueryRowEdit
  pickRowAccountSubjectOptions: (transType: string, category: string) => AccountSubjectItem[]
  posStoreCategoryBanner: React.JSX.Element | null
  prepaymentSubject: AccountSubjectItem | undefined
  queryMemoFocusIdRef: React.RefObject<number | null>
  queryRowEdits: Record<number, QueryRowEdit>
  querySavingId: number | null
  queryStoreSearch: string
  queryVendorSearch: string
  receivableOptions: string[]
  relatedVendorOptions: { code: string; name: string; }[]
  renderDepositCategorySelectItems: (currentCategory: string, hidePosRevenue: boolean, opts?: { includeQrChip?: boolean; }) => React.JSX.Element
  restoredHighlightTxId: number | null
  revenueAccountOptions: AccountSubjectItem[]
  router: ReturnType<typeof useRouter>
  selectedAccountStore: string
  setAccountId: React.Dispatch<React.SetStateAction<string>>
  setActualBalance: React.Dispatch<React.SetStateAction<string>>
  setChannelSettleRow: React.Dispatch<React.SetStateAction<BankTransactionRow | null>>
  setEndStr: React.Dispatch<React.SetStateAction<string>>
  setFilterAccountSubjectEmpty: React.Dispatch<React.SetStateAction<boolean>>
  setFilterAccountSubjectId: React.Dispatch<React.SetStateAction<string>>
  setFilterAmount: React.Dispatch<React.SetStateAction<string>>
  setFilterCategory: React.Dispatch<React.SetStateAction<string>>
  setFilterInvoiceNotReceived: React.Dispatch<React.SetStateAction<boolean>>
  setFilterKeyword: React.Dispatch<React.SetStateAction<string>>
  setFilterNeedsAttention: React.Dispatch<React.SetStateAction<boolean>>
  setFilterTransType: React.Dispatch<React.SetStateAction<string>>
  setMemoPreviewText: React.Dispatch<React.SetStateAction<string | null>>
  setQueryRowEdit: (rowId: number, field: string, value: string | undefined) => void
  setQueryRowEdits: React.Dispatch<React.SetStateAction<Record<number, QueryRowEdit>>>
  setQueryStoreSearch: React.Dispatch<React.SetStateAction<string>>
  setQueryVendorSearch: React.Dispatch<React.SetStateAction<string>>
  setRegisterActionRow: React.Dispatch<React.SetStateAction<BankTransactionRow | null>>
  setStartStr: React.Dispatch<React.SetStateAction<string>>
  startStr: string
  summary: { openingBalance: number; beginningBalance: number; periodDeposits: number; periodWithdrawals: number; calculatedBalance: number; } | null
  t: (k: string) => string
  tt: (key: string, fallback: string) => string
  updatingInvoiceId: number | null
  vendorOptions: { code: string; name: string; }[]
}

export function BankTransactionsQueryPanel({
  accountId,
  accounts,
  activeFilterChips,
  actualBalance,
  applyQueryQuickMemo,
  asDisplayName,
  bankAttentionCounts,
  bankQuickMemos,
  cardAccounts,
  clearListFilters,
  deletingBankTxId,
  depositsHiddenByFilter,
  diff,
  displayPeriodDeposits,
  displayPeriodWithdrawals,
  endStr,
  exportBankTransactionsExcel,
  filterAccountSubjectEmpty,
  filterAccountSubjectId,
  filterAccountSubjectOptionsFiltered,
  filterAmount,
  filterCategory,
  filterCategoryOptions,
  filteredList,
  filterInvoiceNotReceived,
  filterKeyword,
  filterNeedsAttention,
  filterTransType,
  getCategoryLabel,
  getMemo,
  handleBankInvoiceChange,
  handleDeleteBankRow,
  handleQueryRowSave,
  hidePosRevenueCategories,
  isOffice,
  list,
  listFilterActive,
  listTypeCounts,
  loadData,
  loading,
  loadPurchaseVendorOptions,
  openBankQuickMemosEdit,
  openReceivableLinkedView,
  openReceivablePick,
  patchCategoryEditsForAdvance,
  pickRowAccountSubjectOptions,
  posStoreCategoryBanner,
  prepaymentSubject,
  queryMemoFocusIdRef,
  queryRowEdits,
  querySavingId,
  queryStoreSearch,
  queryVendorSearch,
  receivableOptions,
  relatedVendorOptions,
  renderDepositCategorySelectItems,
  restoredHighlightTxId,
  revenueAccountOptions,
  router,
  selectedAccountStore,
  setAccountId,
  setActualBalance,
  setChannelSettleRow,
  setEndStr,
  setFilterAccountSubjectEmpty,
  setFilterAccountSubjectId,
  setFilterAmount,
  setFilterCategory,
  setFilterInvoiceNotReceived,
  setFilterKeyword,
  setFilterNeedsAttention,
  setFilterTransType,
  setMemoPreviewText,
  setQueryRowEdit,
  setQueryRowEdits,
  setQueryStoreSearch,
  setQueryVendorSearch,
  setRegisterActionRow,
  setStartStr,
  startStr,
  summary,
  t,
  tt,
  updatingInvoiceId,
  vendorOptions,
}: BankTransactionsQueryPanelProps) {
  return (
    <TabsContent value="query" className="mt-0">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder={t("bankAccount")} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {formatBankAccountLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="w-[130px] h-9" />
            <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="w-[130px] h-9" />
            <Input
              type="text"
              placeholder={t("bankActualBalance")}
              value={actualBalance}
              onChange={(e) => setActualBalance(e.target.value)}
              className="w-[120px] h-9 text-right"
              title={t("bankVerifyHint")}
            />
            <Button size="sm" onClick={loadData} disabled={loading || !accountId}>
              <Search className="h-4 w-4 mr-1" />
              {t("btn_query")}
            </Button>
          </div>

          {accounts.length === 0 ? (
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm text-muted-foreground">{t("bankAddAccount")} - {t("bankNoAccountHint")}</p>
            </div>
          ) : (
            <>
              {summary && (
                <div className="mb-4 space-y-3">
                  <div
                    className={cn(
                      "grid grid-cols-2 gap-2",
                      diff !== null ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-4"
                    )}
                  >
                    <MetricCard
                      size="sm"
                      label={t("bankDeposit")}
                      value={formatBankBaht(displayPeriodDeposits)}
                      variant="success"
                    />
                    <MetricCard
                      size="sm"
                      label={t("bankWithdraw")}
                      value={formatBankBaht(displayPeriodWithdrawals)}
                      variant="warning"
                    />
                    <MetricCard
                      size="sm"
                      variant="primary"
                      label={t("acct_kpi_bank_balance")}
                      value={formatBankBaht(summary.calculatedBalance)}
                      subLabel={`${t("bankOpeningBalance")} ${formatBankBaht(summary.beginningBalance ?? summary.openingBalance)}`}
                    />
                    <MetricCard
                      size="sm"
                      label={tt("bankListCountLabel", "조회 / 표시")}
                      value={tt("bankListCountShown", "표시 {shown}건").replace("{shown}", String(listTypeCounts.shownTotal))}
                      subLabel={tt(
                        "bankListCountBreakdownShort",
                        "조회 {total}건 · 입금 {deposits} · 출금 {withdraws}"
                      )
                        .replace("{total}", String(listTypeCounts.total))
                        .replace("{deposits}", String(listTypeCounts.deposits))
                        .replace("{withdraws}", String(listTypeCounts.withdraws))}
                      variant="default"
                    />
                    {diff !== null ? (
                      <MetricCard
                        size="sm"
                        label={t("bankDifference")}
                        value={`${diff >= 0 ? "+" : ""}${formatBankBaht(diff)}`}
                        variant={diff === 0 ? "success" : "warning"}
                      />
                    ) : null}
                  </div>
                  {listFilterActive ? (
                    <p className="text-xs text-muted-foreground">
                      {tt("bankSummaryFilteredHint", "입·출금 합계는 아래 목록 필터 기준")}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-lg bg-muted/20 border">
                <span className="text-sm font-medium text-muted-foreground mr-1">{t("bankFilterLabel") || "필터"}:</span>
                {activeFilterChips.map((chip) => (
                  <span
                    key={chip}
                    className="text-xs rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-foreground"
                  >
                    {chip}
                  </span>
                ))}
                <Select
                  value={filterTransType || "__all__"}
                  onValueChange={(v) => {
                    const next = v === "__all__" ? "" : v
                    setFilterTransType(next)
                    if (next) {
                      setFilterCategory("")
                      setFilterAccountSubjectId("")
                    }
                  }}
                >
                  <SelectTrigger className="w-[110px] h-9">
                    <SelectValue placeholder={t("pettyColType") || "유형"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">— {t("pettyColType") || "유형"}</SelectItem>
                    <SelectItem value="deposit">{t("bankDeposit")}</SelectItem>
                    <SelectItem value="withdraw">{t("bankWithdraw")}</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filterCategory || "__all__"}
                  onValueChange={(v) => {
                    const next = v === "__all__" ? "" : v
                    setFilterCategory(next)
                    if (next) setFilterAccountSubjectId("")
                  }}
                >
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue placeholder={t("bankCategoryLabel") || "용도"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">— {t("bankCategoryLabel") || "용도"}</SelectItem>
                    {filterCategoryOptions.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {getCategoryLabel(cat, filterTransType || "withdraw")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterAccountSubjectId || "__all__"} onValueChange={(v) => setFilterAccountSubjectId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">— {t("accountSubject") || "계정과목"}</SelectItem>
                    {filterAccountSubjectOptionsFiltered.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.code} {asDisplayName(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={filterAmount}
                  onChange={(e) => setFilterAmount(normalizeMoneyInputString(e.target.value))}
                  placeholder={t("bankFilterAmountPh") || "금액"}
                  title={t("bankFilterAmountHint") || "입·출금 절대 금액으로 검색"}
                  className="w-[110px] h-9"
                />
                <Input
                  type="search"
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  placeholder={t("bankFilterKeywordPh") || "적요·메모 검색"}
                  title={t("bankFilterKeywordHint") || "은행 적요, 메모, 거래처, 매장명"}
                  className="w-[180px] h-9 min-w-[140px]"
                />
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterAccountSubjectEmpty}
                    onChange={(e) => setFilterAccountSubjectEmpty(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm whitespace-nowrap">{t("bankFilterAccountSubjectEmpty") || "계정과목 미입력만"}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterInvoiceNotReceived}
                    onChange={(e) => setFilterInvoiceNotReceived(e.target.checked)}
                    className="rounded"
                    title={tt(
                      "bankFilterInvoiceNotReceivedHint",
                      "출금 중 인보이스 미수령만 목록에서 줄입니다. 입금은 그대로 표시됩니다."
                    )}
                  />
                  <span className="text-sm whitespace-nowrap">{t("poInvoiceNotReceived") || "인보이스 미수령만"}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterNeedsAttention}
                    onChange={(e) => setFilterNeedsAttention(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm whitespace-nowrap">{t("acct_bank_attention_filter")}</span>
                </label>
                <Button size="sm" variant="ghost" onClick={clearListFilters}>
                  {t("btn_reset") || "초기화"}
                </Button>
                <Button size="sm" variant="outline" onClick={exportBankTransactionsExcel} disabled={filteredList.length === 0} title={t("excelBtn") || "엑셀"}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  {t("excelBtn") || "엑셀"}
                </Button>
              </div>

              {!loading && depositsHiddenByFilter ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-300/80 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <span>
                    {tt(
                      "bankDepositsHiddenWarning",
                      "입금 {n}건이 조회됐지만 목록 필터 때문에 숨겨져 있습니다. 「초기화」를 누르세요."
                    ).replace("{n}", String(listTypeCounts.deposits))}
                  </span>
                  <Button size="sm" variant="outline" className="h-7" onClick={clearListFilters}>
                    {t("btn_reset") || "초기화"}
                  </Button>
                </div>
              ) : null}

              {!loading && bankAttentionCounts.total > 0 ? (
                <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <MetricCard
                    size="sm"
                    variant="warning"
                    label={t("acct_bank_attention_receivable_link")}
                    value={String(bankAttentionCounts.receivableLinkPending)}
                  />
                  <MetricCard
                    size="sm"
                    variant="warning"
                    label={t("acct_bank_attention_expense_link")}
                    value={String(bankAttentionCounts.expenseLinkPending)}
                  />
                  <MetricCard
                    size="sm"
                    variant="warning"
                    label={t("acct_bank_attention_unclassified")}
                    value={String(bankAttentionCounts.unclassified)}
                  />
                  <MetricCard
                    size="sm"
                    variant="warning"
                    label={t("acct_bank_attention_no_subject")}
                    value={String(bankAttentionCounts.noSubject)}
                  />
                </div>
              ) : null}

              {!loading && accountId && accounts.length > 0 && (
                <>
                  {posStoreCategoryBanner}
                <BankQuickMemoChipBar
                  className="mb-3"
                  phrases={bankQuickMemos}
                  title={t("bankImportQuickMemosTitle") || "자주 쓰는 메모"}
                  hint={
                    t("bankImportQuickMemoHint") ||
                    "메모 칸을 먼저 선택한 뒤 누르면 해당 줄에 붙고, 아니면 클립보드로 복사됩니다."
                  }
                  onPhrase={applyQueryQuickMemo}
                  onManageClick={openBankQuickMemosEdit}
                  manageLabel={t("bankQuickMemosManage") || "편집"}
                />
                </>
              )}

              <AccountingDataTable
                id="bank-query-list-wrap"
                className="max-h-[70vh] min-h-[320px]"
                minWidthClass="min-w-[1480px] w-full table-fixed"
              >
                {loading ? (
                  <tbody>
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                        {t("loadingItems")}
                      </td>
                    </tr>
                  </tbody>
                ) : filteredList.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-sm text-muted-foreground">
                        {list.length === 0 ? (t("pettyNoData") || "데이터 없음") : (t("bankNoMatchFilter") || "조건에 맞는 거래가 없습니다.")}
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <>
                    <colgroup>
                      <col style={{ width: "108px" }} />
                      <col style={{ width: "64px" }} />
                      <col style={{ width: "130px" }} />
                      <col style={{ width: "240px" }} />
                      <col style={{ width: "112px" }} />
                      <col style={{ width: "112px" }} />
                      <col style={{ width: "120px" }} />
                      <col style={{ width: "168px" }} />
                      <col style={{ width: "32px" }} />
                      <col style={{ width: "158px" }} />
                      <col style={{ width: "158px" }} />
                      <col style={{ width: "76px" }} />
                    </colgroup>
                    <AccountingTheadRow sticky>
                      <AccountingTh align="center">{t("date") || "날짜"}</AccountingTh>
                      <AccountingTh align="center">{t("pettyColType") || "유형"}</AccountingTh>
                      <AccountingTh align="center">{t("bankCategoryLabel") || "용도"}</AccountingTh>
                      <AccountingTh align="center">{t("accountSubject") || "계정과목"}</AccountingTh>
                      <AccountingTh align="right">{t("bankColDepositAmount") || "입금액"}</AccountingTh>
                      <AccountingTh align="right">{t("bankColWithdrawAmount") || "출금액"}</AccountingTh>
                      <AccountingTh align="center">{t("bankAttributedDate") || "인식일"}</AccountingTh>
                      <AccountingTh align="center">{t("acct_bank_link_col") || "연동"}</AccountingTh>
                      <AccountingTh align="center" title={t("poInvoiceReceived") || "인보이스 수령"}>Iv</AccountingTh>
                      <AccountingTh>{t("bankMemoLabel") || "은행 적요"}</AccountingTh>
                      <AccountingTh align="center">{t("bankNoteLabel") || "메모"}</AccountingTh>
                      <AccountingTh align="center" className="w-11"></AccountingTh>
                    </AccountingTheadRow>
                    <tbody>
                      {filteredList.map((r, i) => {
                        const edits = r.id ? queryRowEdits[r.id] : undefined
                        const rawCat = String(edits?.category ?? r.category ?? "expense").toLowerCase()
                        const cat =
                          r.transType === "withdraw" && rawCat === "fixed" ? "expense" : rawCat
                        const hasEdits = r.id && edits && Object.keys(edits).length > 0
                        const isSaving = querySavingId === r.id
                        const attention = bankRowNeedsAttention(
                          {
                            ...r,
                            category: cat,
                            storeName: edits?.storeName ?? r.storeName,
                            isReceivableLinked: r.isReceivableLinked,
                            isChannelSettled: r.isChannelSettled,
                            memo: r.memo,
                            note: edits?.note !== undefined ? edits.note : r.note,
                          },
                          edits
                        )
                        return (
                        <AccountingTbodyRow
                          id={r.id ? `bank-tx-row-${r.id}` : undefined}
                          key={r.id ?? i}
                          className={cn(
                            rawCat === "correction" && "bg-pink-50 dark:bg-pink-950/20",
                            r.id && restoredHighlightTxId === r.id && "bg-primary/10 ring-2 ring-primary/60",
                            attention.needsAttention &&
                              "bg-amber-50/80 dark:bg-amber-950/35 border-l-2 border-l-amber-500"
                          )}
                        >
                          <td className="p-2 align-middle text-center whitespace-nowrap text-sm tabular-nums">{r.transDate}</td>
                          <td className="p-2 align-middle text-center">{r.transType === "deposit" ? t("bankDeposit") : t("bankWithdraw")}</td>
                          <td className="p-2 align-middle">
                            {r.transType === "withdraw" ? (
                              <Select
                                value={cat}
                                onValueChange={(v) => {
                                  if (!r.id) return
                                  const mergedEdits = patchCategoryEditsForAdvance(
                                    { ...(queryRowEdits[r.id] || {}), category: v },
                                    v
                                  )
                                  setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                  if (v === "advance" && prepaymentSubject?.id) {
                                    void handleQueryRowSave(r, mergedEdits)
                                  } else if (v === "purchase_payment") {
                                    const effectiveVendor = String(mergedEdits.vendorCode ?? r.vendorCode ?? "").trim()
                                    if (effectiveVendor) void handleQueryRowSave(r, mergedEdits)
                                  }
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {BANK_WITHDRAW_UI_CATEGORIES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                      {getCategoryLabel(value, "withdraw")}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Select
                                value={bankDepositCategorySelectValue({
                                  category: cat,
                                  hidePosRevenue: hidePosRevenueCategories,
                                  memo: r.memo,
                                  note:
                                    edits?.note !== undefined
                                      ? edits.note
                                      : bankNoteUserDisplayText(r.note ?? ""),
                                })}
                                onValueChange={(v) => {
                                  if (!r.id) return
                                  const currentNote =
                                    edits?.note !== undefined
                                      ? edits.note ?? ""
                                      : bankNoteUserDisplayText(r.note ?? "")
                                  const applied = applyBankDepositCategorySelect({
                                    value: v,
                                    transType: r.transType,
                                    accountStore: selectedAccountStore,
                                    currentNote,
                                  })
                                  const mergedEdits = patchCategoryEditsForAdvance(
                                    {
                                      ...(queryRowEdits[r.id] || {}),
                                      category: applied.category,
                                      ...(applied.note !== undefined ? { note: applied.note } : {}),
                                      ...(applied.storeName ? { storeName: applied.storeName } : {}),
                                    },
                                    applied.category
                                  )
                                  setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                  const effectiveStoreName = (mergedEdits.storeName ?? r.storeName ?? "").trim()
                                  if (applied.category === "receivable_receive" && effectiveStoreName) {
                                    void handleQueryRowSave(r, mergedEdits)
                                  } else if (applied.category === "advance" && prepaymentSubject?.id) {
                                    void handleQueryRowSave(r, mergedEdits)
                                  }
                                }}
                              >
                                <SelectTrigger
                                  className="h-8 text-xs"
                                  title={
                                    hidePosRevenueCategories
                                      ? t("bankPosStoreCategorySelectTitle") ||
                                        "POS 매장: 배달앱·카드·QR·현금은 숨김. 오른쪽 「채널 정산」을 사용하세요."
                                      : undefined
                                  }
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {renderDepositCategorySelectItems(cat, hidePosRevenueCategories)}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="p-2 align-middle">
                            {(r.transType === "withdraw" && cat === "purchase_payment") ||
                            (r.transType === "deposit" && (cat === "loan" || cat === "loan_borrow")) ? (
                              <>
                              <Select
                                value={(edits?.vendorCode ?? r.vendorCode ?? "") || "__none__"}
                                onValueChange={(v) => {
                                  if (!r.id) return
                                  const vendorCode = v === "__none__" ? "" : v
                                  const mergedEdits: QueryRowEdit = { ...(queryRowEdits[r.id] || {}), vendorCode }
                                  setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                  if (vendorCode) void handleQueryRowSave(r, mergedEdits)
                                }}
                          onOpenChange={(open) => {
                            if (!open) {
                              setQueryVendorSearch("")
                              return
                            }
                            if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                          }}
                              >
                                <SelectTrigger className="h-8 w-full text-xs">
                                  <SelectValue placeholder={t("inVendorPlaceholder") || "거래처"} />
                                </SelectTrigger>
                                <SelectContent>
                                  <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      placeholder={t("search") || "검색"}
                                      value={queryVendorSearch}
                                      onChange={(e) => setQueryVendorSearch(e.target.value)}
                                      onKeyDown={(e) => e.stopPropagation()}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {(r.transType === "deposit" && (cat === "loan" || cat === "loan_borrow")
                                    ? relatedVendorOptions
                                    : vendorOptions)
                                    .filter((v) => !queryVendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(queryVendorSearch.trim().toLowerCase()))
                                    .map((v) => (
                                      <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              {r.transType === "withdraw" && cat === "purchase_payment" && r.id ? (
                                <div className="mt-1 space-y-1" title={t("bankPurchaseWhtHint") || "통장 금액은 실이체입니다. 원천세는 거래처 잔액에서 따로 빠집니다."}>
                                  <div className="flex items-center gap-1">
                                  <Input
                                    className="h-8 w-16 shrink-0 text-sm tabular-nums px-1.5"
                                    inputMode="decimal"
                                    aria-label={t("bankPurchaseWhtRate") || "WHT %"}
                                    placeholder="%"
                                    value={
                                      edits?.withholdingTaxRate ??
                                      (r.withholdingTaxRate != null ? String(r.withholdingTaxRate) : "3")
                                    }
                                    onChange={(e) => setQueryRowEdit(r.id!, "withholdingTaxRate", e.target.value)}
                                  />
                                  <Input
                                    className="h-8 min-w-0 flex-1 text-sm tabular-nums px-1.5"
                                    inputMode="decimal"
                                    aria-label={t("bankPurchaseWhtAmount") || "WHT"}
                                    placeholder={t("bankPurchaseWhtAmount") || "WHT"}
                                    value={
                                      edits?.withholdingTaxAmount ??
                                      (r.withholdingTaxAmount != null ? String(r.withholdingTaxAmount) : "")
                                    }
                                    onChange={(e) => setQueryRowEdit(r.id!, "withholdingTaxAmount", e.target.value)}
                                    onBlur={(e) => {
                                      const latest = queryRowEdits[r.id!]
                                      if (!latest) return
                                      void handleQueryRowSave(r, {
                                        ...latest,
                                        withholdingTaxAmount: e.target.value,
                                      })
                                    }}
                                  />
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-full px-2 text-xs"
                                    onClick={() => {
                                      const rateRaw = edits?.withholdingTaxRate ?? (r.withholdingTaxRate != null ? String(r.withholdingTaxRate) : "3")
                                      const rate = Number(String(rateRaw).replace(/,/g, "")) || 3
                                      const suggested = suggestPurchaseWhtFromNetPayment(Math.abs(Number(r.amount) || 0), rate)
                                      const merged: QueryRowEdit = {
                                        ...(queryRowEdits[r.id!] || {}),
                                        withholdingTaxRate: String(rate),
                                        withholdingTaxAmount: String(suggested),
                                      }
                                      setQueryRowEdits((prev) => ({ ...prev, [r.id!]: merged }))
                                      void handleQueryRowSave(r, merged)
                                    }}
                                  >
                                    {t("bankPurchaseWhtSuggest") || "3%"}
                                  </Button>
                                </div>
                              ) : null}
                              </>
                            ) : r.transType === "deposit" && cat === "receivable_receive" ? (
                              <Select
                                value={(edits?.storeName ?? r.storeName ?? "") || "__none__"}
                                onValueChange={(v) => {
                                  if (!r.id) return
                                  const storeName = v === "__none__" ? "" : v
                                  const mergedEdits: QueryRowEdit = { ...(queryRowEdits[r.id] || {}), storeName }
                                  setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                  if (storeName) {
                                    void handleQueryRowSave(r, mergedEdits)
                                  }
                                }}
                                onOpenChange={(open) => !open && setQueryStoreSearch("")}
                              >
                                <SelectTrigger className="h-8 text-xs max-w-[120px]">
                                  <SelectValue placeholder={t("store") || "매장"} />
                                </SelectTrigger>
                                <SelectContent>
                                  <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                    <Input
                                      placeholder={t("search") || "검색"}
                                      value={queryStoreSearch}
                                      onChange={(e) => setQueryStoreSearch(e.target.value)}
                                      onKeyDown={(e) => e.stopPropagation()}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {receivableOptions
                                    .filter((s) => !queryStoreSearch.trim() || (s || "").toLowerCase().includes(queryStoreSearch.trim().toLowerCase()))
                                    .map((s) => (
                                      <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            ) : cat === "advance" ? (
                              <BankAdvanceTargetCell
                                storeName={edits?.storeName ?? r.storeName}
                                vendorCode={edits?.vendorCode ?? r.vendorCode}
                                prepaymentSubject={prepaymentSubject}
                                stores={receivableOptions}
                                vendors={vendorOptions}
                                cardAccounts={cardAccounts}
                                storeSearch={queryStoreSearch}
                                onStoreSearchChange={setQueryStoreSearch}
                                vendorSearch={queryVendorSearch}
                                onVendorSearchChange={setQueryVendorSearch}
                                onVendorDropdownOpen={() => {
                                  if (vendorOptions.length === 0) void loadPurchaseVendorOptions(true)
                                }}
                                asDisplayName={asDisplayName}
                                t={t}
                                tt={tt}
                                onChange={(next) => {
                                  if (!r.id) return
                                  const mergedEdits: QueryRowEdit = {
                                    ...(queryRowEdits[r.id] || {}),
                                    storeName: next.storeName,
                                    vendorCode: next.vendorCode,
                                    ...(prepaymentSubject?.id
                                      ? { accountSubjectId: String(prepaymentSubject.id) }
                                      : {}),
                                  }
                                  setQueryRowEdits((prev) => ({ ...prev, [r.id!]: mergedEdits }))
                                  void handleQueryRowSave(r, mergedEdits)
                                }}
                              />
                            ) : r.isCardLinked ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : r.transType === "withdraw" && !isBankWithdrawCategoryWithoutSubject(cat) ? (
                              <Select
                                value={(edits?.accountSubjectId !== undefined ? edits.accountSubjectId : r.accountSubjectId != null ? String(r.accountSubjectId) : "__none__") || "__none__"}
                                onValueChange={(v) => r.id && setQueryRowEdit(r.id, "accountSubjectId", v === "__none__" ? "" : v)}
                              >
                                <SelectTrigger className="h-8 text-xs max-w-[140px]">
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {pickRowAccountSubjectOptions(r.transType, cat).map((a) => (
                                    <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : r.transType === "deposit" && !isBankDepositWithoutChannelGl(cat) ? (
                              <Select
                                value={(edits?.accountSubjectId !== undefined ? edits.accountSubjectId : r.accountSubjectId != null ? String(r.accountSubjectId) : "__none__") || "__none__"}
                                onValueChange={(v) => r.id && setQueryRowEdit(r.id, "accountSubjectId", v === "__none__" ? "" : v)}
                              >
                                <SelectTrigger className="h-8 text-xs max-w-[120px]">
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {revenueAccountOptions.map((a) => (
                                    <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "p-2 align-middle text-right whitespace-nowrap tabular-nums",
                              r.transType === "deposit"
                                ? "text-green-600 dark:text-green-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {formatBankLedgerDepositCell(r.transType || "withdraw", r.amount)}
                          </td>
                          <td
                            className={cn(
                              "p-2 align-middle text-right whitespace-nowrap tabular-nums",
                              r.transType === "withdraw"
                                ? "text-orange-600 dark:text-orange-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {formatBankLedgerWithdrawCell(r.transType || "withdraw", r.amount)}
                          </td>
                          <td className="p-2 align-middle text-center">
                            {r.transType === "deposit" && !isBankDepositWithoutChannelGl(cat) ? (
                              <Input
                                type="date"
                                value={
                                  edits?.salesDate ??
                                  r.salesDate ??
                                  defaultBankDepositSalesDateForRow({
                                    transDate: r.transDate,
                                    category: cat,
                                    accountSubjectCode: revenueAccountOptions.find(
                                      (s) =>
                                        Number(s.id) ===
                                        Number(
                                          edits?.accountSubjectId !== undefined
                                            ? edits.accountSubjectId
                                            : r.accountSubjectId
                                        )
                                    )?.code,
                                  })
                                }
                                onChange={(e) => r.id && setQueryRowEdit(r.id, "salesDate", e.target.value)}
                                className="h-8 text-xs min-w-[112px] w-full max-w-[112px] mx-auto"
                              />
                            ) : r.transType === "withdraw" && (cat === "expense" || cat === "purchase_payment") ? (
                              <Input
                                type="date"
                                value={edits?.expenseDate ?? r.expenseDate ?? r.transDate}
                                onChange={(e) => r.id && setQueryRowEdit(r.id, "expenseDate", e.target.value)}
                                className="h-8 text-xs min-w-[112px] w-full max-w-[112px] mx-auto"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2 align-middle">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                            {r.transType === "withdraw" && isBankExpenseRelatedWithdrawCategory(cat) && !memoLooksLikeCardBill(r.memo || "") ? (
                              r.isLinked ? (
                                <>
                                  <span
                                    className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400 whitespace-nowrap"
                                    title={t("acct_bank_expense_linked")}
                                  >
                                    {t("acct_bank_expense_linked")}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={BANK_EDIT_BTN_CN}
                                    onClick={() => {
                                  const amt = Math.abs(r.amount ?? 0)
                                  const bankMemo = (r.memo || "").trim().slice(0, 500)
                                  const bankNote = bankNoteUserDisplayText((r.note || "").trim()).slice(0, 500)
                                  const q = new URLSearchParams({ tab: "expenseRegister", updateExisting: "1" })
                                  if (r.id) q.set("bankTransactionId", String(r.id))
                                  if (amt > 0) q.set("amount", formatMoneyAmountParam(amt))
                                  if (bankMemo) q.set("bankMemo", bankMemo)
                                  if (bankNote) q.set("bankNote", bankNote)
                                  if (r.transDate) q.set("transDate", r.transDate)
                                  if (accountId) q.set("accountId", accountId)
                                  if (selectedAccountStore) q.set("storeName", selectedAccountStore)
                                  if (cat) q.set("category", cat)
                                  if (r.vendorCode) q.set("vendorCode", r.vendorCode)
                                  if (r.accountSubjectId != null) q.set("accountSubjectId", String(r.accountSubjectId))
                                  q.set("startStr", startStr)
                                  q.set("endStr", endStr)
                                  q.set("returnTab", "query")
                                  if (r.id) q.set("openRegisterTxId", String(r.id))
                                  router.push(`/admin/expense-management?${q.toString()}`)
                                }}
                                  >
                                    {t("bankRegisterEdit") || "수정"}
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <span
                                    className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 whitespace-nowrap"
                                    title={t("acct_bank_expense_unlinked")}
                                  >
                                    <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                                    {t("acct_bank_expense_unlinked")}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={ADMIN_BTN_XS_CN}
                                    onClick={() => setRegisterActionRow({ ...r, category: cat })}
                                  >
                                    {t("bankRegisterLinkExpenseMgmt") || tt("bankRegisterLinkExpenseMgmt", "연결")}
                                  </Button>
                                </>
                              )
                            ) : r.transType === "withdraw" && r.id && bankWithdrawOpensCardBillRegister(cat, r.memo || "") ? (
                              r.isCardLinked ? (
                                <span
                                  className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400 whitespace-nowrap"
                                  title={tt("bankCardExpenseLinked", "카드 연동")}
                                >
                                  {tt("bankCardExpenseLinked", "카드 연동")}
                                </span>
                              ) : r.isLinked ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={ADMIN_BTN_XS_CN}
                                  onClick={() => {
                                    const amt = Math.abs(r.amount ?? 0)
                                    const bankMemo = (r.memo || "").trim().slice(0, 500)
                                    const bankNote = bankNoteUserDisplayText((r.note || "").trim()).slice(0, 500)
                                    const cardBill = memoLooksLikeCardBill(bankMemo) || cat === "bank_card_bill"
                                    const q = new URLSearchParams({
                                      tab: "expenseRegister",
                                      category: cardBill ? "bank_card_bill" : "transfer",
                                    })
                                    q.set("bankTransactionId", String(r.id))
                                    if (amt > 0) q.set("amount", formatMoneyAmountParam(amt))
                                    if (bankMemo) q.set("bankMemo", bankMemo)
                                    if (bankNote) q.set("bankNote", bankNote)
                                    if (r.transDate) q.set("transDate", r.transDate)
                                    if (accountId) q.set("accountId", accountId)
                                    if (selectedAccountStore) q.set("storeName", selectedAccountStore)
                                    q.set("startStr", startStr)
                                    q.set("endStr", endStr)
                                    q.set("returnTab", "query")
                                    q.set("openRegisterTxId", String(r.id))
                                    router.push(`/admin/expense-management?${q.toString()}`)
                                  }}
                                >
                                  {memoLooksLikeCardBill(r.memo || "") || cat === "bank_card_bill"
                                    ? tt("bankRegisterCardExpense", "카드 지출")
                                    : t("bankRegisterLink") || "지출 등록"}
                                </Button>
                              )
                            ) : r.transType === "deposit" && cat === "receivable_receive" && r.id ? (
                              (() => {
                                const rowEdits = r.id ? queryRowEdits[r.id] : undefined
                                const store = (
                                  rowEdits?.storeName ??
                                  r.storeName ??
                                  selectedAccountStore ??
                                  ""
                                ).trim()
                                const depositLinkCtx = {
                                  transType: r.transType,
                                  category: cat,
                                  storeName: store,
                                  memo: r.memo,
                                  note: rowEdits?.note !== undefined ? rowEdits.note : r.note,
                                  isReceivableLinked: r.isReceivableLinked,
                                  isChannelSettled: r.isChannelSettled,
                                }
                                const needsReceivableLink = bankDepositNeedsReceivableOrderLink(depositLinkCtx)
                                if (needsReceivableLink && r.isReceivableLinked) {
                                  return (
                                    <>
                                      <span
                                        className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400 whitespace-nowrap"
                                        title={t("acct_bank_receivable_linked")}
                                      >
                                        {t("acct_bank_receivable_linked")}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className={`${ADMIN_BTN_XS_CN} shrink-0 h-7 px-1.5`}
                                        onClick={() => void openReceivableLinkedView(r)}
                                      >
                                        {tt("bankReceivableLinkedView", "연결 보기")}
                                      </Button>
                                    </>
                                  )
                                }
                                if (needsReceivableLink && !r.isReceivableLinked) {
                                  return (
                                    <>
                                      <span
                                        className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-300 whitespace-nowrap"
                                        title={t("acct_bank_receivable_unlinked")}
                                      >
                                        <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                                        {t("acct_bank_receivable_unlinked")}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={ADMIN_BTN_XS_CN}
                                        onClick={() => void openReceivablePick(r)}
                                      >
                                        {tt("bankRegisterLinkReceivable", "미수 연결")}
                                      </Button>
                                    </>
                                  )
                                }
                                const settleAction = bankChannelSettlementRowAction({
                                  memo: r.memo,
                                  note: depositLinkCtx.note,
                                  storeName: store,
                                  isChannelSettled: r.isChannelSettled,
                                })
                                if (settleAction === "post" || settleAction === "edit") {
                                  return (
                                    <Button
                                      size="sm"
                                      variant={settleAction === "edit" ? "ghost" : "outline"}
                                      className={ADMIN_BTN_XS_CN}
                                      onClick={() => setChannelSettleRow(r)}
                                      title={
                                        settleAction === "edit"
                                          ? tt("bankPosChannelSettleEditBtn", "수수료 수정")
                                          : tt("bankPosChannelSettleRowBtn", "채널 정산 (수수료 분개)")
                                      }
                                    >
                                      {settleAction === "edit"
                                        ? tt("bankPosChannelSettleEditBtn", "수수료 수정")
                                        : tt("bankPosChannelSettleRowBtn", "채널 정산")}
                                    </Button>
                                  )
                                }
                                return <span className="text-muted-foreground">—</span>
                              })()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                            </div>
                          </td>
                          <td className="p-2 align-middle text-center">
                            {r.transType === "withdraw" ? (
                              (() => {
                              const hasInvoice = r.invoiceReceived === true || (r.invoiceNo && String(r.invoiceNo).trim() !== "") || (r.invoicePhotoUrl && String(r.invoicePhotoUrl).trim() !== "")
                              const isPurchasePayment = cat === "purchase_payment" && r.isLinked
                              return isPurchasePayment ? (
                                <Checkbox
                                  checked={!!r.invoiceReceived}
                                  onCheckedChange={(checked) => {
                                    if (checked === "indeterminate") return
                                    handleBankInvoiceChange(r, checked === true)
                                  }}
                                  disabled={updatingInvoiceId === r.id}
                                  title={t("poInvoiceReceived") || "인보이스 수령"}
                                  className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 shrink-0 mx-auto"
                                />
                              ) : (
                                <Checkbox checked={!!hasInvoice} disabled className="shrink-0 mx-auto pointer-events-none" title={hasInvoice ? (t("poInvoiceReceived") || "인보이스 수령") : (t("poInvoiceNotReceived") || "인보이스 미수령")} />
                              )
                            })()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td
                            className="p-2 align-middle text-left truncate max-w-[158px] text-muted-foreground text-sm cursor-pointer hover:bg-muted/50 rounded"
                            onClick={() => r.memo?.trim() && setMemoPreviewText(r.memo)}
                            title={r.memo?.trim() ? r.memo : undefined}
                          >
                            {getMemo(r.memo)}
                          </td>
                          <td className="p-2 align-middle">
                            <Input
                              placeholder={t("bankNotePlaceholder") || "메모 입력"}
                              value={
                                edits?.note !== undefined
                                  ? edits.note
                                  : bankNoteUserDisplayText(r.note ?? "")
                              }
                              onChange={(e) => r.id && setQueryRowEdit(r.id, "note", e.target.value)}
                              onFocus={() => {
                                if (r.id) queryMemoFocusIdRef.current = r.id
                              }}
                              className="h-8 text-xs min-w-[140px] w-full max-w-[158px]"
                            />
                          </td>
                          <td className="p-2 align-middle text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              {hasEdits && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() => handleQueryRowSave(r)}
                                  disabled={isSaving}
                                  title={t("btn_save") || "저장"}
                                >
                                  {isSaving ? <span className="text-xs">...</span> : <Save className="h-4 w-4" />}
                                </Button>
                              )}
                              {isOffice && r.id && (r.transType === "withdraw" || r.transType === "deposit") ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => void handleDeleteBankRow(r)}
                                  disabled={deletingBankTxId === r.id}
                                  title={tt("bankTxRowDeleteTitle", "거래 삭제")}
                                >
                                  {deletingBankTxId === r.id ? (
                                    <span className="text-xs">...</span>
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </AccountingTbodyRow>
                      );
                      })}
                    </tbody>
                  </>
                )}
              </AccountingDataTable>
            </>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  )
}
