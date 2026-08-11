"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"
import { buildErpExcelHtmlDocument, erpExcelSimpleTableStyle, triggerErpExcelHtmlDownload } from "@/lib/erp-excel-export"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, Plus, Wallet, Building2, Printer, FileSpreadsheet, ChevronDown, ChevronRight, FileText, PencilLine, Trash2, Check, AlertCircle, Link2 } from "lucide-react"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { ReceivableAgingPanel } from "@/components/admin/receivable-aging-panel"
import {
  agingDaysBetween,
  agingRowToneClass,
  computeLedgerAging,
  isAccrualRefType,
} from "@/lib/receivable-aging"
import {
  priorCumulativeBalance,
  sumReceivablePayablePeriodAmounts,
  pairReceivableLedgerDates,
  pairPayableLedgerDates,
  groupReceivableLedgerRows,
  buildLedgerRowGroupMeta,
  filterLedgerPairGroupsForDisplay,
  sortLedgerPairGroupsDesc,
  type ReceivableLedgerDatePair,
  type PayableLedgerDatePair,
} from "@/lib/receivable-payable-period-totals"
import { getLedgerPairRowClass } from "@/lib/receivable-payable-ledger-pair-styles"
import {
  ReceivablePairedLedgerList,
  PayablePairedLedgerList,
  LedgerPairRowBadge,
} from "@/components/tabs/receivable-payable-paired-ledger"
import { PayableSettlementLinkDialog } from "@/components/tabs/payable-settlement-link-dialog"
import {
  groupPayableLedgerRowsWithLinks,
  isPayableLinkableAccrualRow,
  isPayableLinkablePaymentRow,
  payableRowLinkStatus,
} from "@/lib/payable-settlement-link"
import { canManuallyToggleReceivableReceiveCheck } from "@/lib/receivable-unallocated-bank"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useErpAllowUrlSync, useErpPageActiveRef, useErpRefetchOnActivate } from "@/lib/erp-page-visibility"
import {
  isManagerOrFranchiseeRole,
  isManagerRole,
  canManageReceivablePayableAllStores,
  canUpdateReceivableReceiveCheck,
  canMutateManualReceivableBalance,
  canMutateManualPayableBalance,
  canDeleteStorePurchaseJournal,
} from "@/lib/permissions"
import {
  isManualPayableBalanceRow,
  isManualReceivableBalanceRow,
} from "@/lib/manual-balance-transaction"
import { cn } from "@/lib/utils"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { getVendorsForPurchase, getVendorsForSales } from "@/lib/api-client"
import {
  getReceivablePayableList,
  getReceivablePayableSummary,
  getPayableTransactionItems,
  getInvoiceData,
  getInvoiceOrderBillToCandidates,
  getInvoiceSettings,
  addBalanceTransaction,
  updateManualBalanceTransaction,
  deleteManualBalanceTransaction,
  updateReceivableReceiveCheck,
  translateTexts,
  invalidateReceivablePayableListCache,
  getTaxInvoiceDepositSeq,
  getInvoicePrintOverrides,
  type ReceivablePayableItem,
  type PayableTransactionItem,
  type OrderInvoiceTotals,
} from "@/lib/api-client"
import { buildThaiSalesInvoiceData } from "@/lib/thai-sales-invoice-data"
import { roundMoney2 } from "@/lib/invoice-vat-total"
import { formatMoneyBaht } from "@/lib/money-amount"
import { resolveInvoiceClientForTarget, resolveInvoiceClientFromBillToCandidates } from "@/lib/invoice-client-resolve"
import type { InvoiceData } from "@/components/invoice"
import type { InvoiceDataClient } from "@/lib/api-client"
import { StorePurchaseJournalButton } from "@/components/erp/store-purchase-journal-dialog"
import { useSearchParams, useRouter } from "next/navigation"
import { useErpTabActive } from "@/lib/erp-page-visibility"

import { orderIdFromReceivableOrderRow } from "@/lib/receivable-order-id-parse"
import { canonicalOfficeStore } from "@/lib/office-store-canonical"
import {
  type LineItemsCacheEntry,
  type ReceivablePayableListLoadOverrides,
  type ReceivablePayableQueryDraft,
  bangkokTodayStr,
  fmtBaht,
  fmtBahtSigned,
  buildClientFromPosTaxMemo,
  cumulativeBalanceKey,
  buildCumulativeByKey,
  mergeReceivablePayableCumulativeByKey,
  resolveEffectivePayableStoreFilter,
  isOfficeLikeLabel,
  clientHasBillToAddress,
  resolveTaxInvoiceClientFromPoBillTo,
} from "./receivable-payable-tab-utils"
import { subscribeReceivablePayableListInvalidated, publishReceivablePayableListInvalidated } from "@/lib/receivable-payable-list-sync"
import { buildTaxInvoiceDocNo, isTaxInvoiceDocumentNo, normalizeTaxInvoiceReferenceNo } from "@/lib/tax-invoice-doc-no"
import { resolveReceivableOrderNoDisplay, resolveReceivableTaxInvoiceDocNoDisplay } from "@/lib/receivable-invoice-format"

function renderReceivableLedgerDateCell(
  row: { ref_type?: string; trans_date?: string; amount?: number },
  pair: ReceivableLedgerDatePair | undefined,
  labels: { sales: string; receive: string }
) {
  const fallback = String(row.trans_date || "").trim().slice(0, 10)
  const salesDate = pair?.salesDate || fallback
  const receiveDate = pair?.receiveDate
  if (salesDate && receiveDate && salesDate !== receiveDate) {
    return (
      <div className="flex flex-col items-start gap-0.5 leading-tight">
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.sales}</span> {salesDate}
        </span>
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.receive}</span> {receiveDate}
        </span>
      </div>
    )
  }
  return <span className="tabular-nums">{salesDate || receiveDate || fallback || "-"}</span>
}

function renderPayableLedgerDateCell(
  row: { ref_type?: string; trans_date?: string; amount?: number },
  pair: PayableLedgerDatePair | undefined,
  labels: { purchase: string; payment: string }
) {
  const fallback = String(row.trans_date || "").trim().slice(0, 10)
  const purchaseDate = pair?.purchaseDate || fallback
  const paymentDate = pair?.paymentDate
  if (purchaseDate && paymentDate && purchaseDate !== paymentDate) {
    return (
      <div className="flex flex-col items-start gap-0.5 leading-tight">
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.purchase}</span> {purchaseDate}
        </span>
        <span className="tabular-nums text-sm whitespace-nowrap">
          <span className="text-muted-foreground">{labels.payment}</span> {paymentDate}
        </span>
      </div>
    )
  }
  return <span className="tabular-nums">{purchaseDate || paymentDate || fallback || "-"}</span>
}

/** forceMount 탭에서 비활성 패널·전환 중 무거운 원장 목록 렌더를 건너뜀 (INP) */
function TabPanelHeavyContent({
  ready,
  pendingLabel,
  children,
}: {
  ready: boolean
  pendingLabel: string
  children: React.ReactNode
}) {
  const tabActive = useErpTabActive()
  if (!tabActive) return null
  if (!ready) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{pendingLabel}</p>
  }
  return <>{children}</>
}

export function ReceivablePayableTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { auth } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const allowReceivableUrlSync = useErpAllowUrlSync("/admin/receivable-payable")
  const pageActiveRef = useErpPageActiveRef()
  const { posStores: storeList, formatStoreLabel, resolveStoreKey } = useStoreList()
  const formatAttributedStoreLabel = React.useCallback(
    (raw: string | undefined | null) => {
      const v = String(raw || "").trim()
      if (!v) return "—"
      const officeCanon = canonicalOfficeStore(v)
      const resolved = formatStoreLabel(resolveStoreKey(officeCanon))
      return resolved || officeCanon || v
    },
    [formatStoreLabel, resolveStoreKey]
  )
  const [vendors, setVendors] = React.useState<{ code: string; name: string; bankAccountNo?: string | null }[]>([])

  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const isManagerOnly = isManagerRole(auth?.role || "") // 매장 매니저: 수령 입력 불가
  const managerStore = (auth?.store || "").trim()
  /** 본사/회계직원: 매장별 선택해서 관리 가능 (별도 로그인 불필요) */
  const canSelectStores = canManageReceivablePayableAllStores(auth?.role || "")
  const showStorePurchaseJournalCol = canDeleteStorePurchaseJournal(auth?.role || "")

  const [tab, setTab] = React.useState<"receivable" | "payable">("receivable")
  const [tabUi, setTabUi] = React.useState<"receivable" | "payable">("receivable")
  const [, startTabTransition] = React.useTransition()
  const contentTab = React.useDeferredValue(tab)
  const applyTab = React.useCallback((next: "receivable" | "payable") => {
    setTabUi(next)
    startTabTransition(() => {
      setTab(next)
    })
  }, [])
  React.useEffect(() => {
    setTabUi(tab)
  }, [tab])
  // 미수금: 매출처만 (매장은 미수금 없음 - 본사가 매출처에게 받을 돈)
  const [salesOutletFilter, setSalesOutletFilter] = React.useState("All")
  const [salesOutletOptions, setSalesOutletOptions] = React.useState<{ code: string; name: string }[]>([])
  // 미지급금: 매장 선택 + 매입처. 본사/회계직원은 매장 선택, 매니저는 자기 매장 고정
  const [payableStoreFilter, setPayableStoreFilter] = React.useState(() =>
    !canSelectStores && isManager && managerStore ? managerStore : "All"
  )
  const [vendorFilter, setVendorFilter] = React.useState("All")
  // API용: receivable=매출처, payable=매장
  const recStoreFilter = salesOutletFilter !== "All" ? salesOutletFilter : "All"
  const payStoreFilter = payableStoreFilter !== "All" ? payableStoreFilter : "All"
  const storeFilter = tab === "receivable" ? recStoreFilter : payStoreFilter
  const [startStr, setStartStr] = React.useState(bangkokTodayStr)
  const [endStr, setEndStr] = React.useState(bangkokTodayStr)
  const [invoiceSearch, setInvoiceSearch] = React.useState("")
  const invoiceFilterActive = invoiceSearch.trim().length > 0
  const [listData, setListData] = React.useState<ReceivablePayableItem[]>([])
  const [taxInvoiceOverrideMap, setTaxInvoiceOverrideMap] = React.useState<
    Record<string, { documentNo?: string }>
  >({})
  const [cumulativeSummary, setCumulativeSummary] = React.useState<{ totalAmount: number; byKey: Record<string, number> }>({
    totalAmount: 0,
    byKey: {},
  })
  const [loading, setLoading] = React.useState(false)
  const [filterUnpaidOnly, setFilterUnpaidOnly] = React.useState(false)
  const [ledgerViewMode, setLedgerViewMode] = React.useState<"ledger" | "paired">("ledger")

  const [addAmount, setAddAmount] = React.useState("")
  const [addDate, setAddDate] = React.useState(bangkokTodayStr)
  const [addMemo, setAddMemo] = React.useState("")
  const [addEntity, setAddEntity] = React.useState("")
  const [addSaving, setAddSaving] = React.useState(false)
  const [addIsOpening, setAddIsOpening] = React.useState(false)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})
  const [expandedPayableRowId, setExpandedPayableRowId] = React.useState<string | null>(null)
  const [payableItemsCache, setPayableItemsCache] = React.useState<Record<string, LineItemsCacheEntry>>({})
  const [loadingItemsFor, setLoadingItemsFor] = React.useState<string | null>(null)
  const [updatingReceiveCheckId, setUpdatingReceiveCheckId] = React.useState<number | null>(null)
  const [receiveCheckDialog, setReceiveCheckDialog] = React.useState<{
    receivableId: number
    outletStoreName: string
    receiveDate: string
    invoiceLabel: string
  } | null>(null)
  const [taxInvoiceLoadingKey, setTaxInvoiceLoadingKey] = React.useState<string | null>(null)
  const [manualEdit, setManualEdit] = React.useState<{
    ledger: "receivable" | "payable"
    id: number
    refType: string
    entity: string
    amount: string
    date: string
    memo: string
  } | null>(null)
  const [manualEditSaving, setManualEditSaving] = React.useState(false)
  const [highlightBankTxId, setHighlightBankTxId] = React.useState<number | null>(null)
  const [pendingDeepLinkSearch, setPendingDeepLinkSearch] = React.useState(false)
  const urlDeepLinkAppliedRef = React.useRef(false)
  const listLoadSeqRef = React.useRef(0)
  const queryDraftStorageKey = React.useMemo(() => {
    const uid = String(auth?.user || "anon")
      .trim()
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 64)
    return `receivable_payable_query_draft_v1:${uid}`
  }, [auth?.user])
  const restoreQueryListRef = React.useRef(false)
  const skipNextTabClearRef = React.useRef(false)
  const draftHydratedRef = React.useRef(false)
  const [listRestoreTick, setListRestoreTick] = React.useState(0)
  const [queryDraftReady, setQueryDraftReady] = React.useState(false)

  const showReceivableManualActions = !(tab === "receivable" && isManagerOnly)
  const showPayableManualActions = canSelectStores
  const showPayableLinkActions =
    showPayableManualActions && canMutateManualPayableBalance(auth?.role || "")

  const [payableLinkDialog, setPayableLinkDialog] = React.useState<{
    vendorCode: string
    vendorLabel: string
    items: ReceivablePayableItem["items"]
    settlementLinks?: { paymentId: number; accrualId: number }[]
    anchorRow: ReceivablePayableItem["items"][number]
  } | null>(null)

  const openManualBalanceEdit = React.useCallback(
    (
      ledger: "receivable" | "payable",
      row: NonNullable<ReceivablePayableItem["items"]>[number],
      entity: string
    ) => {
      if (row.id == null) return
      setManualEdit({
        ledger,
        id: row.id,
        refType: String(row.ref_type || ""),
        entity,
        amount: String(Math.abs(Number(row.amount ?? 0)) || ""),
        date: row.trans_date || bangkokTodayStr(),
        memo: row.memo || "",
      })
    },
    []
  )

  const handleTaxInvoicePrint = React.useCallback(
    async (
      row: NonNullable<ReceivablePayableItem["items"]>[number],
      recItem: ReceivablePayableItem
    ) => {
      let refType: "Order" | "ForceOutbound" | "PO" | null = null
      let refId: number | null = null
      if (row.ref_type === "Order") {
        const orderId = orderIdFromReceivableOrderRow(row)
        if (orderId == null) {
          await appAlert(tt("recTaxInvoiceNoOrderId", "Cannot identify the order."))
          return
        }
        refType = "Order"
        refId = orderId
      } else if (row.ref_type === "ForceOutbound") {
        const sid = Number(row.ref_id)
        if (!Number.isFinite(sid) || sid <= 0) {
          await appAlert(t("recTaxInvoiceNoForceLog") || tt("recTaxInvoiceNoForceLog", "Cannot identify forced outbound log."))
          return
        }
        refType = "ForceOutbound"
        refId = sid
      } else if (row.ref_type === "AccountingPO") {
        const poId = Number(row.ref_id)
        if (!Number.isFinite(poId) || poId <= 0) {
          await appAlert(t("recTaxInvoiceNoPoId") || tt("recTaxInvoiceNoPoId", "Cannot identify accounting PO."))
          return
        }
        refType = "PO"
        refId = poId
      } else {
        return
      }

      const loadKey = refType === "Order"
        ? `tax-${row.id ?? refId}`
        : refType === "ForceOutbound"
          ? `tax-fo-${row.id ?? refId}`
          : `tax-apo-${row.id ?? refId}`
      setTaxInvoiceLoadingKey(loadKey)
      try {
        const targetLabel = String(recItem.storeName || recItem.vendorName || "").trim()
        const [{ items, orderInvoiceTotals, withholdingTaxAmount, withholdingTaxRate, poBillTo, referenceNo: stockReferenceNo }, invoiceDataRes, invSettings, billToCandRes] =
          await Promise.all([
          getPayableTransactionItems({ refType, refId }),
          getInvoiceData(),
          getInvoiceSettings(),
          refType === "Order" && refId != null
            ? getInvoiceOrderBillToCandidates([refId])
            : Promise.resolve({ map: {} as Record<string, string[]>, taxInvoiceClientMap: {} as Record<string, InvoiceDataClient> }),
        ])
        if (!items.length) {
          await appAlert(tt("recTaxInvoiceNoLines", "No line items to display, cannot create tax invoice."))
          return
        }
        const { company, clients } = invoiceDataRes
        const settings = typeof invSettings === "object" && invSettings !== null ? invSettings : {}
        const billToMap = billToCandRes?.map && typeof billToCandRes.map === "object" ? billToCandRes.map : {}
        const taxInvoiceClientMap =
          billToCandRes?.taxInvoiceClientMap && typeof billToCandRes.taxInvoiceClientMap === "object"
            ? billToCandRes.taxInvoiceClientMap
            : {}
        let client: InvoiceDataClient | { companyName: string }
        if (refType === "PO" && poBillTo?.vendorName) {
          client = resolveTaxInvoiceClientFromPoBillTo(poBillTo, company, clients)
        } else if (refType === "Order" && refId != null) {
          const fromOrder = billToMap[String(refId)]
          const memoFromOrder = taxInvoiceClientMap[String(refId)]
          const memoFromRow = buildClientFromPosTaxMemo(row.memo, targetLabel)
          const memoClient = memoFromOrder ?? memoFromRow
          const extra = [String(recItem.storeName || "").trim(), String(recItem.vendorName || "").trim()].filter(
            (s) => s.length > 0
          )
          const candidates =
            Array.isArray(fromOrder) && fromOrder.length > 0
              ? [...fromOrder, ...extra]
              : extra
          const resolvedClient =
            candidates.length > 0
              ? resolveInvoiceClientFromBillToCandidates(candidates, company, clients)
              : resolveInvoiceClientForTarget(targetLabel, company, clients)
          const hasResolvedMasterInfo =
            typeof (resolvedClient as { address?: string }).address === "string" &&
            String((resolvedClient as { address?: string }).address || "").trim() !== "-" &&
            String((resolvedClient as { address?: string }).address || "").trim().length > 0
          const strictStoreTarget = !isOfficeLikeLabel(targetLabel)
          client = strictStoreTarget
            ? resolvedClient
            : (hasResolvedMasterInfo ? resolvedClient : (memoClient ?? resolvedClient))
        } else {
          const memoClient = buildClientFromPosTaxMemo(row.memo, targetLabel)
          const resolvedClient = resolveInvoiceClientForTarget(targetLabel, company, clients)
          const hasResolvedMasterInfo =
            typeof (resolvedClient as { address?: string }).address === "string" &&
            String((resolvedClient as { address?: string }).address || "").trim() !== "-" &&
            String((resolvedClient as { address?: string }).address || "").trim().length > 0
          const strictStoreTarget = !isOfficeLikeLabel(targetLabel)
          client = strictStoreTarget
            ? resolvedClient
            : (hasResolvedMasterInfo ? resolvedClient : (memoClient ?? resolvedClient))
        }
        let dateStr = (row.trans_date || "").slice(0, 10) || bangkokTodayStr()
        let dueDateStr = dateStr
        let savedDocumentNo = ""
        let savedReferenceNo = ""
        let savedShipTo: string | undefined
        const accrualId = Number(row.id || 0)
        const outboundRef = resolveReceivableOrderNoDisplay(row)
        // Update로 저장한 발행일·만기일·문서번호가 재오픈 시 row.trans_date / reserve로 덮이지 않게 우선 적용
        if (refType && refId > 0) {
          try {
            const refs =
              refType === "PO"
                ? [
                    { refType: "PO" as const, refId, docKind: "tax" as const },
                    { refType: "AccountingPO", refId, docKind: "tax" as const },
                  ]
                : [{ refType, refId, docKind: "tax" as const }]
            const ovRes = await getInvoicePrintOverrides(refs)
            const map = ovRes?.success && ovRes.map ? ovRes.map : {}
            const candidates = refs
              .map((r) => map[`invoice_print_override:tax:${r.refType}:${r.refId}`])
              .filter(Boolean) as {
              issueDate?: string
              dueDate?: string
              documentNo?: string
              referenceNo?: string
              shipTo?: string
              updatedAt?: string
            }[]
            candidates.sort((a, b) =>
              String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
            )
            const ov = candidates[0]
            if (ov) {
              const ovIssue = String(ov.issueDate || "").trim().slice(0, 10)
              const ovDue = String(ov.dueDate || "").trim().slice(0, 10)
              if (/^\d{4}-\d{2}-\d{2}$/.test(ovIssue)) dateStr = ovIssue
              if (/^\d{4}-\d{2}-\d{2}$/.test(ovDue)) dueDateStr = ovDue
              savedDocumentNo = String(ov.documentNo || "").trim()
              savedReferenceNo = String(ov.referenceNo || "").trim()
              const st = String(ov.shipTo || "").trim()
              if (st) savedShipTo = st
            }
          } catch {
            // override 조회 실패 시 trans_date 기준으로 진행
          }
        }
        let docNo = ""
        const erpStockRef = String(stockReferenceNo || "").trim()
        // override에 IVF/IV 출고번호만 저장된 경우(구버전) → ERP 입력 reference_no 우선
        const overrideRefLooksLikeOutboundInv =
          /^IVF?\d{8}-\d+$/i.test(savedReferenceNo) || isTaxInvoiceDocumentNo(savedReferenceNo)
        const preferredReferenceNo =
          (savedReferenceNo && !overrideRefLooksLikeOutboundInv
            ? savedReferenceNo
            : erpStockRef || savedReferenceNo || (outboundRef !== "-" ? outboundRef : "")) || ""
        if (refType && refId > 0) {
          const seqRes = await getTaxInvoiceDepositSeq({
            accrualId: accrualId > 0 ? accrualId : undefined,
            issueDate: dateStr,
            refType,
            refId,
            existingDocumentNo: savedDocumentNo || undefined,
            referenceNo: preferredReferenceNo || undefined,
            dueDate: dueDateStr,
            reserve: true,
          })
          if (seqRes?.success && String(seqRes.documentNo || "").trim()) {
            docNo = String(seqRes.documentNo).trim()
          } else if (seqRes?.success && Number(seqRes.seq) > 0) {
            docNo = buildTaxInvoiceDocNo(dateStr, Number(seqRes.seq))
          }
        }
        if (!docNo) {
          docNo = savedDocumentNo || buildTaxInvoiceDocNo(dateStr, 1)
        }
        const referenceNo = normalizeTaxInvoiceReferenceNo(preferredReferenceNo, docNo)
        const data: InvoiceData = {
          ...buildThaiSalesInvoiceData({
            documentType: "Tax Invoice/Receipt",
            documentNo: docNo,
            issueDate: dateStr,
            dueDate: dueDateStr,
            referenceNo,
            company,
            client,
            invSettings: settings,
            sourceRefType: refType,
            sourceRefId: refId,
            lines: items.map((it) => ({
              code: it.code,
              name: it.name,
              spec: it.spec,
              lineRemarks: it.line_remarks?.trim() || undefined,
              qty: Math.abs(it.qty || 0),
              amount: roundMoney2(Math.abs(it.amount || 0)),
            })),
            orderInvoiceTotals,
            ...(refType === "PO" && Number(withholdingTaxAmount) > 0
              ? {
                  withholdingTaxAmount: Number(withholdingTaxAmount),
                  withholdingTaxRate:
                    withholdingTaxRate != null && Number(withholdingTaxRate) > 0
                      ? Number(withholdingTaxRate)
                      : undefined,
                }
              : {}),
          }),
          ...(savedShipTo ? { shipTo: savedShipTo } : {}),
        }
        sessionStorage.setItem("invoice-print-data", JSON.stringify([data]))
        const printWindow = window.open("/admin/invoice-print", "_blank")
        if (!printWindow) {
          await appAlert(tt("recTaxInvoicePopupBlocked", "Popup may be blocked. Allow popups and try again."))
          return
        }
        printWindow.focus()
      } catch (e) {
        console.error(e)
        await appAlert(t("invLoadFailed"))
      } finally {
        setTaxInvoiceLoadingKey(null)
      }
    },
    [t, tt]
  )

  React.useEffect(() => {
    const rows = listData.flatMap((item) => item.items || [])
    const memos = [...new Set(rows.map((r) => (r.memo || "").trim()).filter(Boolean))]
    if (memos.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(memos, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        memos.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => {
      cancelled = true
    }
  }, [listData, lang])

  React.useEffect(() => {
    if (tab !== "receivable") {
      setTaxInvoiceOverrideMap({})
      return
    }
    const refs: { refType: string; refId: number; docKind: "tax" }[] = []
    const seen = new Set<string>()
    for (const item of listData) {
      for (const row of item.items || []) {
        const refType = String(row.ref_type || "").trim()
        const refId = Number(row.ref_id || 0)
        if (
          !(refType === "Order" || refType === "ForceOutbound" || refType === "AccountingPO" || refType === "PO") ||
          !(refId > 0)
        ) {
          continue
        }
        const pushRef = (rt: string) => {
          const key = `${rt}:${refId}`
          if (seen.has(key)) return
          seen.add(key)
          refs.push({ refType: rt, refId, docKind: "tax" })
        }
        pushRef(refType)
        // 인쇄 화면은 AccountingPO를 sourceRefType=PO 로 저장 — 양쪽 키 모두 조회
        if (refType === "AccountingPO") pushRef("PO")
        if (refType === "PO") pushRef("AccountingPO")
      }
    }
    if (refs.length === 0) {
      setTaxInvoiceOverrideMap({})
      return
    }
    let cancelled = false
    void getInvoicePrintOverrides(refs)
      .then((res) => {
        if (cancelled) return
        setTaxInvoiceOverrideMap(res?.success && res.map ? res.map : {})
      })
      .catch(() => {
        if (!cancelled) setTaxInvoiceOverrideMap({})
      })
    return () => {
      cancelled = true
    }
  }, [listData, tab])

  const memoTransferWithdrawalLabel = tt("memoTransferWithdrawal", "Transfer Withdrawal")
  const getMemo = React.useCallback((memo: string | undefined) => {
    const raw = (memo && memoTransMap[memo]) || memo || "-"
    return raw.replace(/통징지급/g, memoTransferWithdrawalLabel)
  }, [memoTransMap, memoTransferWithdrawalLabel])

  React.useEffect(() => {
    getVendorsForPurchase().then((rows) => setVendors(rows || []))
  }, [])

  // 매출처 목록: vendor code + 표시명
  React.useEffect(() => {
    const load = async () => {
      const sales = (await getVendorsForSales()) || []
      const seen = new Set<string>()
      setSalesOutletOptions((sales || []).filter((v) => {
        const c = String(v.code || "").trim()
        if (!c || seen.has(c)) return false
        seen.add(c)
        return true
      }))
    }
    load().catch(() => setSalesOutletOptions([]))
  }, [])

  // 매니저(회계권한 없을 때): 미지급금 매장 선택을 자기 매장으로 고정
  React.useEffect(() => {
    if (!canSelectStores && isManager && managerStore) {
      setPayableStoreFilter(resolveStoreKey(managerStore))
    }
  }, [canSelectStores, isManager, managerStore, resolveStoreKey])

  // 본사/회계직원: 미지급금 매장 기본값 office
  const initPayableStoreRef = React.useRef(false)
  React.useEffect(() => {
    if (!canSelectStores || initPayableStoreRef.current || !storeList?.length) return
    const office = (storeList || []).find((s) => s && s.toLowerCase().includes("office"))
    if (office) {
      setPayableStoreFilter(office)
      initPayableStoreRef.current = true
    }
  }, [storeList, canSelectStores])

  // 매니저 + receivable 탭: 수령 입력 시 자기 매장 자동 선택
  React.useEffect(() => {
    if (tab === "receivable" && isManager && managerStore && !addEntity) {
      setAddEntity(resolveStoreKey(managerStore))
    }
  }, [tab, isManager, managerStore, addEntity, resolveStoreKey])

  // 매니저(회계권한 없을 때): 미지급금 탭 접근 불가 → receivable로 고정
  React.useEffect(() => {
    if (!canSelectStores && isManager && tab === "payable") applyTab("receivable")
  }, [canSelectStores, isManager, tab, applyTab])

  const loadList = React.useCallback(
    async (opts?: {
      fresh?: boolean
      overrides?: ReceivablePayableListLoadOverrides
      /** 다른 탭에서 온 무효화 알림으로 재조회할 때 — ping-pong 방지 */
      skipCrossTabNotify?: boolean
    }) => {
      const seq = ++listLoadSeqRef.current
      const effectiveTab = opts?.overrides?.type ?? tab
      const effectivePayableStore =
        opts?.overrides?.storeFilter !== undefined
          ? opts.overrides.storeFilter
          : effectiveTab === "payable"
            ? resolveEffectivePayableStoreFilter({
                payableStoreFilter,
                canSelectStores,
                storeList,
                officeDefaultApplied: initPayableStoreRef.current,
              })
            : undefined
      const storeFilterVal =
        opts?.overrides?.storeFilter !== undefined
          ? opts.overrides.storeFilter
          : effectiveTab === "receivable" && recStoreFilter !== "All"
            ? recStoreFilter
            : effectiveTab === "payable" && effectivePayableStore !== "All"
              ? effectivePayableStore
              : undefined
      const vendorFilterVal =
        opts?.overrides?.vendorFilter !== undefined
          ? opts.overrides.vendorFilter
          : effectiveTab === "payable" && vendorFilter !== "All"
            ? vendorFilter
            : undefined
      const invoiceFilterVal =
        opts?.overrides?.invoiceFilter !== undefined
          ? opts.overrides.invoiceFilter
          : invoiceSearch.trim() || undefined
      const listParams = {
        type: effectiveTab,
        storeFilter: storeFilterVal,
        vendorFilter: vendorFilterVal,
        invoiceFilter: invoiceFilterVal,
        startStr,
        endStr,
        userStore: auth?.store || undefined,
        userRole: auth?.role || undefined,
        fresh: opts?.fresh,
      }
      const summaryParams = {
        type: effectiveTab,
        endStr,
        storeFilter: storeFilterVal,
        vendorFilter: vendorFilterVal,
        userStore: auth?.store || undefined,
        userRole: auth?.role || undefined,
        fresh: opts?.fresh,
      }
      setLoading(true)
      try {
        if (opts?.fresh) {
          await invalidateReceivablePayableListCache({ notifyOtherTabs: false })
        }
        const [listRes, summaryRes] = await Promise.all([
          getReceivablePayableList(listParams),
          getReceivablePayableSummary(summaryParams),
        ])
        if (seq !== listLoadSeqRef.current) return
        setListData(listRes.list || [])
        const byKey = mergeReceivablePayableCumulativeByKey({
          tab: effectiveTab,
          summaryRows: summaryRes.list || [],
          listItems: listRes.list || [],
          payableCumulativeByVendor:
            effectiveTab === "payable" ? listRes.cumulativeByVendor : undefined,
          receivableCumulativeByStoreGroup:
            effectiveTab === "receivable" ? listRes.cumulativeByStoreGroup : undefined,
        })
        const totalAmount = Object.values(byKey).reduce((sum, v) => sum + v, 0)
        setCumulativeSummary({
          totalAmount,
          byKey,
        })
        if (opts?.fresh && !opts?.skipCrossTabNotify) {
          publishReceivablePayableListInvalidated()
        }
      } catch {
        if (seq !== listLoadSeqRef.current) return
        setListData([])
        setCumulativeSummary({ totalAmount: 0, byKey: {} })
      } finally {
        if (seq === listLoadSeqRef.current) setLoading(false)
      }
    },
    [tab, recStoreFilter, payableStoreFilter, vendorFilter, invoiceSearch, startStr, endStr, auth?.store, auth?.role, canSelectStores, storeList]
  )

  const handleManualBalanceSave = React.useCallback(async () => {
    if (!manualEdit) return
    const amount = Number(manualEdit.amount?.replace(/,/g, ""))
    if (!amount || amount <= 0) {
      await appAlert(t("pettyAlertAmount") || "Please enter amount.")
      return
    }
    if (!manualEdit.entity?.trim()) {
      await appAlert(
        manualEdit.ledger === "receivable"
          ? tt("receivableSelectCustomer", "Please select customer.")
          : tt("payableSelectVendor", "Please select vendor.")
      )
      return
    }
    setManualEditSaving(true)
    try {
      const res = await updateManualBalanceTransaction({
        type: manualEdit.ledger,
        id: manualEdit.id,
        amount,
        transDate: manualEdit.date,
        memo: manualEdit.memo || undefined,
        storeName: manualEdit.ledger === "receivable" ? manualEdit.entity : undefined,
        vendorCode: manualEdit.ledger === "payable" ? manualEdit.entity : undefined,
      })
      if (res.success) {
        setManualEdit(null)
        loadList({ fresh: true })
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message)
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setManualEditSaving(false)
    }
  }, [manualEdit, t, tt, loadList])

  const handleManualBalanceDelete = React.useCallback(
    async (ledger: "receivable" | "payable", id: number) => {
      const ok = await appConfirm(
        ledger === "receivable"
          ? t("recManualDeleteConfirm") ||
              "이 수령(또는 기초이월) 내역을 삭제하시겠습니까? 잔액에서 제외됩니다."
          : t("payManualDeleteConfirm") ||
              "이 지급(또는 기초이월) 내역을 삭제하시겠습니까? 잔액에서 제외됩니다."
      )
      if (!ok) return
      setManualEditSaving(true)
      try {
        const res = await deleteManualBalanceTransaction({ type: ledger, id })
        if (res.success) {
          setManualEdit(null)
          loadList({ fresh: true })
        } else {
          await appAlert(translateApiMessage(res.message, t) || res.message)
        }
      } catch (e) {
        await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setManualEditSaving(false)
      }
    },
    [t, loadList]
  )

  /** 매출처 선택값과 동일·유사 이름의 매입 거래처(발주·미지급) — 미수금이 비어 있을 때 미지급 탭 유도용 */
  const purchaseVendorMatchForOutlet = React.useMemo(() => {
    if (salesOutletFilter === "All") return null
    const code = salesOutletFilter.trim().toLowerCase()
    if (!code) return null
    return vendors.find((v) => (v.code || "").trim().toLowerCase() === code) ?? null
  }, [salesOutletFilter, vendors])

  const selectedSalesOutletLabel = React.useMemo(() => {
    if (salesOutletFilter === "All") return tt("recFilterSalesOutletAll", "All Customers")
    const row = salesOutletOptions.find((v) => (v.code || "") === salesOutletFilter)
    if (!row) return salesOutletFilter
    const nm = String(row.name || "").trim()
    return nm && nm !== row.code ? `${nm} (${row.code})` : row.code
  }, [salesOutletFilter, salesOutletOptions, tt])

  const jumpToPayableForMatchedVendor = React.useCallback(() => {
    const v = purchaseVendorMatchForOutlet
    if (!v || !canSelectStores) return
    applyTab("payable")
    setVendorFilter(v.code)
    setPayableStoreFilter("All")
    setHasSearchedList(true)
    void loadList({
      fresh: true,
      overrides: { type: "payable", vendorFilter: v.code, storeFilter: undefined },
    })
  }, [purchaseVendorMatchForOutlet, canSelectStores, loadList, applyTab])

  const [hasSearchedList, setHasSearchedList] = React.useState(false)
  const hasSearchedListRef = React.useRef(false)
  React.useEffect(() => {
    hasSearchedListRef.current = hasSearchedList
  }, [hasSearchedList])

  React.useEffect(() => {
    return subscribeReceivablePayableListInvalidated(() => {
      if (!hasSearchedListRef.current) return
      void loadList({ fresh: true, skipCrossTabNotify: true })
    })
  }, [loadList])

  useErpRefetchOnActivate(() => {
    if (!hasSearchedListRef.current) return
    void loadList({ fresh: true, skipCrossTabNotify: true })
  })

  const handleLoadList = React.useCallback(() => {
    setHasSearchedList(true)
    void loadList({ fresh: true })
  }, [loadList])

  const resolveSalesOutletFilterFromStoreName = React.useCallback(
    (storeName: string) => {
      const trimmed = String(storeName || "").trim()
      if (!trimmed) return "All"
      const direct = salesOutletOptions.find(
        (s) => s.code === trimmed || s.name === trimmed
      )
      if (direct?.code) return direct.code
      const storeKey = resolveStoreKey(trimmed)
      const byStore = salesOutletOptions.find((s) => {
        const nameKey = resolveStoreKey(s.name || "")
        const codeKey = resolveStoreKey(s.code || "")
        return nameKey === storeKey || codeKey === storeKey
      })
      if (byStore?.code) return byStore.code
      return trimmed
    },
    [resolveStoreKey, salesOutletOptions]
  )

  React.useEffect(() => {
    if (!pageActiveRef.current || !allowReceivableUrlSync) return
    if (urlDeepLinkAppliedRef.current) return
    const typeParam = searchParams.get("type")
    const storeParam = searchParams.get("storeFilter") || searchParams.get("store")
    const startParam = searchParams.get("startStr") || searchParams.get("start")
    const endParam = searchParams.get("endStr") || searchParams.get("end")
    const bankTxParam = searchParams.get("bankTransactionId")
    const hasDeepLink =
      typeParam === "receivable" ||
      typeParam === "payable" ||
      Boolean(storeParam) ||
      Boolean(startParam) ||
      Boolean(endParam) ||
      Boolean(bankTxParam)
    if (!hasDeepLink) return
    urlDeepLinkAppliedRef.current = true
    if (typeParam === "receivable" || typeParam === "payable") applyTab(typeParam)
    if (startParam) setStartStr(startParam.slice(0, 10))
    if (endParam) setEndStr(endParam.slice(0, 10))
    if (storeParam && typeParam !== "payable") {
      setSalesOutletFilter(resolveSalesOutletFilterFromStoreName(storeParam))
    }
    if (bankTxParam && Number(bankTxParam) > 0) {
      setHighlightBankTxId(Number(bankTxParam))
    }
    setPendingDeepLinkSearch(true)
  }, [searchParams, resolveSalesOutletFilterFromStoreName, applyTab, allowReceivableUrlSync, pageActiveRef])

  const restoreReceivablePayableQueryDraft = React.useCallback(
    (data: ReceivablePayableQueryDraft | null | undefined) => {
      if (!data) return false
      const today = bangkokTodayStr()
      const hasDraft =
        Boolean(data.hasSearchedList) ||
        data.tab === "payable" ||
        Boolean(data.salesOutletFilter && data.salesOutletFilter !== "All") ||
        Boolean(data.vendorFilter && data.vendorFilter !== "All") ||
        Boolean(data.invoiceSearch?.trim()) ||
        Boolean(data.filterUnpaidOnly) ||
        data.ledgerViewMode === "paired" ||
        Boolean(data.startStr && data.startStr !== today) ||
        Boolean(data.endStr && data.endStr !== today) ||
        Boolean(data.payableStoreFilter && data.payableStoreFilter !== "All")
      if (!hasDraft) return false

      if (data.tab === "payable" && canSelectStores) {
        skipNextTabClearRef.current = true
        setTabUi("payable")
        setTab("payable")
      } else if (data.tab === "receivable") {
        setTabUi("receivable")
        setTab("receivable")
      }
      if (data.startStr && /^\d{4}-\d{2}-\d{2}$/.test(data.startStr)) setStartStr(data.startStr)
      if (data.endStr && /^\d{4}-\d{2}-\d{2}$/.test(data.endStr)) setEndStr(data.endStr)
      if (typeof data.salesOutletFilter === "string" && data.salesOutletFilter) {
        setSalesOutletFilter(data.salesOutletFilter)
      }
      if (canSelectStores && typeof data.payableStoreFilter === "string" && data.payableStoreFilter) {
        setPayableStoreFilter(data.payableStoreFilter)
        initPayableStoreRef.current = true
      }
      if (typeof data.vendorFilter === "string" && data.vendorFilter) setVendorFilter(data.vendorFilter)
      if (typeof data.invoiceSearch === "string") setInvoiceSearch(data.invoiceSearch)
      if (typeof data.filterUnpaidOnly === "boolean") setFilterUnpaidOnly(data.filterUnpaidOnly)
      if (data.ledgerViewMode === "ledger" || data.ledgerViewMode === "paired") {
        setLedgerViewMode(data.ledgerViewMode)
      }
      if (data.hasSearchedList) {
        restoreQueryListRef.current = true
        setListRestoreTick((n) => n + 1)
      }
      return true
    },
    [canSelectStores]
  )

  React.useEffect(() => {
    if (draftHydratedRef.current) return
    if (!pageActiveRef.current) return
    draftHydratedRef.current = true
    const typeParam = searchParams.get("type")
    const storeParam = searchParams.get("storeFilter") || searchParams.get("store")
    const startParam = searchParams.get("startStr") || searchParams.get("start")
    const endParam = searchParams.get("endStr") || searchParams.get("end")
    const bankTxParam = searchParams.get("bankTransactionId")
    const hasDeepLink =
      typeParam === "receivable" ||
      typeParam === "payable" ||
      Boolean(storeParam) ||
      Boolean(startParam) ||
      Boolean(endParam) ||
      Boolean(bankTxParam)
    if (!hasDeepLink) {
      try {
        const raw = sessionStorage.getItem(queryDraftStorageKey)
        if (raw) {
          const draft = JSON.parse(raw) as ReceivablePayableQueryDraft
          if (!restoreReceivablePayableQueryDraft(draft)) {
            sessionStorage.removeItem(queryDraftStorageKey)
          }
        }
      } catch {
        try {
          sessionStorage.removeItem(queryDraftStorageKey)
        } catch {}
      }
    }
    setQueryDraftReady(true)
  }, [queryDraftStorageKey, restoreReceivablePayableQueryDraft, searchParams, pageActiveRef, allowReceivableUrlSync])

  React.useEffect(() => {
    if (!restoreQueryListRef.current) return
    restoreQueryListRef.current = false
    setHasSearchedList(true)
    void loadList({ fresh: true })
  }, [listRestoreTick, loadList])

  React.useEffect(() => {
    if (!pendingDeepLinkSearch) return
    setPendingDeepLinkSearch(false)
    setHasSearchedList(true)
    void loadList({ fresh: true })
  }, [pendingDeepLinkSearch, loadList])

  React.useEffect(() => {
    if (skipNextTabClearRef.current) {
      skipNextTabClearRef.current = false
      return
    }
    listLoadSeqRef.current += 1
    setHasSearchedList(false)
    setListData([])
    setCumulativeSummary({ totalAmount: 0, byKey: {} })
    setLoading(false)
  }, [tab])

  const todayForDraft = bangkokTodayStr()
  const hasQueryDraft = Boolean(
    hasSearchedList ||
      tab === "payable" ||
      salesOutletFilter !== "All" ||
      vendorFilter !== "All" ||
      invoiceSearch.trim() ||
      filterUnpaidOnly ||
      ledgerViewMode !== "ledger" ||
      startStr !== todayForDraft ||
      endStr !== todayForDraft ||
      (canSelectStores && payableStoreFilter !== "All")
  )

  React.useEffect(() => {
    if (!queryDraftReady) return
    try {
      if (!hasQueryDraft) {
        sessionStorage.removeItem(queryDraftStorageKey)
        return
      }
      const draft: ReceivablePayableQueryDraft = {
        tab,
        startStr,
        endStr,
        salesOutletFilter,
        payableStoreFilter,
        vendorFilter,
        invoiceSearch,
        filterUnpaidOnly,
        ledgerViewMode,
        hasSearchedList,
      }
      sessionStorage.setItem(queryDraftStorageKey, JSON.stringify(draft))
    } catch {}
  }, [
    canSelectStores,
    endStr,
    filterUnpaidOnly,
    hasQueryDraft,
    hasSearchedList,
    invoiceSearch,
    ledgerViewMode,
    payableStoreFilter,
    queryDraftReady,
    queryDraftStorageKey,
    salesOutletFilter,
    startStr,
    tab,
    vendorFilter,
  ])

  const bankTxLinkedAccrualIds = React.useMemo(() => {
    const byBank = new Map<number, Set<number>>()
    for (const item of listData) {
      for (const row of item.items || []) {
        const bankId = Number(row.bank_transaction_id || 0)
        if (!bankId) continue
        if (row.ref_type === "Receive" && row.ref_id != null) {
          const accrualId = Number(row.ref_id)
          if (accrualId > 0) {
            const set = byBank.get(bankId) || new Set<number>()
            set.add(accrualId)
            byBank.set(bankId, set)
          }
        }
      }
    }
    return byBank
  }, [listData])

  const rowHighlightsBankTx = React.useCallback(
    (row: NonNullable<ReceivablePayableItem["items"]>[number]) => {
      if (!highlightBankTxId) return false
      if (Number(row.bank_transaction_id || 0) === highlightBankTxId) return true
      if (
        row.id != null &&
        (row.ref_type === "Order" ||
          row.ref_type === "ForceOutbound" ||
          row.ref_type === "AccountingPO") &&
        bankTxLinkedAccrualIds.get(highlightBankTxId)?.has(Number(row.id))
      ) {
        return true
      }
      return false
    },
    [bankTxLinkedAccrualIds, highlightBankTxId]
  )

  const openBankTransactionFromReceivable = React.useCallback(
    (bankTransactionId: number, transDate?: string) => {
      const q = new URLSearchParams({ tab: "query", openRegisterTxId: String(bankTransactionId) })
      const d = String(transDate || "").slice(0, 10)
      if (d) {
        q.set("startStr", d)
        q.set("endStr", d)
      }
      router.push(`/admin/bank-transactions?${q.toString()}`)
    },
    [router]
  )

  const handleReceiveCheckChange = React.useCallback(
    async (params: {
      receivableId: number
      receiveChecked: boolean
      outletStoreName: string
      receiveDate?: string
    }) => {
      const { receivableId, receiveChecked, outletStoreName, receiveDate } = params
      if (!canUpdateReceivableReceiveCheck(auth?.role || "", auth?.store || "", outletStoreName)) return
      if (receiveChecked && !receiveDate) {
        await appAlert(tt("recReceiveCheckDateRequired", "입금(수령)일을 입력해 주세요."))
        return
      }
      if (!receiveChecked) {
        const ok = await appConfirm(
          tt(
            "recReceiveCheckUncheckConfirm",
            "수금 완료를 취소하면 연결된 입금 내역도 함께 제거됩니다. 계속하시겠습니까?"
          )
        )
        if (!ok) return
      }
      setUpdatingReceiveCheckId(receivableId)
      try {
        const res = await updateReceivableReceiveCheck({
          id: receivableId,
          receiveChecked,
          receiveDate,
          userStore: auth?.store,
          userRole: auth?.role,
        })
        if (res.success) {
          setReceiveCheckDialog(null)
          loadList({ fresh: true })
        } else {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail") || "Failed")
        }
      } catch (e) {
        await appAlert((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setUpdatingReceiveCheckId(null)
      }
    },
    [auth?.role, auth?.store, loadList, t, tt]
  )

  const openReceiveCheckDialog = React.useCallback(
    (params: { receivableId: number; outletStoreName: string; invoiceLabel: string }) => {
      setReceiveCheckDialog({
        ...params,
        receiveDate: bangkokTodayStr(),
      })
    },
    []
  )

  React.useEffect(() => {
    setExpandedPayableRowId(null)
    setPayableItemsCache({})
  }, [listData, tab])

  const handleAdd = async () => {
    const amount = Number(addAmount?.replace(/,/g, ""))
    if (!amount || amount <= 0) {
      await appAlert(t("pettyAlertAmount") || "Please enter amount.")
      return
    }
    if (!addEntity?.trim()) {
      await appAlert(tab === "receivable"
        ? tt("receivableSelectCustomer", "Please select customer.")
        : tt("payableSelectVendor", "Please select vendor."))
      return
    }
    setAddSaving(true)
    try {
      const res = await addBalanceTransaction({
        type: tab,
        storeName: tab === "receivable" ? addEntity : undefined,
        vendorCode: tab === "payable" ? addEntity : undefined,
        amount,
        transDate: addDate,
        memo: addMemo || undefined,
        isOpening: addIsOpening,
        userStore: auth?.store || undefined,
        userRole: auth?.role || undefined,
      })
      if (res.success) {
        setAddAmount("")
        setAddMemo("")
        loadList({ fresh: true })
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message)
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAddSaving(false)
    }
  }

  const receivableStores = tab === "receivable"
    ? (isManager && managerStore ? [resolveStoreKey(managerStore)] : (storeList || []))
    : []

  const formatVendorDisplay = (vendorCode?: string) => {
    if (!vendorCode) return ""
    const v = vendors.find((x) => x.code === vendorCode)
    const name = v?.name || vendorCode
    return name === vendorCode ? name : `${name} (${vendorCode})`
  }

  const formatPayableRefTypeLabel = (refType?: string) => {
    if (refType === "Opening") return t("recTypeOpening") || "기초이월"
    if (refType === "PO") return t("payTypePO") || "발주"
    if (refType === "Inbound") return t("payTypeInbound") || tt("payTypeInbound", "입고")
    if (refType === "Payment") return t("payTypePayment") || "지급"
    return refType || "—"
  }

  const filterRowsByLedgerPeriod = <T extends { trans_date?: string }>(items: T[]): T[] => {
    if (invoiceFilterActive) return items
    return items.filter((r) => {
      const d = String(r.trans_date || "").slice(0, 10)
      if (!d) return false
      if (startStr && d < startStr) return false
      if (endStr && d > endStr) return false
      return true
    })
  }

  const filterItemsByUnpaid = <T extends { ref_type?: string }>(items: T[] | undefined, isRec: boolean): T[] => {
    if (!filterUnpaidOnly || !items?.length) return items ?? []
    if (isRec)
      return items.filter(
        (r) =>
          r.ref_type === "Opening" ||
          r.ref_type === "Order" ||
          r.ref_type === "AccountingPO" ||
          r.ref_type === "ForceOutbound"
      )
    return items.filter((r) => r.ref_type === "Opening" || r.ref_type === "Inbound")
  }

  const getCumulativeBalanceForItem = React.useCallback(
    (item: ReceivablePayableItem) => {
      const key = cumulativeBalanceKey(tab, item)
      if (key) {
        const fromMap = cumulativeSummary.byKey[key]
        if (fromMap != null && Number.isFinite(fromMap)) return fromMap
      }
      if (item.cumulativeBalance != null && Number.isFinite(item.cumulativeBalance)) {
        return item.cumulativeBalance
      }
      return undefined
    },
    [tab, cumulativeSummary.byKey]
  )

  const listSearchTotals = React.useMemo(() => {
    let accrualSum = 0
    let settlementSum = 0
    let balanceSum = 0
    let cumulativeSum = 0
    let unallocatedBankSum = 0
    let count = 0
    for (const item of listData) {
      const allItems = item.items ?? []
      const period = sumReceivablePayablePeriodAmounts(allItems)
      accrualSum += period.salesSum
      settlementSum += period.receiveSum
      balanceSum += period.periodNet
      const cumulativeBal = getCumulativeBalanceForItem(item)
      if (cumulativeBal != null) cumulativeSum += cumulativeBal
      unallocatedBankSum += Number(item.unallocatedBankReceiveTotal || 0)
      count += 1
    }
    return { accrualSum, settlementSum, balanceSum, cumulativeSum, unallocatedBankSum, count }
  }, [listData, tab, getCumulativeBalanceForItem])

  const ledgerNoPeriodRowsHint =
    t("ledgerNoPeriodRows") ||
    tt(
      "ledgerNoPeriodRows",
      "조회 기간 내 거래 내역이 없습니다. 누적 잔액은 종료일까지 전체 이력 기준입니다."
    )

  const ledgerPairLabels = React.useMemo(
    () => ({
      statusSettled: t("ledgerPairStatusSettled") || tt("ledgerPairStatusSettled", "완결"),
      statusOpen: t("ledgerPairStatusOpen") || tt("ledgerPairStatusOpen", "미결"),
      statusPartial: t("ledgerPairStatusPartial") || tt("ledgerPairStatusPartial", "부분"),
      statusStandalone: t("ledgerPairStatusStandalone") || tt("ledgerPairStatusStandalone", "단독"),
      settlementPrefix: t("ledgerPairSettlementPrefix") || tt("ledgerPairSettlementPrefix", "↳"),
      noSettlement: t("ledgerPairNoSettlement") || tt("ledgerPairNoSettlement", "정산 내역 없음"),
      daysBetween: t("ledgerPairDaysBetween") || tt("ledgerPairDaysBetween", "{n}일"),
      openRemain: t("ledgerPairOpenRemain") || tt("ledgerPairOpenRemain", "잔액"),
      salesDate: t("recLedgerSalesDateShort") || tt("recLedgerSalesDateShort", "매출"),
      receiveDate: t("recLedgerReceiveDateShort") || tt("recLedgerReceiveDateShort", "입금"),
      purchaseDate: t("payLedgerPurchaseDateShort") || tt("payLedgerPurchaseDateShort", "매입"),
      paymentDate: t("payLedgerPaymentDateShort") || tt("payLedgerPaymentDateShort", "지급"),
    }),
    [t, tt]
  )

  const ledgerViewModeSelect = (
    <Select value={ledgerViewMode} onValueChange={(v) => setLedgerViewMode(v as "ledger" | "paired")}>
      <SelectTrigger
        className="h-9 w-[132px] max-w-full text-[13px] shrink-0"
        title={tt("ledgerViewModePairedHint", "발생과 정산을 한 블록으로 묶어 표시합니다.")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ledger">{t("ledgerViewModeLedger") || tt("ledgerViewModeLedger", "전체 내역")}</SelectItem>
        <SelectItem value="paired">{t("ledgerViewModePaired") || tt("ledgerViewModePaired", "짝짓기 보기")}</SelectItem>
      </SelectContent>
    </Select>
  )

  const ledgerAging = React.useMemo(
    () => computeLedgerAging(listData, tab, endStr),
    [listData, tab, endStr]
  )

  const amountGridCols =
    "grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(6rem,1fr))] gap-x-2 sm:gap-x-3 gap-y-1 items-center w-full min-w-0"
  const ledgerSummaryHeaderCellCn = "text-center min-w-0 px-1 text-sm sm:text-sm leading-tight"
  /** table-fixed+w-full은 모바일에서 뒤쪽 금액 열이 0폭으로 잘림 → min-width + 가로 스크롤 */
  const ledgerDetailTableCn = "min-w-[1150px] w-max max-w-none text-sm border-separate border-spacing-0"

  const cumulativeBalanceLabel = React.useMemo(() => {
    const base =
      tab === "receivable"
        ? t("recCumulativeBalanceAsOf") || tt("recCumulativeBalanceAsOf", "종료일 기준 누적 미수잔액")
        : t("payCumulativeBalanceAsOf") || tt("payCumulativeBalanceAsOf", "종료일 기준 누적 미지급잔액")
    return endStr ? `${base} (${endStr})` : base
  }, [tab, endStr, t, tt])

  const cumulativeColLabel =
    tab === "receivable"
      ? t("recColCumulativeBalance") || tt("recColCumulativeBalance", "누적 잔액")
      : t("payColCumulativeBalance") || tt("payColCumulativeBalance", "누적 잔액")

  const formatPriorBalanceHint = React.useCallback(
    (prior: number | undefined) => {
      if (prior == null || Math.abs(prior) <= 0.01) return null
      const template = startStr
        ? t("ledgerPriorBalanceBeforeStart") || tt("ledgerPriorBalanceBeforeStart", "조회 시작({date}) 이전 ฿{amount}")
        : t("ledgerPriorBalanceBeforePeriod") || tt("ledgerPriorBalanceBeforePeriod", "조회 기간 이전 ฿{amount}")
      return template.replace("{date}", startStr).replace("{amount}", formatMoneyBaht(prior))
    },
    [startStr, t, tt]
  )

  const transactionLineRowKey = (
    mode: "pay" | "rec",
    row: { id?: number; ref_type?: string; ref_id?: number }
  ) => (row.id != null ? `${mode}-${row.id}` : `${mode}-${row.ref_type ?? "x"}-${row.ref_id ?? "0"}`)

  const toggleLineItemsExpand = React.useCallback(
    async (mode: "pay" | "rec", row: { id?: number; ref_type?: string; ref_id?: number; invoice_no?: string; memo?: string }) => {
      const key = transactionLineRowKey(mode, row)
      if (expandedPayableRowId === key) {
        setExpandedPayableRowId(null)
        return
      }
      setExpandedPayableRowId(key)
      if (payableItemsCache[key]) return

      const refType = row.ref_type
      let refId: number | undefined
      if (refType === "Order") {
        refId = orderIdFromReceivableOrderRow(row)
      } else if (refType === "Inbound" || refType === "PO" || refType === "ForceOutbound") {
        const rid = Number(row.ref_id)
        if (rid > 0 && !Number.isNaN(rid)) refId = rid
      }

      if (!refType || refId == null) {
        setPayableItemsCache((c) => ({ ...c, [key]: { items: [] } }))
        return
      }

      setLoadingItemsFor(key)
      try {
        const { items, orderInvoiceTotals } = await getPayableTransactionItems({ refType, refId })
        setPayableItemsCache((c) => ({ ...c, [key]: { items, orderInvoiceTotals } }))
      } catch {
        setPayableItemsCache((c) => ({ ...c, [key]: { items: [] } }))
      } finally {
        setLoadingItemsFor(null)
      }
    },
    [expandedPayableRowId, payableItemsCache]
  )

  const escapeXml = (s: string) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

  const handlePrint = () => {
    if (listData.length === 0) return
    const area = document.getElementById("receivable-payable-print-area")
    if (!area) return
    const style = document.createElement("style")
    style.id = "receivable-payable-print-style"
    style.textContent = `@media print {
      body * { visibility: hidden; }
      #receivable-payable-print-area, #receivable-payable-print-area * { visibility: visible; }
      #receivable-payable-print-area { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
      .print\\:hidden { display: none !important; }
    }`
    document.head.appendChild(style)
    window.print()
    document.getElementById("receivable-payable-print-style")?.remove()
  }

  const handleExcel = () => {
    if (listData.length === 0) return
    const isRec = tab === "receivable"
    const entityCol = isRec ? (t("outColStore") || "Customer") : (t("vendor") || "Vendor")
    const typeOrder = isRec ? (t("recTypeOrder") || "Order") : (t("payTypePO") || "PO")
    const typeInbound = t("payTypeInbound") || tt("payTypeInbound", "Inbound")
    const typeAccountingPo = tt("recTypeAccountingPO", "Accounting PO")
    const typeForceOutbound = tt("recTypeForceOutbound", "Forced Outbound")
    const typeReceive = isRec ? (t("recTypeReceive") || "Receive") : (t("payTypePayment") || "Payment")
    const typeOpening = t("recTypeOpening") || "Opening Balance"
    const statusRec = (r: { ref_type?: string }) => r.ref_type === "Receive" ? (t("recStatusReceived") || "Received") : (t("recStatusUnpaid") || "Unpaid")
    const statusPay = (r: { ref_type?: string }) => r.ref_type === "Payment" ? (t("payStatusPaid") || "Paid") : (t("payStatusUnpaid") || "Unpaid")
    const header = isRec
      ? [
          entityCol,
          t("date") || "Date",
          t("type") || "Type",
          t("recColInvoiceNo") || t("recColOrderNo") || "Invoice No",
          t("recColTaxInvoiceDocNo") || "Tax-Invoice/Receipt No",
          t("recColReceiveStatus") || "Receive Status",
          t("recColReceiveCheck") || "Collection Check",
          t("amount") || "Amount",
          t("memo") || "Memo",
        ]
      : [
          entityCol,
          t("date") || "Date",
          t("type") || "Type",
          t("poInvoice") || "Invoice",
          t("payColAttributedStore") || tt("payColAttributedStore", "Attributed Store"),
          t("payColPaymentStatus") || "Payment Status",
          t("amount") || "Amount",
          t("memo") || "Memo",
        ]
    const rows: string[][] = [header]
    for (const item of listData) {
      const displayItems = filterItemsByUnpaid(item.items, isRec)
      if (displayItems.length === 0) continue
      const name = isRec ? (item.storeName ?? "") : formatVendorDisplay(item.vendorCode)
      const typeLabel = (ref: string) =>
        ref === "Opening"
          ? typeOpening
          : ref === "AccountingPO"
            ? typeAccountingPo
            : ref === "ForceOutbound"
              ? typeForceOutbound
              : ref === "Inbound"
                ? typeInbound
              : ref === (isRec ? "Order" : "PO")
                ? typeOrder
                : typeReceive
      for (const row of displayItems) {
        const orderOrInv =
          isRec && (row.ref_type === "Order" || row.ref_type === "AccountingPO" || row.ref_type === "ForceOutbound")
            ? resolveReceivableOrderNoDisplay(row)
            : ""
        const taxInvDoc =
          isRec && (row.ref_type === "Order" || row.ref_type === "AccountingPO" || row.ref_type === "ForceOutbound")
            ? resolveReceivableTaxInvoiceDocNoDisplay(row, taxInvoiceOverrideMap) || ""
            : ""
        const receiveCheckCell = isRec
          ? row.ref_type === "Order" || row.ref_type === "ForceOutbound" || row.ref_type === "AccountingPO"
            ? ((row as { receive_checked?: boolean }).receive_checked
              ? (t("recCheckPaid") || "Collected")
              : (t("recCheckWait") || "Pending"))
            : "-"
          : ""
        const invPayable = !isRec
          ? ((row as { invoice_received?: boolean; invoice_no?: string }).invoice_received === true
            ? ((row as { invoice_no?: string }).invoice_no || t("poInvoiceReceived") || "Received")
            : (row as { invoice_received?: boolean }).invoice_received === false
              ? (t("poInvoiceNotReceived") || "Not Received")
              : "-")
          : ""
        rows.push(
          isRec
            ? [
                name,
                row.trans_date || "-",
                typeLabel(row.ref_type || ""),
                orderOrInv,
                taxInvDoc,
                statusRec(row),
                receiveCheckCell,
                formatMoneyBaht(row.amount ?? 0),
                getMemo(row.memo) || "",
              ]
            : [
                name,
                row.trans_date || "-",
                typeLabel(row.ref_type || ""),
                invPayable,
                formatAttributedStoreLabel((row as { attributed_store?: string }).attributed_store),
                statusPay(row),
                String(formatMoneyBaht(row.amount ?? 0)),
                getMemo(row.memo) || "",
              ]
        )
      }
    }
    if (rows.length <= 1) return
    const tableBody = `<table>
<tr>${rows[0].map((c) => `<th>${escapeXml(c)}</th>`).join("")}</tr>
${rows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>`).join("")}
</table>`
    const html = buildErpExcelHtmlDocument(
      tableBody,
      erpExcelSimpleTableStyle({ includeTh: true, borderColor: "#333" })
    )
    triggerErpExcelHtmlDownload(html, `${tab}_${startStr}_${endStr}.xls`)
  }

  const isRec = contentTab === "receivable"
  const printTitle = isRec ? (t("receivableTab") || "Receivables (Sales)") : (t("payableTab") || "Payables (Purchase)")
  const tabPanelPendingLabel = t("loadingItems") || "Loading..."
  const typeLabel = (ref: string) =>
    ref === "Opening"
      ? (t("recTypeOpening") || "Opening Balance")
      : ref === "AccountingPO"
        ? (t("recTypeAccountingPO") || "Accounting PO")
        : ref === "ForceOutbound"
          ? (t("recTypeForceOutbound") || "Forced Outbound")
          : ref === "Inbound"
            ? (t("payTypeInbound") || tt("payTypeInbound", "Inbound"))
          : ref === (isRec ? "Order" : "PO")
            ? isRec
              ? (t("recTypeOrder") || "Order")
              : (t("payTypePO") || "PO")
            : isRec
              ? (t("recTypeReceive") || "Receive")
              : (t("payTypePayment") || "Payment")

  const ledgerSummaryMetrics =
    hasSearchedList && !loading ? (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 mb-4">
        <MetricCard
          size="sm"
          variant="primary"
          label={t("acct_kpi_cumulative_balance")}
          value={fmtBaht(cumulativeSummary.totalAmount)}
          subLabel={cumulativeBalanceLabel}
        />
        {listSearchTotals.count > 0 ? (
          <>
            <MetricCard
              size="sm"
              label={t("acct_kpi_period_net")}
              value={fmtBaht(listSearchTotals.balanceSum)}
            />
            <MetricCard
              size="sm"
              label={t("acct_kpi_period_accrual")}
              value={fmtBaht(listSearchTotals.accrualSum)}
            />
            <MetricCard
              size="sm"
              label={t("acct_kpi_period_settlement")}
              value={fmtBaht(listSearchTotals.settlementSum)}
            />
          </>
        ) : null}
      </div>
    ) : null

  return (
    <div className="space-y-4">
      {hasSearchedList && !loading && ledgerAging.openLineCount > 0 ? (
        <ReceivableAgingPanel
          ledger={tab}
          asOfDate={endStr}
          buckets={ledgerAging.buckets}
          total={ledgerAging.total}
          openLineCount={ledgerAging.openLineCount}
        />
      ) : null}
      {/* 인쇄용 영역 (화면에는 숨김) */}
      <div id="receivable-payable-print-area" className="hidden print:block p-6">
        <h1 className="text-lg font-bold mb-2">{printTitle}</h1>
        <p className="text-sm text-muted-foreground mb-4">
          {startStr} ~ {endStr}
          {invoiceFilterActive && ` · ${t("outInvoiceSearchPh") || tt("outInvoiceSearchPh", "인보이스번호 검색")}: ${invoiceSearch.trim()}`}
          {storeFilter !== "All" && (isRec ? ` · ${t("outColStore")}: ${storeFilter}` : ` · ${t("payColAttributedStore") || tt("payColAttributedStore", "Attributed Store")}: ${formatAttributedStoreLabel(storeFilter)}`)}
          {!isRec && vendorFilter !== "All" && ` · ${t("vendor")}: ${vendorFilter}`}
        </p>
        {listData.length > 0 && (
          <div className="space-y-6">
            {listData.map((item, idx) => {
              const displayItems = filterItemsByUnpaid(item.items, isRec)
              if (displayItems.length === 0) return null
              const name = isRec ? (item.storeName ?? "") : formatVendorDisplay(item.vendorCode)
              const key = isRec ? (item.storeName ?? `rec-${idx}`) : (item.vendorCode ?? `pay-${idx}`)
              return (
                <div key={key} className="break-inside-avoid">
                  <h2 className="font-semibold text-sm mb-1">{name}</h2>
                  <p className="text-primary font-bold mb-2">{fmtBaht(item.balance ?? 0)}</p>
                  <table className="w-full text-sm border-collapse table-fixed">
                    <thead>
                      <tr className="border-b">
                        <th className="text-center py-1 px-2 w-[115px]">{t("date") || "Date"}</th>
                        <th className="text-center py-1 px-2 w-[95px]">{t("type") || "Type"}</th>
                        {isRec && (
                          <th className="text-center py-1 px-2 w-[150px] whitespace-nowrap">
                            {t("recColInvoiceNo") || t("recColOrderNo") || "Invoice No"}
                          </th>
                        )}
                        {isRec && (
                          <th className="text-center py-1 px-2 w-[160px] whitespace-nowrap">
                            {t("recColTaxInvoiceDocNo") || "Tax-Invoice/Receipt No"}
                          </th>
                        )}
                        {!isRec && <th className="text-center py-1 px-2 w-[100px]">{t("poInvoice") || "Invoice"}</th>}
                        {!isRec && (
                          <th className="text-center py-1 px-2 w-[100px] whitespace-nowrap">
                            {t("payColAttributedStore") || tt("payColAttributedStore", "Attributed Store")}
                          </th>
                        )}
                        <th className="text-center py-1 px-2 w-[95px]">{isRec ? (t("recColReceiveStatus") || "Receive Status") : (t("payColPaymentStatus") || "Payment Status")}</th>
                        {isRec && <th className="text-center py-1 px-2 w-[88px] whitespace-nowrap">{t("recColReceiveCheck") || "Collection Check"}</th>}
                        <th className="text-center py-1 px-2 w-[135px]">{t("amount") || "Amount"}</th>
                        <th className="text-center py-1 px-2 min-w-[150px]">{t("memo") || "Memo"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayItems.map((row, i) => {
                        const invCell = !isRec
                          ? ((row as { invoice_received?: boolean; invoice_no?: string }).invoice_received === true
                            ? ((row as { invoice_no?: string }).invoice_no || t("poInvoiceReceived") || "Received")
                            : (row as { invoice_received?: boolean }).invoice_received === false
                              ? (t("poInvoiceNotReceived") || "Not Received")
                              : "-")
                          : null
                        return (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1 px-2">{row.trans_date || "-"}</td>
                          <td className="py-1 px-2">{typeLabel(row.ref_type || "")}</td>
                          {isRec && (
                            <td className="py-1 px-2 w-[150px] whitespace-nowrap">
                              {row.ref_type === "Order" ||
                              row.ref_type === "AccountingPO" ||
                              row.ref_type === "ForceOutbound"
                                ? resolveReceivableOrderNoDisplay(row)
                                : "-"}
                            </td>
                          )}
                          {isRec && (
                            <td className="py-1 px-2 w-[160px] whitespace-nowrap font-mono text-[11px]">
                              {row.ref_type === "Order" ||
                              row.ref_type === "AccountingPO" ||
                              row.ref_type === "ForceOutbound"
                                ? resolveReceivableTaxInvoiceDocNoDisplay(row, taxInvoiceOverrideMap) || "—"
                                : "—"}
                            </td>
                          )}
                          {!isRec && <td className="py-1 px-2 text-center">{invCell}</td>}
                          {!isRec && (
                            <td className="py-1 px-2 text-center text-muted-foreground text-[11px] whitespace-nowrap">
                              {formatAttributedStoreLabel((row as { attributed_store?: string }).attributed_store)}
                            </td>
                          )}
                          <td className="py-1 px-2 text-center">{isRec ? (row.ref_type === "Receive" ? (t("recStatusReceived") || "Received") : (t("recStatusUnpaid") || "Unpaid")) : (row.ref_type === "Payment" ? (t("payStatusPaid") || "Paid") : (t("payStatusUnpaid") || "Unpaid"))}</td>
                          {isRec && (
                            <td className="py-1 px-2 text-center text-sm">
                              {row.ref_type === "Order" || row.ref_type === "ForceOutbound" || row.ref_type === "AccountingPO"
                                ? (row.receive_checked ? (t("recCheckPaid") || "Collected") : (t("recCheckWait") || "Pending"))
                                : "—"}
                            </td>
                          )}
                          <td className="py-1 px-2 text-right">{fmtBahtSigned(row.amount)}</td>
                          <td className="py-1 px-2 text-muted-foreground">{getMemo(row.memo)}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Tabs
        value={tabUi}
        onValueChange={(v) => applyTab(v as "receivable" | "payable")}
        preserveInactiveTabs={false}
        className={adminTabsRootCn}
      >
        <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="receivable" className={adminTabsTriggerCn}>
                <Wallet className={adminTabsIconCn} aria-hidden />
                {t("receivableTab") || "Receivables (Sales)"}
              </TabsTrigger>
              {canSelectStores && (
                <TabsTrigger value="payable" className={adminTabsTriggerCn}>
                  <Building2 className={adminTabsIconCn} aria-hidden />
                  {t("payableTab") || "Payables (Purchase)"}
                </TabsTrigger>
              )}
            </TabsList>
          </AdminTabsBarWithHelp>

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
                      >
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue placeholder={t("recFilterSalesOutletAll") || "All Customers"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">{(t("recFilterSalesOutletAll") || "All Customers")}</SelectItem>
                          {salesOutletOptions.map((s) => (
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
                  {ledgerSummaryMetrics}
                  {canSelectStores ? (
                    <p className="text-xs text-amber-900 dark:text-amber-100/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-md px-3 py-2 mb-3 leading-snug">
                      {tt(
                        "recVsPayPoHint",
                        "※ 발주(PO) 승인·매입 대금은 「미지급금(매입)」에 반영됩니다. 이 탭(미수금)은 매장·매출처 매출 회수(주문·수금)용입니다."
                      )}
                    </p>
                  ) : null}
                  {hasSearchedList && !loading && listSearchTotals.unallocatedBankSum > 0.009 ? (
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
                  ) : !hasSearchedList ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query") || "Click Query button."}</p>
                  ) : listData.length === 0 ? (
                    <div className="py-8 space-y-3 text-center px-2">
                      <p className="text-sm text-muted-foreground">{t("receivableEmpty") || "No receivables found."}</p>
                      {purchaseVendorMatchForOutlet && canSelectStores ? (
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
                    <div className="w-full overflow-x-auto touch-pan-x overscroll-x-contain">
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
                          return (
                          <AccordionItem key={item.storeName!} value={item.storeName!}>
                            <AccordionTrigger className="hover:no-underline px-4 py-3 [&>svg]:ml-2 [&>svg]:shrink-0">
                              <div className={cn(amountGridCols, "flex-1 min-w-0 w-full pr-1")}>
                                  <div className="flex flex-col items-start gap-0.5 min-w-0 text-left pr-2">
                                    <span className="font-semibold break-words leading-snug">{item.storeName}</span>
                                    {item.vendorCode && (
                                      <span className="text-xs text-muted-foreground">
                                        {t("vendor") || "거래처"}: {item.vendorName === item.vendorCode ? item.vendorCode : `${item.vendorName} (${item.vendorCode})`}
                                      </span>
                                    )}
                                    {unallocatedTotal > 0.009 ? (
                                      <span className="text-[10px] font-medium text-amber-800 dark:text-amber-200 leading-snug">
                                        {tt("recUnallocatedBankStoreBadge", "미할당 통장 입금")}{" "}
                                        <span className="tabular-nums">฿{unallocatedTotal.toLocaleString()}</span>
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
                              {unallocatedTotal > 0.009 ? (
                                <div className="mb-3 rounded-md border border-amber-200/80 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 text-xs leading-snug space-y-1.5">
                                  <p>
                                    {tt(
                                      "recUnallocatedBankStoreHint",
                                      "매장 잔액에는 반영됐지만 아래 인보이스에 아직 배분되지 않은 통장 입금입니다. 통장 거래에서 「미수 연결」로 배분하면 수금확인이 자동 반영됩니다."
                                    )}
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {(item.unallocatedBankDeposits || []).map((dep) => (
                                      <Button
                                        key={dep.bankTransactionId}
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-[11px] tabular-nums"
                                        onClick={() =>
                                          openBankTransactionFromReceivable(dep.bankTransactionId, dep.transDate)
                                        }
                                      >
                                        {dep.transDate} · ฿{dep.amountAbs.toLocaleString()} · #{dep.bankTransactionId}
                                      </Button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {tableItems.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">{ledgerNoPeriodRowsHint}</p>
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
                                    <th
                                      className="text-center py-2 px-4 w-[128px] min-w-[128px] font-semibold"
                                      title={tt("recLedgerDateColHint", "위: 매출(발생)일, 아래: 입금(수령)일")}
                                    >
                                      {t("recLedgerDateCol") || tt("recLedgerDateCol", "매출·입금일")}
                                    </th>
                                    <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("type") || "구분"}</th>
                                    <th className="text-center py-2 px-3 w-[150px] min-w-[150px] font-semibold whitespace-nowrap">
                                      {t("recColInvoiceNo") || t("recColOrderNo") || "Invoice No"}
                                    </th>
                                    <th className="text-center py-2 px-3 w-[160px] min-w-[160px] font-semibold whitespace-nowrap">
                                      {t("recColTaxInvoiceDocNo") || "Tax-Invoice/Receipt No"}
                                    </th>
                                    <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("recColReceiveStatus") || "수령여부"}</th>
                                    <th className="text-center py-2 px-2 w-[108px] font-semibold whitespace-nowrap" title={tt("recColReceiveCheckHint", "통장 수금은 「미수 연결」로 처리합니다. 체크는 통장 없는 수금(현금 등) 또는 연동 결과 표시용입니다.")}>
                                      {t("recColReceiveCheck") || "수금확인"}
                                    </th>
                                    <th className="text-center py-2 px-1 w-[76px] text-sm font-bold whitespace-nowrap">
                                      {t("acct_rec_bank_link") || tt("acct_rec_bank_link", "통장")}
                                    </th>
                                    <th className="text-center py-2 px-1 w-[72px] text-sm font-bold whitespace-nowrap">
                                      {t("recColTaxInvoicePrint") || t("recColTaxInvoice") || "Print"}
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
                                      11 +
                                      (showReceivableManualActions ? 1 : 0) +
                                      (showStorePurchaseJournalCol ? 1 : 0)
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
                                                  row.trans_date
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
                                            title={tt("recTaxInvoicePrintTitle", "Tax Invoice/Receipt 인쇄")}
                                            aria-label={tt("recTaxInvoicePrintTitle", "Tax Invoice/Receipt 인쇄")}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              void handleTaxInvoicePrint(row, item)
                                            }}
                                          >
                                            {taxInvoiceLoadingKey ===
                                            (row.ref_type === "Order"
                                              ? `tax-${row.id ?? rowOrderId}`
                                              : row.ref_type === "ForceOutbound"
                                                ? `tax-fo-${row.id ?? rowForceLogId}`
                                                : `tax-apo-${row.id ?? row.ref_id}`) ? (
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
                    </div>
                    </TabPanelHeavyContent>
                  )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

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
                  ) : !hasSearchedList ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query") || "검색 버튼을 눌러 주세요."}</p>
                  ) : listData.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("payableEmpty") || "조회된 미지급금이 없습니다."}</p>
                  ) : (
                    <TabPanelHeavyContent
                      ready={contentTab === "payable"}
                      pendingLabel={tabPanelPendingLabel}
                    >
                    <div className="w-full overflow-x-auto touch-pan-x overscroll-x-contain">
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
                                    <span className="font-semibold break-words leading-snug">{formatVendorDisplay(item.vendorCode)}</span>
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
                                              row.ref_type === "Payment" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                            )}>
                                              {row.ref_type === "Payment" ? (t("payStatusPaid") || "지급") : (t("payStatusUnpaid") || "미지급")}
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
                                                        vendorLabel: formatVendorDisplay(item.vendorCode),
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
                    </div>
                    </TabPanelHeavyContent>
                  )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!(tab === "receivable" && isManagerOnly) && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {addIsOpening
                  ? (t("addOpeningBalance") || "기초 이월 입력")
                  : tab === "receivable"
                    ? (t("addReceive") || "수령 입력")
                    : (t("addPayment") || "지급 입력")}
              </h3>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={addIsOpening}
                  onCheckedChange={(v) => setAddIsOpening(!!v)}
                />
                {t("addOpeningBalanceShort") || "기초 이월"}
              </label>
            </div>
            {addIsOpening && (
              <p className="text-xs text-muted-foreground mb-3">
                {tab === "receivable"
                  ? tt("recOpeningBalanceHintReceivable", "기존 회계에서 이월할 미수금 잔액을 매장별로 입력하세요. (2월 말 기준 권장)")
                  : tt("recOpeningBalanceHintPayable", "기존 회계에서 이월할 미지급금 잔액을 거래처별로 입력하세요. (2월 말 기준 권장)")}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {tab === "receivable" ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")}
                </label>
                <Select value={addEntity} onValueChange={setAddEntity}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue
                      placeholder={
                        tab === "receivable"
                          ? tt("recAddEntitySelectReceivable", "매장 선택")
                          : tt("recAddEntitySelectPayable", "거래처 선택")
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {tab === "receivable"
                      ? receivableStores.map((s) => (
                          <SelectItem key={s} value={s}>{formatStoreLabel(s)}</SelectItem>
                        ))
                      : vendors.map((v) => <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("amount") || "금액"}</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  className="w-[120px] h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("date") || "날짜"}</label>
                <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="w-[140px] h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("memo") || "메모"}</label>
                <Input
                  placeholder={
                    tab === "receivable"
                      ? tt("recReceiveMemoPh", "수령 메모")
                      : tt("recPayMemoPh", "지급 메모")
                  }
                  value={addMemo}
                  onChange={(e) => setAddMemo(e.target.value)}
                  className="w-[160px] h-9"
                />
              </div>
              <Button onClick={handleAdd} disabled={addSaving}>
                {addSaving ? t("loading") : t("btnSave") || "등록"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={receiveCheckDialog != null} onOpenChange={(open) => { if (!open && !updatingReceiveCheckId) setReceiveCheckDialog(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("recReceiveCheckDialogTitle") || tt("recReceiveCheckDialogTitle", "수금 완료 — 입금일")}</DialogTitle>
            <DialogDescription>
              {t("recReceiveCheckDialogHint") ||
                tt(
                  "recReceiveCheckDialogHint",
                  "매출(발생)일과 별도로 실제 입금(수령)일을 입력합니다. 저장하면 입금 행이 생성되어 매출·입금 2줄로 표시됩니다."
                )}
            </DialogDescription>
          </DialogHeader>
          {receiveCheckDialog ? (
            <div className="space-y-3 py-1">
              {receiveCheckDialog.invoiceLabel ? (
                <p className="text-sm text-muted-foreground truncate">{receiveCheckDialog.invoiceLabel}</p>
              ) : null}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {t("recLedgerReceiveDateShort") || tt("recLedgerReceiveDateShort", "입금일")}
                </label>
                <Input
                  type="date"
                  value={receiveCheckDialog.receiveDate}
                  onChange={(e) =>
                    setReceiveCheckDialog((prev) => (prev ? { ...prev, receiveDate: e.target.value } : null))
                  }
                  className="h-9"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={!!updatingReceiveCheckId}
              onClick={() => setReceiveCheckDialog(null)}
            >
              {t("btnClose") || "닫기"}
            </Button>
            <Button
              type="button"
              disabled={!!updatingReceiveCheckId || !receiveCheckDialog?.receiveDate}
              onClick={() => {
                if (!receiveCheckDialog) return
                void handleReceiveCheckChange({
                  receivableId: receiveCheckDialog.receivableId,
                  receiveChecked: true,
                  outletStoreName: receiveCheckDialog.outletStoreName,
                  receiveDate: receiveCheckDialog.receiveDate,
                })
              }}
            >
              {updatingReceiveCheckId ? t("loading") : t("btnSave") || "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualEdit != null} onOpenChange={(open) => { if (!open && !manualEditSaving) setManualEdit(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {manualEdit?.ledger === "payable"
                ? t("payManualEditTitle") || "지급·기초이월 수정"
                : t("recManualEditTitle") || "수령·기초이월 수정"}
            </DialogTitle>
            <DialogDescription>
              {t("manualBalanceEditHint") ||
                "통장·주문·발주·입고 연동 건은 이 화면에서 수정할 수 없습니다."}
            </DialogDescription>
          </DialogHeader>
          {manualEdit ? (
            <div className="space-y-3 py-1">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {manualEdit.ledger === "receivable" ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")}
                </label>
                {manualEdit.ledger === "receivable" ? (
                  canSelectStores ? (
                    <Select
                      value={manualEdit.entity}
                      onValueChange={(v) => setManualEdit((prev) => (prev ? { ...prev, entity: v } : null))}
                    >
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder={t("outColStore") || "매출처"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(storeList || []).map((s) => (
                          <SelectItem key={s} value={resolveStoreKey(s)}>
                            {formatStoreLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={formatStoreLabel(manualEdit.entity)} readOnly className="h-9 bg-muted/40" />
                  )
                ) : (
                  <Select
                    value={manualEdit.entity}
                    onValueChange={(v) => setManualEdit((prev) => (prev ? { ...prev, entity: v } : null))}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder={t("vendor") || "매입처"} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((v) => (
                        <SelectItem key={v.code} value={v.code}>
                          {v.name || v.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[120px]">
                  <label className="text-xs text-muted-foreground block mb-1">{t("amount") || "금액"}</label>
                  <Input
                    type="number"
                    value={manualEdit.amount}
                    onChange={(e) => setManualEdit((prev) => (prev ? { ...prev, amount: e.target.value } : null))}
                    className="h-9"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted-foreground block mb-1">{t("date") || "날짜"}</label>
                  <Input
                    type="date"
                    value={manualEdit.date}
                    onChange={(e) => setManualEdit((prev) => (prev ? { ...prev, date: e.target.value } : null))}
                    className="h-9"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("memo") || "메모"}</label>
                <Input
                  value={manualEdit.memo}
                  onChange={(e) => setManualEdit((prev) => (prev ? { ...prev, memo: e.target.value } : null))}
                  className="h-9"
                  placeholder={
                    manualEdit.refType === "Opening"
                      ? t("recTypeOpening") || "기초이월"
                      : manualEdit.ledger === "receivable"
                        ? tt("recReceiveMemoPh", "수령 메모")
                        : tt("recPayMemoPh", "지급 메모")
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            {manualEdit ? (
              <Button
                type="button"
                variant="destructive"
                disabled={manualEditSaving}
                onClick={() => void handleManualBalanceDelete(manualEdit.ledger, manualEdit.id)}
              >
                {t("delete") || "삭제"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={manualEditSaving} onClick={() => setManualEdit(null)}>
              {t("btnClose") || "닫기"}
            </Button>
            <Button type="button" disabled={manualEditSaving || !manualEdit} onClick={() => void handleManualBalanceSave()}>
              {manualEditSaving ? t("loading") : t("btnSave") || "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayableSettlementLinkDialog
        open={payableLinkDialog != null}
        onOpenChange={(open) => {
          if (!open) setPayableLinkDialog(null)
        }}
        vendorCode={payableLinkDialog?.vendorCode || ""}
        vendorLabel={payableLinkDialog?.vendorLabel || ""}
        items={payableLinkDialog?.items ?? []}
        settlementLinks={payableLinkDialog?.settlementLinks}
        anchorRow={payableLinkDialog?.anchorRow ?? null}
        t={t}
        tt={tt}
        onSaved={() => {
          publishReceivablePayableListInvalidated()
          void loadList({ fresh: true })
        }}
      />
    </div>
  )
}
