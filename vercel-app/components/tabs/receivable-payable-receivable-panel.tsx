"use client"

import { TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { adminTabsContentCn } from "@/lib/admin-tab-styles"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  PencilLine,
  Printer,
  Search,
  Trash2,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
  renderReceivableLedgerDateCell,
  TabPanelHeavyContent,
  UnallocatedBankDepositChips,
} from "./receivable-payable-ledger-parts"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  fmtBaht,
  fmtBahtSigned,
  type LineItemsCacheEntry,
  printableReceivableTaxInvoiceKeys,
  receivableTaxInvoicePrintSelectionKey,
  resolveReceivableTaxInvoicePrintSource,
  transactionLineRowKey,
} from "./receivable-payable-tab-utils"
import {
  buildLedgerRowGroupMeta,
  filterLedgerPairGroupsForDisplay,
  groupReceivableLedgerRows,
  pairReceivableLedgerDates,
  priorCumulativeBalance,
  sortLedgerPairGroupsDesc,
  sumReceivablePayablePeriodAmounts,
} from "@/lib/receivable-payable-period-totals"
import {
  canManuallyToggleReceivableReceiveCheck,
  filterUnallocatedBankDepositsVisible,
  sumUnallocatedBankDeposits,
} from "@/lib/receivable-unallocated-bank"
import { LedgerPairRowBadge, ReceivablePairedLedgerList } from "@/components/tabs/receivable-payable-paired-ledger"
import {
  resolveReceivableOrderNoDisplay,
  resolveReceivableTaxInvoiceDocNoDisplay,
} from "@/lib/receivable-invoice-format"
import { orderIdFromReceivableOrderRow } from "@/lib/receivable-order-id-parse"
import { isManualReceivableBalanceRow } from "@/lib/manual-balance-transaction"
import { canMutateManualReceivableBalance, canUpdateReceivableReceiveCheck } from "@/lib/permissions"
import { agingDaysBetween, agingRowToneClass, isAccrualRefType } from "@/lib/receivable-aging"
import * as React from "react"
import { getLedgerPairRowClass } from "@/lib/receivable-payable-ledger-pair-styles"
import { StorePurchaseJournalButton } from "@/components/erp/store-purchase-journal-dialog"
import type { ReceivablePayableItem } from "@/lib/api-client"
import type { AuthState } from "@/lib/auth-context"
import type { ReceivableCustomerOption } from "./receivable-payable-tab-utils"

export type ReceivablePayableReceivablePanelProps = {
  amountGridCols: "grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(6rem,1fr))] gap-x-2 sm:gap-x-3 gap-y-1 items-center w-full min-w-0"
  auth: AuthState | null
  canSelectStores: boolean
  contentTab: "receivable" | "payable" | "borrowings"
  cumulativeColLabel: string
  cumulativeSummary: { totalAmount: number; byKey: Record<string, number>; }
  endStr: string
  expandedPayableRowId: string | null
  filteredSalesOutletOptions: ReceivableCustomerOption[]
  filterItemsByUnpaid: <T extends { ref_type?: string; }>(items: T[] | undefined, isRec: boolean) => T[]
  filterRowsByLedgerPeriod: <T extends { trans_date?: string; }>(items: T[]) => T[]
  filterUnpaidOnly: boolean
  formatPriorBalanceHint: (prior: number | undefined) => string | null
  formatReceivableStoreDisplay: (item: { storeName?: string; vendorCode?: string; vendorName?: string; }) => string
  formatVendorDisplay: (vendorCode?: string, knownName?: string | null) => string
  getCumulativeBalanceForItem: (item: ReceivablePayableItem) => number | undefined
  getMemo: (memo: string | undefined) => string
  handleBulkTaxInvoicePrint: () => Promise<void>
  handleExcel: () => void
  handleLoadList: () => void
  handleManualBalanceDelete: (ledger: "receivable" | "payable", id: number) => Promise<void>
  handlePrint: () => void
  handleReceiveCheckChange: (params: { receivableId: number; receiveChecked: boolean; outletStoreName: string; receiveDate?: string; }) => Promise<void>
  handleTaxInvoicePrint: (row: NonNullable<ReceivablePayableItem["items"]>[number], recItem: ReceivablePayableItem) => Promise<void>
  hasSearchedList: boolean
  invoiceSearch: string
  isManager: boolean
  jumpToPayableForMatchedVendor: () => void
  ledgerDetailTableCn: "min-w-[1190px] w-max max-w-none text-sm border-separate border-spacing-0"
  ledgerNoPeriodRowsHint: string
  ledgerPairLabels: { statusSettled: string; statusOpen: string; statusPartial: string; statusStandalone: string; settlementPrefix: string; noSettlement: string; daysBetween: string; openRemain: string; salesDate: string; receiveDate: string; purchaseDate: string; paymentDate: string; }
  ledgerSummaryHeaderCellCn: "text-center min-w-0 px-1 text-sm sm:text-sm leading-tight"
  ledgerSummaryMetrics: React.JSX.Element | null
  ledgerViewMode: "ledger" | "paired"
  ledgerViewModeSelect: React.JSX.Element
  listData: ReceivablePayableItem[]
  listSearchTotals: { accrualSum: number; settlementSum: number; balanceSum: number; cumulativeSum: number; unallocatedBankSum: number; count: number; }
  loading: boolean
  loadingItemsFor: string | null
  managerStore: string
  manualEditSaving: boolean
  openBankTransactionFromReceivable: (bankTransactionId: number, transDate?: string, accountId?: number | string | null) => void
  openManualBalanceEdit: (ledger: "receivable" | "payable", row: NonNullable<ReceivablePayableItem["items"]>[number], entity: string) => void
  openReceiveCheckDialog: (params: { receivableId: number; outletStoreName: string; invoiceLabel: string; }) => void
  payableItemsCache: Record<string, LineItemsCacheEntry>
  purchaseVendorMatchForOutlet: { code: string; name: string; bankAccountNo?: string | null; } | null
  rowHighlightsBankTx: (row: NonNullable<ReceivablePayableItem["items"]>[number]) => boolean
  salesOutletFilter: string
  salesOutletSearch: string
  selectedTaxInvoicePrintKeys: Set<string>
  setEndStr: React.Dispatch<React.SetStateAction<string>>
  setFilterUnpaidOnly: React.Dispatch<React.SetStateAction<boolean>>
  setInvoiceSearch: React.Dispatch<React.SetStateAction<string>>
  setSalesOutletFilter: React.Dispatch<React.SetStateAction<string>>
  setSalesOutletSearch: React.Dispatch<React.SetStateAction<string>>
  setSelectedTaxInvoicePrintKeys: React.Dispatch<React.SetStateAction<Set<string>>>
  setStartStr: React.Dispatch<React.SetStateAction<string>>
  showLedgerList: boolean
  showReceivableManualActions: boolean
  showStorePurchaseJournalCol: boolean
  startStr: string
  t: (k: string) => string
  tabPanelPendingLabel: string
  taxInvoiceBulkProgress: { current: number; total: number; } | null
  taxInvoiceLoadingKey: string | null
  taxInvoiceOverrideMap: Record<string, { documentNo?: string; }>
  toggleLineItemsExpand: (mode: "pay" | "rec", row: { id?: number; ref_type?: string; ref_id?: number; invoice_no?: string; memo?: string; }) => Promise<void>
  toggleTaxInvoicePrintKey: (key: string, next: boolean) => void
  toggleTaxInvoicePrintKeys: (keys: string[], selectAll: boolean) => void
  tt: (key: string, fallback: string) => string
  updatingReceiveCheckId: number | null
}

export function ReceivablePayableReceivablePanel({
  amountGridCols,
  auth,
  canSelectStores,
  contentTab,
  cumulativeColLabel,
  cumulativeSummary,
  endStr,
  expandedPayableRowId,
  filteredSalesOutletOptions,
  filterItemsByUnpaid,
  filterRowsByLedgerPeriod,
  filterUnpaidOnly,
  formatPriorBalanceHint,
  formatReceivableStoreDisplay,
  formatVendorDisplay,
  getCumulativeBalanceForItem,
  getMemo,
  handleBulkTaxInvoicePrint,
  handleExcel,
  handleLoadList,
  handleManualBalanceDelete,
  handlePrint,
  handleReceiveCheckChange,
  handleTaxInvoicePrint,
  hasSearchedList,
  invoiceSearch,
  isManager,
  jumpToPayableForMatchedVendor,
  ledgerDetailTableCn,
  ledgerNoPeriodRowsHint,
  ledgerPairLabels,
  ledgerSummaryHeaderCellCn,
  ledgerSummaryMetrics,
  ledgerViewMode,
  ledgerViewModeSelect,
  listData,
  listSearchTotals,
  loading,
  loadingItemsFor,
  managerStore,
  manualEditSaving,
  openBankTransactionFromReceivable,
  openManualBalanceEdit,
  openReceiveCheckDialog,
  payableItemsCache,
  purchaseVendorMatchForOutlet,
  rowHighlightsBankTx,
  salesOutletFilter,
  salesOutletSearch,
  selectedTaxInvoicePrintKeys,
  setEndStr,
  setFilterUnpaidOnly,
  setInvoiceSearch,
  setSalesOutletFilter,
  setSalesOutletSearch,
  setSelectedTaxInvoicePrintKeys,
  setStartStr,
  showLedgerList,
  showReceivableManualActions,
  showStorePurchaseJournalCol,
  startStr,
  t,
  tabPanelPendingLabel,
  taxInvoiceBulkProgress,
  taxInvoiceLoadingKey,
  taxInvoiceOverrideMap,
  toggleLineItemsExpand,
  toggleTaxInvoicePrintKey,
  toggleTaxInvoicePrintKeys,
  tt,
  updatingReceiveCheckId,
}: ReceivablePayableReceivablePanelProps) {
  return (
    <TabsContent value="receivable" className={cn(adminTabsContentCn, "space-y-4")}>
      <Card>
        <CardContent className="pt-4">
          <div className="w-full">
              <div className="flex flex-wrap items-end gap-3 mb-4">
                {/* 미수금: 매출처만 (전체 매출처 = 매장+판매처) */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">{(t("recFilterSalesOutlet") || "Customer")}</label>
                  <Select
                    value={salesOutletFilter}
                    onValueChange={setSalesOutletFilter}
                    disabled={!canSelectStores && isManager && !!managerStore}
                    onOpenChange={(open) => {
                      if (!open) setSalesOutletSearch("")
                    }}
                  >
                    <SelectTrigger className="w-[240px] h-9">
                      <SelectValue placeholder={t("recFilterSalesOutletAll") || "All Customers"} />
                    </SelectTrigger>
                    <SelectContent className="min-w-[280px]">
                      <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                        <Input
                          placeholder={
                            t("recFilterSalesOutletSearch") ||
                            tt("recFilterSalesOutletSearch", "Search store (Ekkamai, Union…)")
                          }
                          value={salesOutletSearch}
                          onChange={(e) => setSalesOutletSearch(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="h-8 text-sm"
                        />
                      </div>
                      <SelectItem value="All">{(t("recFilterSalesOutletAll") || "All Customers")}</SelectItem>
                      {filteredSalesOutletOptions.map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.name && s.name !== s.code ? `${s.name} (${s.code})` : s.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">{t("outInvoiceSearchPh") || tt("outInvoiceSearchPh", "인보이스번호 검색")}</label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={invoiceSearch}
                      onChange={(e) => setInvoiceSearch(e.target.value)}
                      placeholder={t("outInvoiceSearchPh") || tt("outInvoiceSearchPh", "인보이스번호 검색")}
                      className="h-9 w-[160px] max-w-full text-[13px] pr-8"
                    />
                    <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <Input
                  type="date"
                  value={startStr}
                  onChange={(e) => setStartStr(e.target.value)}
                  className="h-9 w-[172px] max-w-full text-[13px]"
                />
                <Input
                  type="date"
                  value={endStr}
                  onChange={(e) => setEndStr(e.target.value)}
                  className="h-9 w-[172px] max-w-full text-[13px]"
                />
                <label className="flex items-center gap-2 cursor-pointer text-sm shrink-0 h-9">
                  <Checkbox checked={filterUnpaidOnly} onCheckedChange={(v) => setFilterUnpaidOnly(!!v)} className="mt-0" />
                  {t("recFilterUnpaidOnly") || "Unpaid Only"}
                </label>
                {ledgerViewModeSelect}
                <Button
                  size="sm"
                  onClick={handleLoadList}
                  disabled={loading}
                  className="h-9"
                >
                  <Search className="h-4 w-4 mr-1" />
                  {t("btn_query")}
                </Button>
                <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading || listData.length === 0} title={t("pettyPrintHint")} className="h-9">
                  <Printer className="h-4 w-4 mr-1" />
                  {t("printBtn")}
                </Button>
                <Button size="sm" variant="outline" onClick={handleExcel} disabled={loading || listData.length === 0} title={t("pettyExcelHint")} className="h-9">
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  {t("excelBtn")}
                </Button>
              </div>
              {selectedTaxInvoicePrintKeys.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2 mb-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
                  <FileText className="h-4 w-4 text-primary shrink-0" aria-hidden />
                  <span className="text-sm font-medium">
                    {tt("recTaxInvoiceBulkBarCount", "{n}건 선택").replace(
                      "{n}",
                      String(selectedTaxInvoicePrintKeys.size)
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground max-w-xl">
                    {tt(
                      "recTaxInvoiceBulkPrintHint",
                      "출고 1건 = 세금계산서 1장. 여러 건을 한 장으로 합치지 않습니다."
                    )}
                  </span>
                  <Button
                    size="sm"
                    className="h-8 sm:ml-auto"
                    disabled={taxInvoiceLoadingKey != null}
                    onClick={() => void handleBulkTaxInvoicePrint()}
                  >
                    {taxInvoiceLoadingKey === "bulk" && taxInvoiceBulkProgress
                      ? tt("recTaxInvoiceBulkPreparing", "세금계산서 {current}/{total}건 준비 중…")
                          .replace("{current}", String(taxInvoiceBulkProgress.current))
                          .replace("{total}", String(taxInvoiceBulkProgress.total))
                      : tt("recTaxInvoiceBulkPrintBtn", "선택 건 인쇄 (건별 1장)")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={taxInvoiceLoadingKey != null}
                    onClick={() => setSelectedTaxInvoicePrintKeys(new Set())}
                  >
                    {tt("recTaxInvoiceClearSelection", "선택 해제")}
                  </Button>
                </div>
              ) : ledgerViewMode === "paired" && hasSearchedList ? (
                <p className="text-[11px] text-muted-foreground mb-2">
                  {tt(
                    "recTaxInvoiceSwitchLedgerToSelect",
                    "여러 건 인쇄는 「전체 내역」 보기에서 출고 행을 선택합니다."
                  )}
                </p>
              ) : null}
              {ledgerSummaryMetrics}
              {canSelectStores ? (
                <p className="text-xs text-amber-900 dark:text-amber-100/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-md px-3 py-2 mb-3 leading-snug">
                  {tt(
                    "recVsPayPoHint",
                    "※ 발주(PO) 승인·매입 대금은 「미지급금(매입)」에 반영됩니다. 이 탭(미수금)은 매장·매출처 매출 회수(주문·수금)용입니다."
                  )}
                </p>
              ) : null}
              {showLedgerList && !loading && listSearchTotals.unallocatedBankSum > 0.009 ? (
                <div className="text-xs text-amber-950 dark:text-amber-50 bg-amber-50 dark:bg-amber-950/50 border border-amber-300/80 dark:border-amber-700 rounded-md px-3 py-2.5 mb-3 leading-snug space-y-1">
                  <p className="font-medium flex items-start gap-1.5">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
                    {tt(
                      "recUnallocatedBankBanner",
                      "통장 입금은 반영됐지만 인보이스 배분이 남아 있습니다. 수금확인 체크 대신 통장 거래 → 「미수 연결」을 사용하세요."
                    )}
                  </p>
                  <p className="text-muted-foreground pl-5">
                    {tt("recUnallocatedBankBannerTotal", "미할당 통장 입금 합계")}:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      ฿{listSearchTotals.unallocatedBankSum.toLocaleString()}
                    </span>
                  </p>
                </div>
              ) : null}
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
              ) : !showLedgerList ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query") || "Click Query button."}</p>
              ) : listData.length === 0 ? (
                <div className="py-8 space-y-3 text-center px-2">
                  <p className="text-sm text-muted-foreground">{t("receivableEmpty") || "No receivables found."}</p>
                  {salesOutletFilter !== "All" && canSelectStores ? (
                    <p className="text-xs text-muted-foreground max-w-lg mx-auto leading-relaxed">
                      {tt(
                        "recStoreBookEmpty",
                        "선택한 매장·거래처의 미수 잔액이 없습니다."
                      )}
                    </p>
                  ) : purchaseVendorMatchForOutlet && canSelectStores ? (
                    <>
                      <p className="text-xs text-amber-800 dark:text-amber-200 max-w-lg mx-auto leading-relaxed">
                        {tt(
                          "recEmptyMaybePoHint",
                          "선택한 매출처 이름과 같은 매입 거래처가 있으면, 발주(PO) 승인 금액은 「미지급금」에만 나타납니다. 미수금에는 주문·수금 기준 잔액만 표시됩니다."
                        )}
                      </p>
                      <Button type="button" size="sm" variant="secondary" onClick={jumpToPayableForMatchedVendor}>
                        <Building2 className="h-4 w-4 mr-1" aria-hidden />
                        {tt("recGoToPayableBtn", "미지급금(매입) 탭에서 이 거래처 조회")}
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : (
                <TabPanelHeavyContent
                  ready={contentTab === "receivable"}
                  pendingLabel={tabPanelPendingLabel}
                >
                <AdminTableScroll lockViewport={false} className="w-full">
                  {/* 헤더: 출고처, 매출금액, 수령금액, 기간 순잔액, 누적 잔액 */}
                  <div className={cn(amountGridCols, "px-4 py-2 border-b bg-muted/50 font-semibold text-sm")}>
                    <div className={ledgerSummaryHeaderCellCn}>{(t("outColStore") || "출고처")}</div>
                    <div className={cn(ledgerSummaryHeaderCellCn, "tabular-nums")}>{(t("recColSalesAmount") || "매출금액")}</div>
                    <div
                      className={cn(ledgerSummaryHeaderCellCn, "tabular-nums")}
                      title={tt("recReceiveAmountHint", "조회 기간 내 수령·통장 분개(음수) 합계. 수금확인 체크와 별도입니다.")}
                    >
                      {(t("recColReceiveAmount") || "수령금액")}
                    </div>
                    <div
                      className={cn(ledgerSummaryHeaderCellCn, "tabular-nums")}
                      title={tt("recPeriodNetHint", "매출금액 − 수령금액 (조회 기간 내 순증감)")}
                    >
                      {(t("recColRemainingReceivable") || "기간 순잔액")}
                    </div>
                    <div
                      className={cn(ledgerSummaryHeaderCellCn, "tabular-nums text-primary")}
                      title={tt(
                        "recCumulativeColHint",
                        "출고처별 종료일까지 전체 이력 합계입니다. 조회 시작일 이전 거래도 포함하며, 아래 기간 내역 합과 다를 수 있습니다."
                      )}
                    >
                      {cumulativeColLabel}
                    </div>
                  </div>
                  <Accordion type="multiple" className="w-full">
                    {listData.map((item) => {
                      const allItems = item.items ?? []
                      const displayItems = filterItemsByUnpaid(item.items, true)
                      const tableItems = filterRowsByLedgerPeriod(
                        displayItems.length > 0 ? displayItems : allItems
                      )
                      const printableKeys = printableReceivableTaxInvoiceKeys(tableItems)
                      const selectedPrintableCount = printableKeys.filter((k) =>
                        selectedTaxInvoicePrintKeys.has(k)
                      ).length
                      const allPrintableSelected =
                        printableKeys.length > 0 && selectedPrintableCount === printableKeys.length
                      const somePrintableSelected =
                        selectedPrintableCount > 0 && !allPrintableSelected
                      const period = sumReceivablePayablePeriodAmounts(allItems)
                      const receivableDatePairs = pairReceivableLedgerDates(allItems)
                      const receivableAllGroups = groupReceivableLedgerRows(allItems)
                      const receivableRowGroupMeta = buildLedgerRowGroupMeta(receivableAllGroups)
                      const receivablePairGroups = sortLedgerPairGroupsDesc(
                        filterLedgerPairGroupsForDisplay(receivableAllGroups, tableItems, filterUnpaidOnly)
                      )
                      const receivableDateLabels = {
                        sales: t("recLedgerSalesDateShort") || tt("recLedgerSalesDateShort", "매출"),
                        receive: t("recLedgerReceiveDateShort") || tt("recLedgerReceiveDateShort", "입금"),
                      }
                      const cumulativeBal = getCumulativeBalanceForItem(item)
                      const priorBal = priorCumulativeBalance(cumulativeBal, period.periodNet)
                      const priorBalanceHint = formatPriorBalanceHint(priorBal)
                      const unallocatedTotal = Number(item.unallocatedBankReceiveTotal || 0)
                      const visibleUnallocatedDeposits = filterUnallocatedBankDepositsVisible(
                        item.unallocatedBankDeposits || []
                      )
                      const visibleUnallocatedTotal = sumUnallocatedBankDeposits(visibleUnallocatedDeposits)
                      return (
                      <AccordionItem key={item.storeName!} value={item.storeName!}>
                        <AccordionTrigger className="hover:no-underline px-4 py-3 [&>svg]:ml-2 [&>svg]:shrink-0">
                          <div className={cn(amountGridCols, "flex-1 min-w-0 w-full pr-1")}>
                              <div className="flex flex-col items-start gap-0.5 min-w-0 text-left pr-2">
                                <span className="font-semibold break-words leading-snug">
                                  {formatReceivableStoreDisplay(item)}
                                </span>
                                {item.vendorCode &&
                                  formatReceivableStoreDisplay(item) !==
                                    formatVendorDisplay(item.vendorCode, item.vendorName) && (
                                  <span className="text-xs text-muted-foreground">
                                    {t("vendor") || "거래처"}:{" "}
                                    {formatVendorDisplay(item.vendorCode, item.vendorName)}
                                  </span>
                                )}
                                {visibleUnallocatedTotal > 0.009 ? (
                                  <span className="text-[10px] font-medium text-amber-800 dark:text-amber-200 leading-snug">
                                    {tt("recUnallocatedBankStoreBadge", "미할당 통장 입금")}{" "}
                                    <span className="tabular-nums">฿{visibleUnallocatedTotal.toLocaleString()}</span>
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-right tabular-nums whitespace-nowrap">{fmtBaht(period.salesSum)}</div>
                              <div className="text-right tabular-nums whitespace-nowrap">{fmtBaht(period.receiveSum)}</div>
                              <div className="text-right tabular-nums whitespace-nowrap">{fmtBaht(period.periodNet)}</div>
                              <div className="text-right tabular-nums font-bold text-primary whitespace-nowrap">
                                {cumulativeBal != null ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span>{fmtBaht(cumulativeBal)}</span>
                                    {priorBalanceHint ? (
                                      <span className="text-[10px] font-normal text-muted-foreground leading-tight">
                                        {priorBalanceHint}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  "—"
                                )}
                              </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4">
                          {visibleUnallocatedTotal > 0.009 ? (
                            <div className="mb-3 rounded-md border border-amber-200/80 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs leading-snug space-y-1.5">
                              <p className="font-semibold text-amber-950 dark:text-amber-50">
                                {tt("recUnallocatedBankStoreTitle", "미배분 통장 입금 (조회 기간과 별개)")}
                                {visibleUnallocatedDeposits.length > 0 ? (
                                  <span className="font-normal text-amber-800 dark:text-amber-200">
                                    {" · "}
                                    {tt("recUnallocatedBankCount", "{n}건").replace(
                                      "{n}",
                                      String(visibleUnallocatedDeposits.length)
                                    )}
                                  </span>
                                ) : null}
                              </p>
                              <p>
                                {tt(
                                  "recUnallocatedBankStoreHint",
                                  "매장 잔액에는 이미 반영됐지만 아래 인보이스에는 아직 배분되지 않은 입금입니다. 2026년 7월 1일 이후만 표시합니다. 최근 입금만 먼저 보이고, 이전이 있으면 「더 보기」로 펼칩니다. 버튼을 누르면 그 입금이 들어 있는 통장으로 이동합니다."
                                )}
                              </p>
                              <UnallocatedBankDepositChips
                                deposits={visibleUnallocatedDeposits}
                                tt={tt}
                                onOpen={openBankTransactionFromReceivable}
                              />
                            </div>
                          ) : null}
                          {tableItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                              {visibleUnallocatedTotal > 0.009
                                ? tt(
                                    "recLedgerNoPeriodWithUnallocated",
                                    "이 기간의 인보이스·거래는 없습니다. 위 버튼은 과거 미배분 통장 입금입니다."
                                  )
                                : ledgerNoPeriodRowsHint}
                            </p>
                          ) : ledgerViewMode === "paired" ? (
                            <ReceivablePairedLedgerList
                              groups={receivablePairGroups}
                              labels={ledgerPairLabels}
                              fmtBahtSigned={fmtBahtSigned}
                              getMemo={getMemo}
                              formatRefType={(refType) => {
                                if (refType === "Opening") return t("recTypeOpening") || "기초이월"
                                if (refType === "AccountingPO") return t("recTypeAccountingPO") || "회계발주"
                                if (refType === "ForceOutbound") return t("recTypeForceOutbound") || "강제출고"
                                if (refType === "Order") return t("recTypeOrder") || "주문"
                                if (refType === "Receive") return t("recTypeReceive") || "수령"
                                return refType || "—"
                              }}
                              formatOrderNo={(row) => resolveReceivableOrderNoDisplay(row)}
                              formatTaxInvoiceDocNo={(row) =>
                                resolveReceivableTaxInvoiceDocNoDisplay(row, taxInvoiceOverrideMap)
                              }
                            />
                          ) : (
                          <AdminTableScroll className="-mx-1 px-1 pb-1 touch-pan-x" hint={false}>
                          <table className={ledgerDetailTableCn}>
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-center py-2 px-2 w-[35px] font-semibold" aria-hidden />
                                <th className="text-center py-2 px-1 w-[36px] font-semibold">
                                  <Checkbox
                                    checked={
                                      somePrintableSelected ? "indeterminate" : allPrintableSelected
                                    }
                                    disabled={
                                      printableKeys.length === 0 || taxInvoiceLoadingKey != null
                                    }
                                    onCheckedChange={(v) => {
                                      if (printableKeys.length === 0) return
                                      toggleTaxInvoicePrintKeys(printableKeys, v === true)
                                    }}
                                    title={tt(
                                      "recTaxInvoiceSelectAllHint",
                                      "이 거래처의 출고 건을 모두 선택. 한 장으로 합치지 않습니다."
                                    )}
                                    aria-label={tt(
                                      "recTaxInvoiceSelectAllHint",
                                      "이 거래처의 출고 건을 모두 선택. 한 장으로 합치지 않습니다."
                                    )}
                                  />
                                </th>
                                <th
                                  className="text-center py-2 px-4 w-[128px] min-w-[128px] font-semibold"
                                  title={tt("recLedgerDateColHint", "위: 매출(발생)일, 아래: 입금(수령)일")}
                                >
                                  {t("recLedgerDateCol") || tt("recLedgerDateCol", "매출·입금일")}
                                </th>
                                <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("type") || "구분"}</th>
                                <th className="text-center py-2 px-3 w-[150px] min-w-[150px] font-semibold whitespace-nowrap">
                                  {tt("recColInvoiceNo", "인보이스번호")}
                                </th>
                                <th className="text-center py-2 px-3 w-[160px] min-w-[160px] font-semibold whitespace-nowrap">
                                  {tt("recColTaxInvoiceDocNo", "세금계산서번호")}
                                </th>
                                <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("recColReceiveStatus") || "수령여부"}</th>
                                <th className="text-center py-2 px-2 w-[108px] font-semibold whitespace-nowrap" title={tt("recColReceiveCheckHint", "통장 수금은 「미수 연결」로 처리합니다. 체크는 통장 없는 수금(현금 등) 또는 연동 결과 표시용입니다.")}>
                                  {t("recColReceiveCheck") || "수금확인"}
                                </th>
                                <th className="text-center py-2 px-1 w-[76px] text-sm font-bold whitespace-nowrap">
                                  {t("acct_rec_bank_link") || tt("acct_rec_bank_link", "통장")}
                                </th>
                                <th className="text-center py-2 px-1 w-[72px] text-sm font-bold whitespace-nowrap">
                                  {tt("recColTaxInvoicePrint", "인쇄")}
                                </th>
                                <th className="text-center py-2 px-4 w-[135px] font-semibold">{t("amount") || "금액"}</th>
                                <th className="text-center py-2 px-4 min-w-[150px] font-semibold">{t("memo") || "메모"}</th>
                                {showReceivableManualActions && (
                                  <th className="text-center py-2 px-1 w-[72px] font-semibold whitespace-nowrap">
                                    {t("btnEdit") || "수정"}
                                  </th>
                                )}
                                {showStorePurchaseJournalCol && (
                                  <th
                                    className="text-center py-2 px-1 w-[44px] text-sm font-bold text-muted-foreground"
                                    title={tt("recStorePurchaseJournalBtnTitle", "매장 매입 분개 (store_purchase) 조회·삭제")}
                                  >
                                    {tt("recStorePurchaseJournalColShort", "분개")}
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {tableItems.map((row) => {
                                const rowOrderId =
                                  row.ref_type === "Order" ? orderIdFromReceivableOrderRow(row) : undefined
                                const rowForceLogId =
                                  row.ref_type === "ForceOutbound"
                                    ? (() => {
                                        const n = Number(row.ref_id)
                                        return n > 0 && Number.isFinite(n) ? n : undefined
                                      })()
                                    : undefined
                                const recRowKey = transactionLineRowKey("rec", row)
                                const canExpandRecLines =
                                  (row.ref_type === "Order" &&
                                    rowOrderId != null &&
                                    row.id != null) ||
                                  (row.ref_type === "ForceOutbound" && rowForceLogId != null)
                                const isRecExpanded = expandedPayableRowId === recRowKey
                                const recLineEntry = payableItemsCache[recRowKey]
                                const recLineItems = recLineEntry?.items ?? []
                                const recOrderTotals = recLineEntry?.orderInvoiceTotals
                                const recLinesLoading = loadingItemsFor === recRowKey
                                const recLineColSpan =
                                  12 +
                                  (showReceivableManualActions ? 1 : 0) +
                                  (showStorePurchaseJournalCol ? 1 : 0)
                                const printSelectKey = receivableTaxInvoicePrintSelectionKey(row)
                                const printSource = resolveReceivableTaxInvoicePrintSource(row)
                                const canEditManualRecRow =
                                  showReceivableManualActions &&
                                  isManualReceivableBalanceRow(row) &&
                                  row.id != null &&
                                  canMutateManualReceivableBalance(
                                    auth?.role || "",
                                    auth?.store || "",
                                    item.storeName || ""
                                  )
                                const canEditReceiveCheck =
                                  (row.ref_type === "Order" || row.ref_type === "ForceOutbound" || row.ref_type === "AccountingPO") &&
                                  row.id != null &&
                                  canUpdateReceivableReceiveCheck(
                                    auth?.role || "",
                                    auth?.store || "",
                                    item.storeName || ""
                                  )
                                const orderNoDisplay = resolveReceivableOrderNoDisplay(row)
                                const taxInvoiceDocDisplay = resolveReceivableTaxInvoiceDocNoDisplay(
                                  row,
                                  taxInvoiceOverrideMap
                                )
                                const isAccrualRow = isAccrualRefType(row.ref_type, "receivable")
                                const rowAgeDays =
                                  isAccrualRow && Number(row.amount ?? 0) > 0
                                    ? agingDaysBetween(endStr, row.trans_date || endStr)
                                    : 0
                                const linkedBankTxId = (() => {
                                  const direct = Number(row.bank_transaction_id || 0)
                                  if (direct > 0) return direct
                                  if (
                                    row.id != null &&
                                    (row.ref_type === "Order" ||
                                      row.ref_type === "ForceOutbound" ||
                                      row.ref_type === "AccountingPO")
                                  ) {
                                    const recv = (item.items || []).find(
                                      (sibling) =>
                                        sibling.ref_type === "Receive" &&
                                        Number(sibling.ref_id || 0) === Number(row.id) &&
                                        Number(sibling.bank_transaction_id || 0) > 0
                                    )
                                    if (recv?.bank_transaction_id) return Number(recv.bank_transaction_id)
                                  }
                                  return 0
                                })()
                                const linkedBankAccountId = (() => {
                                  if (!linkedBankTxId) return undefined
                                  const fromRow = (item.items || []).find(
                                    (r) => Number(r.bank_transaction_id || 0) === linkedBankTxId
                                  )
                                  const rowAid = Number(fromRow?.bank_account_id || 0)
                                  if (rowAid > 0) return rowAid
                                  const dep = (item.unallocatedBankDeposits || []).find(
                                    (d) => Number(d.bankTransactionId) === linkedBankTxId
                                  )
                                  const depAid = Number(dep?.bankAccountId || 0)
                                  return depAid > 0 ? depAid : undefined
                                })()
                                const isBankHighlight = rowHighlightsBankTx(row)
                                const receiveCheckPolicy = canManuallyToggleReceivableReceiveCheck({
                                  receiveChecked: !!row.receive_checked,
                                  linkedBankTransactionId: linkedBankTxId,
                                  unallocatedBankReceiveTotal: unallocatedTotal,
                                })
                                const receiveCheckDisabled =
                                  !canEditReceiveCheck ||
                                  updatingReceiveCheckId === row.id ||
                                  !receiveCheckPolicy.allowed
                                const receiveCheckTitle =
                                  receiveCheckPolicy.reason === "bank_linked"
                                    ? tt(
                                        "recReceiveCheckBankLinkedHint",
                                        "통장 미수 연결로 수금됨 — 해제는 통장 거래에서"
                                      )
                                    : receiveCheckPolicy.reason === "unallocated_bank"
                                      ? tt(
                                          "recReceiveCheckUnallocatedHint",
                                          "미할당 통장 입금이 있습니다 — 통장 거래 → 미수 연결 사용"
                                        )
                                      : row.receive_checked
                                        ? (t("recCheckPaid") || "수금완료")
                                        : (t("recCheckWait") || "수금대기")
                                const rowPairMeta =
                                  row.id != null ? receivableRowGroupMeta.get(row.id) : undefined
                                return (
                                <React.Fragment key={row.id ?? recRowKey}>
                                <tr
                                  className={cn(
                                    "border-b border-border/50",
                                    rowAgeDays > 0 ? agingRowToneClass(rowAgeDays) : "",
                                    isBankHighlight && "bg-primary/10 ring-2 ring-inset ring-primary/50",
                                    getLedgerPairRowClass(rowPairMeta)
                                  )}
                                >
                                  <td
                                    className={cn(
                                      "py-1.5 px-2 w-[35px] text-center align-middle",
                                      canExpandRecLines && "cursor-pointer"
                                    )}
                                    onClick={() => {
                                      if (canExpandRecLines) void toggleLineItemsExpand("rec", row)
                                    }}
                                  >
                                    <div className="flex flex-col items-center gap-0.5">
                                      <LedgerPairRowBadge meta={rowPairMeta} />
                                      {canExpandRecLines ? (
                                        recLinesLoading ? (
                                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        ) : isRecExpanded ? (
                                          <ChevronDown className="h-4 w-4 mx-auto" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 mx-auto" />
                                        )
                                      ) : null}
                                    </div>
                                  </td>
                                  <td
                                    className="py-1.5 px-1 w-[36px] text-center align-middle"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {printSelectKey ? (
                                      <Checkbox
                                        checked={selectedTaxInvoicePrintKeys.has(printSelectKey)}
                                        disabled={taxInvoiceLoadingKey != null}
                                        onCheckedChange={(v) =>
                                          toggleTaxInvoicePrintKey(printSelectKey, v === true)
                                        }
                                        title={tt(
                                          "recTaxInvoiceSelectRowHint",
                                          "세금계산서 인쇄 대상 선택 (출고 1건 = 1장)"
                                        )}
                                        aria-label={tt(
                                          "recTaxInvoiceSelectRowHint",
                                          "세금계산서 인쇄 대상 선택 (출고 1건 = 1장)"
                                        )}
                                      />
                                    ) : (
                                      <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-4 w-[128px] min-w-[128px] align-top">
                                    {renderReceivableLedgerDateCell(
                                      row,
                                      row.id != null ? receivableDatePairs.get(row.id) : undefined,
                                      receivableDateLabels
                                    )}
                                    {rowAgeDays > 30 ? (
                                      <span className="mt-0.5 block text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                        {t("acct_aging_days_badge").replace("{n}", String(rowAgeDays))}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="py-1.5 px-4 w-[95px]">
                                    {row.ref_type === "Opening"
                                      ? (t("recTypeOpening") || "기초이월")
                                      : row.ref_type === "AccountingPO"
                                        ? (t("recTypeAccountingPO") || "회계발주")
                                        : row.ref_type === "ForceOutbound"
                                          ? (t("recTypeForceOutbound") || "강제출고")
                                          : row.ref_type === "Order"
                                            ? (t("recTypeOrder") || "주문")
                                            : (t("recTypeReceive") || "수령")}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-1.5 px-3 w-[150px] min-w-[150px] whitespace-nowrap",
                                      canExpandRecLines
                                        ? "text-primary cursor-pointer hover:underline font-medium"
                                        : "text-muted-foreground"
                                    )}
                                    title={
                                      canExpandRecLines
                                        ? row.ref_type === "ForceOutbound"
                                          ? t("recClickForceForLines") || tt("recClickForceForLines", "클릭하면 강제출고 품목을 펼칩니다.")
                                          : tt("recClickOrderForLines", "클릭하면 주문 품목 목록을 펼칩니다.")
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (canExpandRecLines) void toggleLineItemsExpand("rec", row)
                                    }}
                                    onKeyDown={(e) => {
                                      if (!canExpandRecLines) return
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault()
                                        void toggleLineItemsExpand("rec", row)
                                      }
                                    }}
                                    role={canExpandRecLines ? "button" : undefined}
                                    tabIndex={canExpandRecLines ? 0 : undefined}
                                  >
                                    {orderNoDisplay}
                                  </td>
                                  <td className="py-1.5 px-3 w-[160px] min-w-[160px] whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                                    {taxInvoiceDocDisplay || "—"}
                                  </td>
                                  <td className="py-1.5 px-4 w-[95px] text-center">
                                    <span className={cn(
                                      "text-sm font-medium px-2 py-0.5 rounded",
                                      row.ref_type === "Receive" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                    )}>
                                      {row.ref_type === "Receive" ? (t("recStatusReceived") || "수령") : (t("recStatusUnpaid") || "미수")}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 w-[108px] text-center align-middle">
                                    {(row.ref_type === "Order" || row.ref_type === "ForceOutbound" || row.ref_type === "AccountingPO") && row.id != null ? (
                                      <div className="flex flex-col items-end gap-0.5">
                                        <Checkbox
                                          checked={!!row.receive_checked}
                                          disabled={receiveCheckDisabled}
                                          title={receiveCheckTitle}
                                          onCheckedChange={(v) => {
                                            if (receiveCheckDisabled || !canEditReceiveCheck || row.id == null) return
                                            if (v) {
                                              openReceiveCheckDialog({
                                                receivableId: row.id,
                                                outletStoreName: item.storeName || "",
                                                invoiceLabel:
                                                  orderNoDisplay !== "-"
                                                    ? String(orderNoDisplay)
                                                    : "",
                                              })
                                              return
                                            }
                                            void handleReceiveCheckChange({
                                              receivableId: row.id,
                                              receiveChecked: false,
                                              outletStoreName: item.storeName || "",
                                            })
                                          }}
                                          className="mt-0.5"
                                        />
                                        <span className="text-[10px] text-muted-foreground leading-none text-right max-w-[96px]">
                                          {row.receive_checked
                                            ? linkedBankTxId > 0
                                              ? tt("recCheckBankLinked", "통장연동")
                                              : (t("recCheckPaid") || "완료")
                                            : receiveCheckPolicy.reason === "unallocated_bank"
                                              ? tt("recCheckUseBankLink", "미수연결")
                                              : (t("recCheckWait") || "대기")}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-1 w-[76px] text-center align-middle">
                                    {linkedBankTxId > 0 ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span
                                          className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-950/50 dark:text-green-400 whitespace-nowrap"
                                          title={t("acct_bank_receivable_linked") || tt("acct_bank_receivable_linked", "미수 연동")}
                                        >
                                          <Check className="h-3 w-3 shrink-0" aria-hidden />
                                          {t("acct_bank_receivable_linked") || tt("acct_bank_receivable_linked", "연동")}
                                        </span>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-1 text-[10px]"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            openBankTransactionFromReceivable(
                                              linkedBankTxId,
                                              row.trans_date,
                                              linkedBankAccountId
                                            )
                                          }}
                                        >
                                          #{linkedBankTxId}
                                        </Button>
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-1 w-[72px] text-center align-middle">
                                    {((row.ref_type === "Order" && rowOrderId != null) ||
                                      (row.ref_type === "ForceOutbound" && rowForceLogId != null) ||
                                      (row.ref_type === "AccountingPO" && row.ref_id != null)) ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 shrink-0"
                                        disabled={taxInvoiceLoadingKey != null}
                                        title={tt("recTaxInvoicePrintTitle", "세금계산서 인쇄")}
                                        aria-label={tt("recTaxInvoicePrintTitle", "세금계산서 인쇄")}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          void handleTaxInvoicePrint(row, item)
                                        }}
                                      >
                                        {taxInvoiceLoadingKey === printSource?.loadKey ? (
                                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        ) : (
                                          <FileText className="h-4 w-4" />
                                        )}
                                      </Button>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-4 w-[135px] text-right tabular-nums font-medium">{fmtBahtSigned(row.amount)}</td>
                                  <td className="py-1.5 px-4 min-w-[150px] text-muted-foreground">{getMemo(row.memo)}</td>
                                  {showReceivableManualActions && (
                                    <td className="py-1.5 px-1 w-[72px] text-center align-middle">
                                      {canEditManualRecRow ? (
                                        <div className="flex justify-center items-center gap-0.5">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 shrink-0"
                                            title={t("btnEdit") || "수정"}
                                            aria-label={t("btnEdit") || "수정"}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              openManualBalanceEdit("receivable", row, item.storeName || "")
                                            }}
                                          >
                                            <PencilLine className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
                                            title={t("delete") || "삭제"}
                                            aria-label={t("delete") || "삭제"}
                                            disabled={manualEditSaving}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (row.id != null) void handleManualBalanceDelete("receivable", row.id)
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">—</span>
                                      )}
                                    </td>
                                  )}
                                  {showStorePurchaseJournalCol && (
                                    <td className="py-1.5 px-1 w-[44px] text-center align-middle">
                                      {row.ref_type === "Order" && rowOrderId != null ? (
                                        <StorePurchaseJournalButton
                                          orderId={rowOrderId}
                                          invoiceLabel={orderNoDisplay !== "-" ? String(orderNoDisplay) : undefined}
                                          t={t}
                                          tt={tt}
                                        />
                                      ) : null}
                                    </td>
                                  )}
                                </tr>
                                {isRecExpanded && (
                                  <tr className="border-b border-border/50 bg-muted/10">
                                    <td colSpan={recLineColSpan} className="py-2 px-4">
                                      {recLinesLoading ? (
                                        <p className="text-sm text-muted-foreground py-2">{t("loadingItems")}</p>
                                      ) : recLineItems.length > 0 ? (
                                        <div className="ml-4 rounded border border-border/50 bg-background p-3 text-sm">
                                          <div className="mb-2 text-sm font-bold text-foreground">
                                            {t("outColItem") || "품목"}
                                          </div>
                                          <p className="mb-2 text-[11px] text-muted-foreground">
                                            {tt(
                                              "recLineItemsVatHint",
                                              "행 금액은 VAT 포함 합계입니다. 아래 품목 금액은 공급가(단가×수량)이며, 맨 아래 소계·VAT·합계로 맞춥니다."
                                            )}
                                          </p>
                                          <table className="w-full text-sm">
                                            <thead>
                                              <tr className="border-b">
                                                <th className="py-1 px-2 text-left font-medium">
                                                  {tt("balLineItemName", "품목명")}
                                                </th>
                                                <th className="py-1 px-2 text-left font-medium min-w-[72px]">
                                                  {tt("balLineItemSpec", "규격")}
                                                </th>
                                                <th className="py-1 px-2 text-center font-medium">
                                                  {tt("balLineItemQty", "수량")}
                                                </th>
                                                <th className="py-1 px-2 text-right font-medium">
                                                  {tt("balLineItemUnit", "단가")}
                                                </th>
                                                <th className="py-1 px-2 text-right font-medium">
                                                  {tt("balLineItemAmountExclVat", "공급가액")}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {recLineItems.map((it, i) => (
                                                <tr key={i} className="border-b border-border/30">
                                                  <td className="py-1 px-2">{it.name || it.code || "-"}</td>
                                                  <td className="py-1 px-2 text-left text-muted-foreground break-words max-w-[200px]">
                                                    {it.spec || "-"}
                                                  </td>
                                                  <td className="py-1 px-2 text-center tabular-nums">{it.qty}</td>
                                                  <td className="py-1 px-2 text-right tabular-nums">
                                                    {it.unitCost != null ? fmtBaht(it.unitCost) : "-"}
                                                  </td>
                                                  <td className="py-1 px-2 text-right tabular-nums font-medium">
                                                    {fmtBaht(it.amount ?? 0)}
                                                  </td>
                                                </tr>
                                              ))}
                                              {recOrderTotals ? (
                                                <>
                                                  <tr className="border-t-2 border-border/50 bg-muted/20">
                                                    <td
                                                      colSpan={4}
                                                      className="py-1.5 px-2 text-right text-muted-foreground"
                                                    >
                                                      {tt("recLineSubtotal", "소계 (공급가)")}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right tabular-nums font-medium">
                                                      {fmtBaht(recOrderTotals.subtotalRounded)}
                                                    </td>
                                                  </tr>
                                                  <tr className="bg-muted/20">
                                                    <td
                                                      colSpan={4}
                                                      className="py-1.5 px-2 text-right text-muted-foreground"
                                                    >
                                                      {tt("recLineVat7", "VAT 7%")}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right tabular-nums">
                                                      {fmtBaht(recOrderTotals.vatRounded)}
                                                    </td>
                                                  </tr>
                                                  <tr className="bg-muted/20">
                                                    <td
                                                      colSpan={4}
                                                      className="py-1.5 px-2 text-right font-semibold"
                                                    >
                                                      {tt("recLineGrandTotal", "합계 (VAT 포함 · 미수 금액과 동일 규칙)")}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right tabular-nums font-bold">
                                                      {fmtBaht(recOrderTotals.grandTotal)}
                                                    </td>
                                                  </tr>
                                                </>
                                              ) : null}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-xs text-muted-foreground py-2">
                                          {tt("balLineItemsEmpty", "조회된 품목이 없습니다.")}
                                        </p>
                                      )}
                                    </td>
                                  </tr>
                                )}
                                </React.Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                          </AdminTableScroll>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                      )
                    })}
                  </Accordion>
                  {listSearchTotals.count > 0 ? (
                    <div className={cn(amountGridCols, "px-4 py-3 border-t bg-muted/40 font-semibold text-sm")}>
                      <div className="text-right">{t("recSearchTotalLabel") || tt("recSearchTotalLabel", "합계")}</div>
                      <div className="text-right tabular-nums">{fmtBaht(listSearchTotals.accrualSum)}</div>
                      <div className="text-right tabular-nums">{fmtBaht(listSearchTotals.settlementSum)}</div>
                      <div className="text-right tabular-nums font-semibold">
                        {fmtBaht(listSearchTotals.balanceSum)}
                      </div>
                      <div className="text-right tabular-nums font-bold text-primary">
                        {fmtBaht(listSearchTotals.cumulativeSum || cumulativeSummary.totalAmount)}
                      </div>
                    </div>
                  ) : null}
                </AdminTableScroll>
                </TabPanelHeavyContent>
              )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  )
}
