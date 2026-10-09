"use client"

import { TabsContent } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { adminTabsContentCn } from "@/lib/admin-tab-styles"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronRight, FileSpreadsheet, Link2, PencilLine, Printer, Search, Trash2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { renderPayableLedgerDateCell, TabPanelHeavyContent } from "./receivable-payable-ledger-parts"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  buildLedgerRowGroupMeta,
  filterLedgerPairGroupsForDisplay,
  ledgerAccrualStatusById,
  pairPayableLedgerDates,
  payableLineSettlementKind,
  priorCumulativeBalance,
  sortLedgerPairGroupsDesc,
  sumReceivablePayablePeriodAmounts,
} from "@/lib/receivable-payable-period-totals"
import {
  groupPayableLedgerRowsWithLinks,
  isPayableLinkableAccrualRow,
  isPayableLinkablePaymentRow,
  payableRowLinkStatus,
} from "@/lib/payable-settlement-link"
import {
  fmtBaht,
  fmtBahtSigned,
  type LineItemsCacheEntry,
  transactionLineRowKey,
} from "./receivable-payable-tab-utils"
import { LedgerPairRowBadge, PayablePairedLedgerList } from "@/components/tabs/receivable-payable-paired-ledger"
import { isManualPayableBalanceRow } from "@/lib/manual-balance-transaction"
import { canMutateManualPayableBalance } from "@/lib/permissions"
import { agingDaysBetween, agingRowToneClass, isAccrualRefType } from "@/lib/receivable-aging"
import * as React from "react"
import { getLedgerPairRowClass } from "@/lib/receivable-payable-ledger-pair-styles"
import type { ReceivablePayableItem } from "@/lib/api-client"
import type { AuthState } from "@/lib/auth-context"

export type ReceivablePayablePayablePanelProps = {
  amountGridCols: "grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(6rem,1fr))] gap-x-2 sm:gap-x-3 gap-y-1 items-center w-full min-w-0"
  auth: AuthState | null
  canSelectStores: boolean
  contentTab: "receivable" | "payable" | "borrowings"
  cumulativeColLabel: string
  cumulativeSummary: { totalAmount: number; byKey: Record<string, number>; }
  endStr: string
  expandedPayableRowId: string | null
  filterItemsByUnpaid: <T extends { ref_type?: string; }>(items: T[] | undefined, isRec: boolean) => T[]
  filterRowsByLedgerPeriod: <T extends { trans_date?: string; }>(items: T[]) => T[]
  filterUnpaidOnly: boolean
  formatAttributedStoreLabel: (raw: string | undefined | null) => string
  formatPayableRefTypeLabel: (refType?: string) => string
  formatPriorBalanceHint: (prior: number | undefined) => string | null
  formatStoreLabel: (code: string) => string
  formatVendorDisplay: (vendorCode?: string, knownName?: string | null) => string
  getCumulativeBalanceForItem: (item: ReceivablePayableItem) => number | undefined
  getMemo: (memo: string | undefined) => string
  handleExcel: () => void
  handleLoadList: () => void
  handleManualBalanceDelete: (ledger: "receivable" | "payable", id: number) => Promise<void>
  handlePrint: () => void
  invoiceSearch: string
  isManager: boolean
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
  openManualBalanceEdit: (ledger: "receivable" | "payable", row: NonNullable<ReceivablePayableItem["items"]>[number], entity: string) => void
  payableItemsCache: Record<string, LineItemsCacheEntry>
  payableStoreFilter: string
  setEndStr: React.Dispatch<React.SetStateAction<string>>
  setFilterUnpaidOnly: React.Dispatch<React.SetStateAction<boolean>>
  setInvoiceSearch: React.Dispatch<React.SetStateAction<string>>
  setPayableLinkDialog: React.Dispatch<React.SetStateAction<{ vendorCode: string; vendorLabel: string; items: ReceivablePayableItem["items"]; settlementLinks?: { paymentId: number; accrualId: number; }[]; anchorRow: ReceivablePayableItem["items"][number]; } | null>>
  setPayableStoreFilter: React.Dispatch<React.SetStateAction<string>>
  setStartStr: React.Dispatch<React.SetStateAction<string>>
  setVendorFilter: React.Dispatch<React.SetStateAction<string>>
  showLedgerList: boolean
  showPayableLinkActions: boolean
  showPayableManualActions: boolean
  startStr: string
  storeList: string[]
  t: (k: string) => string
  tab: "receivable" | "payable" | "borrowings"
  tabPanelPendingLabel: string
  toggleLineItemsExpand: (mode: "pay" | "rec", row: { id?: number; ref_type?: string; ref_id?: number; invoice_no?: string; memo?: string; }) => Promise<void>
  tt: (key: string, fallback: string) => string
  vendorFilter: string
  vendors: { code: string; name: string; bankAccountNo?: string | null; }[]
}

export function ReceivablePayablePayablePanel({
  amountGridCols,
  auth,
  canSelectStores,
  contentTab,
  cumulativeColLabel,
  cumulativeSummary,
  endStr,
  expandedPayableRowId,
  filterItemsByUnpaid,
  filterRowsByLedgerPeriod,
  filterUnpaidOnly,
  formatAttributedStoreLabel,
  formatPayableRefTypeLabel,
  formatPriorBalanceHint,
  formatStoreLabel,
  formatVendorDisplay,
  getCumulativeBalanceForItem,
  getMemo,
  handleExcel,
  handleLoadList,
  handleManualBalanceDelete,
  handlePrint,
  invoiceSearch,
  isManager,
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
  openManualBalanceEdit,
  payableItemsCache,
  payableStoreFilter,
  setEndStr,
  setFilterUnpaidOnly,
  setInvoiceSearch,
  setPayableLinkDialog,
  setPayableStoreFilter,
  setStartStr,
  setVendorFilter,
  showLedgerList,
  showPayableLinkActions,
  showPayableManualActions,
  startStr,
  storeList,
  t,
  tab,
  tabPanelPendingLabel,
  toggleLineItemsExpand,
  tt,
  vendorFilter,
  vendors,
}: ReceivablePayablePayablePanelProps) {
  return (
    <TabsContent value="payable" className={cn(adminTabsContentCn, "space-y-4")}>
      <Card>
        <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-3 mb-4">
                {/* 미지급금: 매장 선택 (본사 회계용) + 매입처 */}
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">{(t("recFilterStoreSelect") || "매장 선택")}</label>
                  <Select
                    value={payableStoreFilter}
                    onValueChange={setPayableStoreFilter}
                    disabled={!canSelectStores && isManager && !!managerStore}
                  >
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder={t("recFilterStoreSelect") || "매장 선택"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(canSelectStores || !managerStore) && (
                        <SelectItem value="All">{(t("recFilterStoreAll") || "전체 매장")}</SelectItem>
                      )}
                      {(storeList || []).map((s) => (
                        <SelectItem key={s} value={s}>{formatStoreLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-muted-foreground">{(t("vendor") || "매입처")}</label>
                  <Select value={vendorFilter} onValueChange={setVendorFilter}>
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder={t("vendor") || "거래처"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">{t("outFilterStoreAll") || "전체"}</SelectItem>
                      {vendors.map((v) => (
                        <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {tab === "payable" && vendorFilter && vendorFilter !== "All" && (
                  <div className="flex items-center text-sm text-muted-foreground h-9">
                    {t("inv_account_no") || "계좌"}: {vendors.find((v) => v.code === vendorFilter)?.bankAccountNo || "—"}
                  </div>
                )}
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
                  {t("payFilterUnpaidOnly") || "미지급만"}
                </label>
                {ledgerViewModeSelect}
                <Button size="sm" onClick={handleLoadList} disabled={loading} className="h-9">
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
              {ledgerSummaryMetrics}
              <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                {tt(
                  "payLedgerHint",
                  "※ 매입채무는 입고 시 발생하고, 실제 지급은 「지급」 구분 행(통장 매입대금·지급예정 집행)으로 차감됩니다. 인보이스 열은 부가세(ภ.พ.30) 참고용입니다."
                )}
                {showPayableLinkActions ? (
                  <span className="block mt-1">
                    {tt(
                      "payLedgerLinkHint",
                      "입고·지급 금액이 나뉜 경우 행 오른쪽 「연결」로 짝짓기(완결 표시)를 맞출 수 있습니다. 잔액 합계는 변하지 않습니다."
                    )}
                  </span>
                ) : null}
              </p>
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
              ) : !showLedgerList ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query") || "검색 버튼을 눌러 주세요."}</p>
              ) : listData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("payableEmpty") || "조회된 미지급금이 없습니다."}</p>
              ) : (
                <TabPanelHeavyContent
                  ready={contentTab === "payable"}
                  pendingLabel={tabPanelPendingLabel}
                >
                <AdminTableScroll lockViewport={false} className="w-full">
                  {/* 헤더: 매입처, 매입금액, 지급금액, 기간 순잔액, 누적 잔액 */}
                  <div className={cn(amountGridCols, "px-4 py-2 border-b bg-muted/50 font-semibold text-sm")}>
                    <div className={ledgerSummaryHeaderCellCn}>{(t("vendor") || "매입처")}</div>
                    <div className={cn(ledgerSummaryHeaderCellCn, "tabular-nums")}>{(t("payColPurchaseAmount") || "매입금액")}</div>
                    <div className={cn(ledgerSummaryHeaderCellCn, "tabular-nums")}>{(t("payColPaymentAmount") || "지급금액")}</div>
                    <div
                      className={cn(ledgerSummaryHeaderCellCn, "tabular-nums")}
                      title={tt("payPeriodNetHint", "매입금액 − 지급금액 (조회 기간 내 순증감)")}
                    >
                      {(t("payColRemainingPayable") || "기간 순잔액")}
                    </div>
                    <div
                      className={cn(ledgerSummaryHeaderCellCn, "tabular-nums text-primary")}
                      title={tt(
                        "payCumulativeColHint",
                        "매입처별 종료일까지 전체 이력 합계입니다. 조회 시작일 이전 거래도 포함하며, 아래 기간 내역 합과 다를 수 있습니다."
                      )}
                    >
                      {cumulativeColLabel}
                    </div>
                  </div>
                  <Accordion type="multiple" className="w-full">
                    {listData.map((item) => {
                      const allItems = item.items ?? []
                      const displayItems = filterItemsByUnpaid(item.items, false)
                      const tableItems = filterRowsByLedgerPeriod(
                        displayItems.length > 0 ? displayItems : allItems
                      )
                      const period = sumReceivablePayablePeriodAmounts(allItems)
                      const payableDatePairs = pairPayableLedgerDates(allItems)
                      const payableSettlementLinkRows = (item.settlementLinks ?? []).map((l) => ({
                        payment_id: l.paymentId,
                        accrual_id: l.accrualId,
                      }))
                      const payableAllGroups = groupPayableLedgerRowsWithLinks(allItems, payableSettlementLinkRows)
                      const payableAccrualStatus = ledgerAccrualStatusById(payableAllGroups)
                      const payableRowGroupMeta = buildLedgerRowGroupMeta(payableAllGroups)
                      const payablePairGroups = sortLedgerPairGroupsDesc(
                        filterLedgerPairGroupsForDisplay(payableAllGroups, tableItems, filterUnpaidOnly)
                      )
                      const payableDateLabels = {
                        purchase: t("payLedgerPurchaseDateShort") || tt("payLedgerPurchaseDateShort", "매입"),
                        payment: t("payLedgerPaymentDateShort") || tt("payLedgerPaymentDateShort", "지급"),
                      }
                      const cumulativeBal = getCumulativeBalanceForItem(item)
                      const priorBal = priorCumulativeBalance(cumulativeBal, period.periodNet)
                      const priorBalanceHint = formatPriorBalanceHint(priorBal)
                      return (
                      <AccordionItem key={item.vendorCode!} value={item.vendorCode!}>
                        <AccordionTrigger className="hover:no-underline px-4 py-3 [&>svg]:ml-2 [&>svg]:shrink-0">
                          <div className={cn(amountGridCols, "flex-1 min-w-0 w-full pr-1")}>
                              <div className="flex flex-col items-start gap-0.5 min-w-0 text-left pr-2">
                                <span className="font-semibold break-words leading-snug">
                                  {formatVendorDisplay(item.vendorCode, item.vendorName)}
                                </span>
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
                          {tableItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">{ledgerNoPeriodRowsHint}</p>
                          ) : ledgerViewMode === "paired" ? (
                            <PayablePairedLedgerList
                              groups={payablePairGroups}
                              labels={ledgerPairLabels}
                              fmtBahtSigned={fmtBahtSigned}
                              getMemo={getMemo}
                              formatRefType={formatPayableRefTypeLabel}
                              formatStore={formatAttributedStoreLabel}
                              formatInvoiceCell={(row) =>
                                row.ref_type === "Inbound" || row.ref_type === "PO" ? (
                                  row.invoice_received ? (
                                    <span className="text-green-700 dark:text-green-400">
                                      ✓{" "}
                                      {row.invoice_no
                                        ? String(row.invoice_no).slice(0, 12) +
                                          (String(row.invoice_no).length > 12 ? "…" : "")
                                        : t("poInvoiceReceived") || "수령"}
                                    </span>
                                  ) : (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      {t("poInvoiceNotReceived") || "미수령"}
                                    </span>
                                  )
                                ) : (
                                  "—"
                                )
                              }
                            />
                          ) : (
                          <AdminTableScroll className="-mx-1 px-1 pb-1 touch-pan-x" hint={false}>
                          <table className={ledgerDetailTableCn}>
                            <thead>
                              <tr className="border-b bg-muted/50">
                                <th className="text-center py-2 px-4 w-[35px] font-semibold"></th>
                                <th
                                  className="text-center py-2 px-4 w-[128px] min-w-[128px] font-semibold"
                                  title={tt("payLedgerDateColHint", "위: 매입(발생)일, 아래: 지급일")}
                                >
                                  {t("payLedgerDateCol") || tt("payLedgerDateCol", "매입·지급일")}
                                </th>
                                <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("type") || "구분"}</th>
                                <th className="text-center py-2 px-4 w-[100px] font-semibold" title={t("payColInvoiceVat") || tt("payColInvoiceVat", "인보이스(부가세)")}>
                                  {t("payColInvoiceVat") || tt("payColInvoiceVat", "인보이스(부가세)")}
                                </th>
                                <th className="text-center py-2 px-4 w-[92px] font-semibold whitespace-nowrap">
                                  {t("payColAttributedStore") || tt("payColAttributedStore", "귀속 매장")}
                                </th>
                                <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("payColPaymentStatus") || "지급여부"}</th>
                                <th className="text-center py-2 px-4 w-[135px] font-semibold">{t("amount") || "금액"}</th>
                                <th className="text-center py-2 px-4 min-w-[150px] font-semibold">{t("memo") || "메모"}</th>
                                {showPayableManualActions && (
                                  <th className="text-center py-2 px-1 w-[72px] font-semibold whitespace-nowrap">
                                    {showPayableLinkActions
                                      ? tt("paySettlementLinkCol", "연결")
                                      : t("btnEdit") || "수정"}
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {tableItems.map((row) => {
                                const rowKey = transactionLineRowKey("pay", row)
                                const canExpand = (row.ref_type === "Inbound" || row.ref_type === "PO") && row.ref_id
                                const isExpanded = expandedPayableRowId === rowKey
                                const payLineEntry = payableItemsCache[rowKey]
                                const items = payLineEntry?.items ?? []
                                const isLoading = loadingItemsFor === rowKey
                                const canEditManualPayRow =
                                  showPayableManualActions &&
                                  isManualPayableBalanceRow(row) &&
                                  row.id != null &&
                                  canMutateManualPayableBalance(auth?.role || "")
                                const isPayAccrualRow = isAccrualRefType(row.ref_type, "payable")
                                const payRowAgeDays =
                                  isPayAccrualRow && Number(row.amount ?? 0) > 0
                                    ? agingDaysBetween(endStr, row.trans_date || endStr)
                                    : 0
                                const canLinkPayRow =
                                  showPayableLinkActions &&
                                  row.id != null &&
                                  (isPayableLinkableAccrualRow(row) || isPayableLinkablePaymentRow(row))
                                const payRowLinkStatus =
                                  row.id != null ? payableRowLinkStatus(row.id, payableSettlementLinkRows) : "open"
                                const rowPairMeta = row.id != null ? payableRowGroupMeta.get(row.id) : undefined
                                const payKind = payableLineSettlementKind(row, payableAccrualStatus)
                                return (
                                  <React.Fragment key={row.id ?? rowKey}>
                                    <tr
                                      className={cn(
                                        "border-b border-border/50",
                                        payRowAgeDays > 0 ? agingRowToneClass(payRowAgeDays) : "",
                                        getLedgerPairRowClass(rowPairMeta)
                                      )}
                                    >
                                      <td
                                        className={cn(
                                          "py-1.5 px-4 w-[35px] text-center",
                                          canExpand && "cursor-pointer hover:bg-muted/20"
                                        )}
                                        onClick={() => {
                                          if (canExpand) void toggleLineItemsExpand("pay", row)
                                        }}
                                      >
                                        <div className="flex flex-col items-center gap-0.5">
                                          <LedgerPairRowBadge meta={rowPairMeta} />
                                          {canExpand ? (
                                            isLoading ? (
                                              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            ) : (
                                              isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                            )
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="py-1.5 px-4 w-[128px] min-w-[128px] align-top">
                                        {renderPayableLedgerDateCell(
                                          row,
                                          row.id != null ? payableDatePairs.get(row.id) : undefined,
                                          payableDateLabels
                                        )}
                                        {payRowAgeDays > 30 ? (
                                          <span className="mt-0.5 block text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                            {t("acct_aging_days_badge").replace("{n}", String(payRowAgeDays))}
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="py-1.5 px-4 w-[95px]">{formatPayableRefTypeLabel(row.ref_type)}</td>
                                      <td
                                        className={cn(
                                          "py-1.5 px-4 w-[100px] text-center",
                                          canExpand && "cursor-pointer hover:bg-muted/20 text-primary font-medium hover:underline"
                                        )}
                                        title={
                                          canExpand
                                            ? t("payClickInvoiceForLines") || tt("payClickInvoiceForLines", "클릭하면 입고·발주 품목 목록을 펼칩니다.")
                                            : row.invoice_no || undefined
                                        }
                                        onClick={() => {
                                          if (canExpand) void toggleLineItemsExpand("pay", row)
                                        }}
                                        onKeyDown={(e) => {
                                          if (!canExpand) return
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault()
                                            void toggleLineItemsExpand("pay", row)
                                          }
                                        }}
                                        role={canExpand ? "button" : undefined}
                                        tabIndex={canExpand ? 0 : undefined}
                                      >
                                        {(row.ref_type === "Inbound" || row.ref_type === "PO") ? (
                                          row.invoice_received ? (
                                            <span className="text-sm text-green-700 dark:text-green-400" title={row.invoice_no || ""}>
                                              ✓ {row.invoice_no ? String(row.invoice_no).slice(0, 12) + (String(row.invoice_no).length > 12 ? "…" : "") : (t("poInvoiceReceived") || "수령")}
                                            </span>
                                          ) : (
                                            <span className="text-sm text-amber-700 dark:text-amber-400">{t("poInvoiceNotReceived") || "미수령"}</span>
                                          )
                                        ) : "-"}
                                      </td>
                                      <td className="py-1.5 px-4 w-[92px] text-center text-muted-foreground text-sm whitespace-nowrap">
                                        {formatAttributedStoreLabel((row as { attributed_store?: string }).attributed_store)}
                                      </td>
                                      <td className="py-1.5 px-4 w-[95px] text-center">
                                        <span className={cn(
                                          "text-sm font-medium px-2 py-0.5 rounded",
                                          payKind === "withholding"
                                            ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                                            : payKind === "paid"
                                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                              : payKind === "partial"
                                                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                        )}>
                                          {payKind === "withholding"
                                            ? (t("payStatusWithholding") || "원천세")
                                            : payKind === "paid"
                                              ? (t("payStatusPaid") || "지급")
                                              : payKind === "partial"
                                                ? (t("payStatusPartial") || "일부지급")
                                                : (t("payStatusUnpaid") || "미지급")}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-4 w-[135px] text-right tabular-nums font-medium">{fmtBahtSigned(row.amount)}</td>
                                      <td className="py-1.5 px-4 min-w-[150px] text-muted-foreground">{getMemo(row.memo)}</td>
                                      {showPayableManualActions && (
                                        <td className="py-1.5 px-1 w-[72px] text-center align-middle">
                                          <div className="flex justify-center items-center gap-0.5">
                                            {canLinkPayRow ? (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                  "h-8 w-8 p-0 shrink-0",
                                                  payRowLinkStatus === "linked" && "text-green-700 dark:text-green-400"
                                                )}
                                                title={
                                                  payRowLinkStatus === "linked"
                                                    ? tt("paySettlementLinked", "연결됨 — 클릭하여 보기/해제")
                                                    : tt("paySettlementLinkAction", "매입·지급 연결")
                                                }
                                                aria-label={tt("paySettlementLinkAction", "매입·지급 연결")}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setPayableLinkDialog({
                                                    vendorCode: item.vendorCode || "",
                                                    vendorLabel: formatVendorDisplay(item.vendorCode, item.vendorName),
                                                    items: allItems,
                                                    settlementLinks: item.settlementLinks,
                                                    anchorRow: row,
                                                  })
                                                }}
                                              >
                                                <Link2 className="h-4 w-4" />
                                              </Button>
                                            ) : null}
                                            {canEditManualPayRow ? (
                                              <>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 w-8 p-0 shrink-0"
                                                  title={t("btnEdit") || "수정"}
                                                  aria-label={t("btnEdit") || "수정"}
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    openManualBalanceEdit("payable", row, item.vendorCode || "")
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
                                                    if (row.id != null) void handleManualBalanceDelete("payable", row.id)
                                                  }}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </>
                                            ) : !canLinkPayRow ? (
                                              <span className="text-muted-foreground text-xs">—</span>
                                            ) : null}
                                          </div>
                                        </td>
                                      )}
                                    </tr>
                                    {isExpanded && (
                                      <tr className="border-b border-border/50 bg-muted/10">
                                        <td colSpan={showPayableManualActions ? 9 : 8} className="py-2 px-4">
                                          {isLoading ? (
                                            <p className="text-sm text-muted-foreground py-2">{t("loadingItems")}</p>
                                          ) : items.length > 0 ? (
                                            <div className="ml-4 rounded border border-border/50 bg-background p-3 text-sm">
                                              <div className="mb-2 text-sm font-bold text-foreground">{t("outColItem") || "품목"}</div>
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
                                                    <th className="py-1 px-2 text-right font-medium">{t("amount") || "금액"}</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {items.map((it, i) => (
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
                      <div className="text-right">{t("paySearchTotalLabel") || tt("paySearchTotalLabel", "합계")}</div>
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
        </CardContent>
      </Card>
    </TabsContent>
  )
}
