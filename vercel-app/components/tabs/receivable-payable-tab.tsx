"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  buildErpExcelHtmlDocument,
  erpExcelSimpleTableStyle,
  triggerErpExcelHtmlDownload,
} from "@/lib/erp-excel-export"

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
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Wallet, Building2, Landmark } from "lucide-react"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { ReceivableAgingPanel } from "@/components/admin/receivable-aging-panel"
import { BorrowingsLedgerPanel } from "@/components/admin/borrowings-ledger-panel"
import {
  computeLedgerAging,
  emptyAgingBuckets,
} from "@/lib/receivable-aging"
import {
  sumReceivablePayablePeriodAmounts,
  isPayableWithholdingRow,
  ledgerAccrualStatusById,
  payableLineSettlementKind,
} from "@/lib/receivable-payable-period-totals"
import { PayableSettlementLinkDialog } from "@/components/tabs/payable-settlement-link-dialog"
import { groupPayableLedgerRowsWithLinks } from "@/lib/payable-settlement-link"
import {
  buildBankTransactionDeepLink,
  filterUnallocatedBankDepositsVisible,
  sumUnallocatedBankDeposits,
} from "@/lib/receivable-unallocated-bank"
import { receivablePayableViewCache } from "@/lib/receivable-payable-view-cache"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useErpAllowUrlSync, useErpPageActiveRef } from "@/lib/erp-page-visibility"
import {
  isManagerOrFranchiseeRole,
  isManagerRole,
  canManageReceivablePayableAllStores,
  canUpdateReceivableReceiveCheck,
  canMutateManualPayableBalance,
  canDeleteStorePurchaseJournal,
} from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { getVendorsForPurchase, getVendorsForRelated, getVendorsForSales } from "@/lib/api-client"
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
} from "@/lib/api-client"
import { buildThaiSalesInvoiceData } from "@/lib/thai-sales-invoice-data"
import { roundMoney2 } from "@/lib/invoice-vat-total"
import { formatMoneyBaht } from "@/lib/money-amount"
import { resolveInvoiceClientForTarget, resolveInvoiceClientFromBillToCandidates } from "@/lib/invoice-client-resolve"
import type { InvoiceData } from "@/components/invoice"
import type { InvoiceDataClient, InvoiceDataCompany } from "@/lib/api-client"
import { useSearchParams, useRouter } from "next/navigation"

import { orderIdFromReceivableOrderRow } from "@/lib/receivable-order-id-parse"
import { canonicalOfficeStore } from "@/lib/office-store-canonical"
import {
  type LineItemsCacheEntry,
  type ReceivablePayableListLoadOverrides,
  type ReceivablePayableQueryDraft,
  bangkokTodayStr,
  escapeXml,
  transactionLineRowKey,
  fmtBaht,
  fmtBahtSigned,
  buildClientFromPosTaxMemo,
  cumulativeBalanceKey,
  mergeReceivablePayableCumulativeByKey,
  mergeReceivableCustomerOptions,
  filterReceivableCustomerOptions,
  formatVendorDisplayLabel,
  formatReceivableStoreDisplayLabel,
  receivablePayableListMatchesTab,
  resolveEffectivePayableStoreFilter,
  isOfficeLikeLabel,
  resolveTaxInvoiceClientFromPoBillTo,
  RECEIVABLE_TAX_INVOICE_PRINT_MAX_BATCH,
  collectReceivableTaxInvoicePrintTargets,
  resolveReceivableTaxInvoicePrintSource,
} from "./receivable-payable-tab-utils"
import {
  subscribeReceivablePayableListInvalidated,
  publishReceivablePayableListInvalidated,
} from "@/lib/receivable-payable-list-sync"
import {
  closeReservedInvoicePrintWindow,
  commitReservedInvoicePrintWindow,
  reserveInvoicePrintWindow,
} from "@/lib/open-invoice-print-window"
import {
  buildTaxInvoiceDocNo,
  extractPurchaseOrderNoFromText,
  normalizeTaxInvoiceReferenceNo,
  resolveTaxInvoiceSourceReferenceNo,
} from "@/lib/tax-invoice-doc-no"
import {
  resolveReceivableOrderNoDisplay,
  resolveReceivableTaxInvoiceDocNoDisplay,
} from "@/lib/receivable-invoice-format"
import {
  isReceivableAccrualCollected,
  salesTaxPrintDocumentType,
} from "@/lib/sales-tax-document-title"
import { ReceivablePayableReceivablePanel } from "./receivable-payable-receivable-panel"
import { ReceivablePayablePayablePanel } from "./receivable-payable-payable-panel"
import { ReceivableReceiveCheckDialog } from "./receivable-payable-receive-check-dialog"
import { ReceivableManualEditDialog } from "./receivable-payable-manual-edit-dialog"

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
  const [relatedVendors, setRelatedVendors] = React.useState<{ code: string; name: string }[]>([])

  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const isManagerOnly = isManagerRole(auth?.role || "") // 매장 매니저: 수령 입력 불가
  const managerStore = (auth?.store || "").trim()
  /** 본사/회계직원: 매장별 선택해서 관리 가능 (별도 로그인 불필요) */
  const canSelectStores = canManageReceivablePayableAllStores(auth?.role || "")
  const showStorePurchaseJournalCol = canDeleteStorePurchaseJournal(auth?.role || "")

  const [tab, setTab] = React.useState<"receivable" | "payable" | "borrowings">("receivable")
  const [tabUi, setTabUi] = React.useState<"receivable" | "payable" | "borrowings">("receivable")
  const [, startTabTransition] = React.useTransition()
  const contentTab = React.useDeferredValue(tab)
  const applyTab = React.useCallback((next: "receivable" | "payable" | "borrowings") => {
    setTabUi(next)
    startTabTransition(() => {
      setTab(next)
    })
  }, [])
  React.useEffect(() => {
    setTabUi(tab)
  }, [tab])
  // 미수금: 전체는 본사 미수. 매장/거래처를 고르면 그 채무자 잔액(본사 청구 포함)과 그 매장이 직접 청구한 미수.
  const [salesOutletFilter, setSalesOutletFilter] = React.useState("All")
  const [salesVendors, setSalesVendors] = React.useState<{ code: string; name: string }[]>([])
  const [salesOutletSearch, setSalesOutletSearch] = React.useState("")
  const salesOutletOptions = React.useMemo(
    () => mergeReceivableCustomerOptions(salesVendors, storeList || [], formatStoreLabel),
    [salesVendors, storeList, formatStoreLabel]
  )
  const filteredSalesOutletOptions = React.useMemo(
    () => filterReceivableCustomerOptions(salesOutletOptions, salesOutletSearch, salesOutletFilter),
    [salesOutletOptions, salesOutletSearch, salesOutletFilter]
  )
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
  const [listSourceTab, setListSourceTab] = React.useState<"receivable" | "payable" | null>(null)
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
  const [selectedTaxInvoicePrintKeys, setSelectedTaxInvoicePrintKeys] = React.useState<Set<string>>(
    () => new Set()
  )
  const [taxInvoiceBulkProgress, setTaxInvoiceBulkProgress] = React.useState<{
    current: number
    total: number
  } | null>(null)
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
  const skipTabClearOnMountRef = React.useRef(true)
  const draftHydratedRef = React.useRef(false)
  const viewCacheRestoredRef = React.useRef(false)
  const [listRestoreTick, setListRestoreTick] = React.useState(0)
  const [queryDraftReady, setQueryDraftReady] = React.useState(false)
  const lastFetchedListRef = React.useRef<{
    tab: "receivable" | "payable" | "borrowings"
    startStr: string
    endStr: string
    listData: ReceivablePayableItem[]
    cumulativeSummary: { totalAmount: number; byKey: Record<string, number> }
  } | null>(null)

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

  const taxInvoicePrintSourceError = React.useCallback(
    (row: NonNullable<ReceivablePayableItem["items"]>[number]) => {
      if (row.ref_type === "ForceOutbound") {
        return tt("recTaxInvoiceNoForceLog", "강제출고 내역을 식별할 수 없습니다.")
      }
      if (row.ref_type === "AccountingPO") {
        return tt("recTaxInvoiceNoPoId", "회계 발주를 식별할 수 없습니다.")
      }
      return tt("recTaxInvoiceNoOrderId", "주문을 식별할 수 없습니다.")
    },
    [tt]
  )

  const openTaxInvoicePrintWindow = React.useCallback(
    async (datas: InvoiceData[], reservedWindow: Window) => {
      if (datas.length === 0) {
        closeReservedInvoicePrintWindow(reservedWindow)
        return false
      }
      const result = commitReservedInvoicePrintWindow(reservedWindow, datas)
      if (result === "storage") {
        closeReservedInvoicePrintWindow(reservedWindow)
        await appAlert(
          tt(
            "recTaxInvoiceBulkStorageFail",
            "인쇄 데이터가 너무 큽니다. 선택 건수를 줄인 뒤 다시 시도해 주세요."
          )
        )
        return false
      }
      if (result !== "ok") {
        closeReservedInvoicePrintWindow(reservedWindow)
        await appAlert(tt("recTaxInvoicePopupBlocked", "팝업이 차단되었을 수 있습니다. 팝업 허용 후 다시 시도해 주세요."))
        return false
      }
      return true
    },
    [tt]
  )

  const buildTaxInvoicePrintData = React.useCallback(
    async (
      row: NonNullable<ReceivablePayableItem["items"]>[number],
      recItem: ReceivablePayableItem,
      shared?: {
        company: InvoiceDataCompany
        clients: Record<string, InvoiceDataClient>
        settings: Record<string, string>
      }
    ): Promise<{ ok: true; data: InvoiceData } | { ok: false; message: string }> => {
      const source = resolveReceivableTaxInvoicePrintSource(row)
      if (!source) {
        return { ok: false, message: taxInvoicePrintSourceError(row) }
      }
      const { refType, refId } = source
      try {
        const targetLabel = String(recItem.storeName || recItem.vendorName || "").trim()
        const [lineRes, invoiceDataRes, invSettings, billToCandRes] = await Promise.all([
          getPayableTransactionItems({ refType, refId }),
          shared ? Promise.resolve(null) : getInvoiceData(),
          shared ? Promise.resolve(null) : getInvoiceSettings(),
          refType === "Order"
            ? getInvoiceOrderBillToCandidates([refId])
            : Promise.resolve({
                map: {} as Record<string, string[]>,
                taxInvoiceClientMap: {} as Record<string, InvoiceDataClient>,
              }),
        ])
        const { items, orderInvoiceTotals, withholdingTaxAmount, withholdingTaxRate, poBillTo, referenceNo: stockReferenceNo } =
          lineRes
        if (!items.length) {
          return { ok: false, message: tt("recTaxInvoiceNoLines", "주문 품목이 없어 세금계산서를 만들 수 없습니다.") }
        }
        const company = shared?.company ?? invoiceDataRes!.company
        const clients = shared?.clients ?? invoiceDataRes!.clients
        const settings =
          shared?.settings ??
          (typeof invSettings === "object" && invSettings !== null ? invSettings : {})
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
        const poNoFromMemo = extractPurchaseOrderNoFromText(row.memo)
        // 회계 PO Invoice 인쇄는 po_no(PO-…) — 구버전 override의 APO/IVF 는 원본 문서번호에 밀림
        const preferredReferenceNo = resolveTaxInvoiceSourceReferenceNo({
          savedReferenceNo,
          businessDocumentNo: erpStockRef || poNoFromMemo,
          ledgerInvoiceNo: outboundRef !== "-" ? outboundRef : "",
          documentNo: savedDocumentNo,
        })
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
            documentType: salesTaxPrintDocumentType(
              isReceivableAccrualCollected(row, recItem.items || [])
            ),
            documentNo: docNo,
            issueDate: dateStr,
            dueDate: dueDateStr,
            referenceNo,
            company,
            client,
            invSettings: settings,
            sourceRefType: refType,
            sourceRefId: refId,
            docKind: "tax",
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
        return { ok: true, data }
      } catch (e) {
        console.error(e)
        return { ok: false, message: t("invLoadFailed") }
      }
    },
    [t, tt, taxInvoicePrintSourceError]
  )

  const handleTaxInvoicePrint = React.useCallback(
    async (
      row: NonNullable<ReceivablePayableItem["items"]>[number],
      recItem: ReceivablePayableItem
    ) => {
      const source = resolveReceivableTaxInvoicePrintSource(row)
      if (!source) {
        await appAlert(taxInvoicePrintSourceError(row))
        return
      }
      const reservedWindow = reserveInvoicePrintWindow()
      if (!reservedWindow) {
        await appAlert(tt("recTaxInvoicePopupBlocked", "팝업이 차단되었을 수 있습니다. 팝업 허용 후 다시 시도해 주세요."))
        return
      }
      setTaxInvoiceLoadingKey(source.loadKey)
      let handedOff = false
      try {
        const result = await buildTaxInvoicePrintData(row, recItem)
        if (!result.ok) {
          closeReservedInvoicePrintWindow(reservedWindow)
          await appAlert(result.message)
          return
        }
        handedOff = await openTaxInvoicePrintWindow([result.data], reservedWindow)
      } catch (e) {
        if (!handedOff) closeReservedInvoicePrintWindow(reservedWindow)
        console.error(e)
        await appAlert(t("invLoadFailed"))
      } finally {
        setTaxInvoiceLoadingKey(null)
      }
    },
    [buildTaxInvoicePrintData, openTaxInvoicePrintWindow, t, taxInvoicePrintSourceError, tt]
  )

  const handleBulkTaxInvoicePrint = React.useCallback(async () => {
    const targets = collectReceivableTaxInvoicePrintTargets<
      ReceivablePayableItem["items"][number],
      ReceivablePayableItem
    >(listData, selectedTaxInvoicePrintKeys)
    if (targets.length === 0) {
      await appAlert(
        tt("recTaxInvoiceBulkNone", "인쇄할 출고 건을 선택해 주세요. 수금(Receive) 행은 선택할 수 없습니다.")
      )
      return
    }
    if (targets.length > RECEIVABLE_TAX_INVOICE_PRINT_MAX_BATCH) {
      await appAlert(
        tt("recTaxInvoiceBulkMax", "한 번에 최대 {n}건까지 인쇄할 수 있습니다. 선택을 줄여 주세요.").replace(
          "{n}",
          String(RECEIVABLE_TAX_INVOICE_PRINT_MAX_BATCH)
        )
      )
      return
    }
    const reservedWindow = reserveInvoicePrintWindow()
    if (!reservedWindow) {
      await appAlert(tt("recTaxInvoicePopupBlocked", "팝업이 차단되었을 수 있습니다. 팝업 허용 후 다시 시도해 주세요."))
      return
    }
    setTaxInvoiceLoadingKey("bulk")
    setTaxInvoiceBulkProgress({ current: 0, total: targets.length })
    let handedOff = false
    try {
      const [invoiceDataRes, invSettings] = await Promise.all([getInvoiceData(), getInvoiceSettings()])
      const shared = {
        company: invoiceDataRes.company,
        clients: invoiceDataRes.clients,
        settings: typeof invSettings === "object" && invSettings !== null ? invSettings : {},
      }
      const datas: InvoiceData[] = []
      const failed: string[] = []
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]!
        setTaxInvoiceBulkProgress({ current: i + 1, total: targets.length })
        const result = await buildTaxInvoicePrintData(target.row, target.item, shared)
        if (result.ok) datas.push(result.data)
        else failed.push(result.message)
      }
      if (datas.length > 0) {
        handedOff = await openTaxInvoicePrintWindow(datas, reservedWindow)
        if (handedOff && failed.length === 0) {
          setSelectedTaxInvoicePrintKeys(new Set())
        }
      } else {
        closeReservedInvoicePrintWindow(reservedWindow)
      }
      if (failed.length > 0) {
        const detail = [...new Set(failed)].slice(0, 3).join(" · ")
        await appAlert(
          tt("recTaxInvoiceBulkPartial", "{ok}건 준비, {fail}건은 건너뜀: {detail}")
            .replace("{ok}", String(datas.length))
            .replace("{fail}", String(failed.length))
            .replace("{detail}", detail)
        )
      }
    } catch (e) {
      if (!handedOff) closeReservedInvoicePrintWindow(reservedWindow)
      console.error(e)
      await appAlert(t("invLoadFailed"))
    } finally {
      setTaxInvoiceLoadingKey(null)
      setTaxInvoiceBulkProgress(null)
    }
  }, [
    buildTaxInvoicePrintData,
    listData,
    openTaxInvoicePrintWindow,
    selectedTaxInvoicePrintKeys,
    t,
    tt,
  ])

  React.useEffect(() => {
    setSelectedTaxInvoicePrintKeys(new Set())
  }, [listData])

  React.useEffect(() => {
    if (tab !== "receivable") setSelectedTaxInvoicePrintKeys(new Set())
  }, [tab])

  const toggleTaxInvoicePrintKey = React.useCallback((key: string, next: boolean) => {
    setSelectedTaxInvoicePrintKeys((prev) => {
      const n = new Set(prev)
      if (next) n.add(key)
      else n.delete(key)
      return n
    })
  }, [])

  const toggleTaxInvoicePrintKeys = React.useCallback((keys: string[], selectAll: boolean) => {
    setSelectedTaxInvoicePrintKeys((prev) => {
      const n = new Set(prev)
      if (selectAll) keys.forEach((k) => n.add(k))
      else keys.forEach((k) => n.delete(k))
      return n
    })
  }, [])

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
    getVendorsForRelated()
      .then((rows) => setRelatedVendors(rows || []))
      .catch(() => setRelatedVendors([]))
  }, [])

  // 매출처 목록: vendor code + 표시명 (매장 마스터는 salesOutletOptions에서 합침)
  React.useEffect(() => {
    const load = async () => {
      const sales = (await getVendorsForSales()) || []
      const seen = new Set<string>()
      setSalesVendors((sales || []).filter((v) => {
        const c = String(v.code || "").trim()
        if (!c || seen.has(c)) return false
        seen.add(c)
        return true
      }))
    }
    load().catch(() => setSalesVendors([]))
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
    if (!canSelectStores && isManager && (tab === "payable" || tab === "borrowings")) applyTab("receivable")
  }, [canSelectStores, isManager, tab, applyTab])

  const loadList = React.useCallback(
    async (opts?: {
      fresh?: boolean
      overrides?: ReceivablePayableListLoadOverrides
      /** 다른 탭에서 온 무효화 알림으로 재조회할 때 — ping-pong 방지 */
      skipCrossTabNotify?: boolean
    }) => {
      const seq = ++listLoadSeqRef.current
      const effectiveTab = opts?.overrides?.type ?? tabUi
      if (effectiveTab !== "receivable" && effectiveTab !== "payable") return
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
        const nextList = listRes.list || []
        if (String(listRes.type || "").trim() && String(listRes.type).trim() !== effectiveTab) return
        if (!receivablePayableListMatchesTab(effectiveTab, nextList)) return
        setListData(nextList)
        setListSourceTab(effectiveTab)
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
        const nextSummary = { totalAmount, byKey }
        setCumulativeSummary(nextSummary)
        lastFetchedListRef.current = {
          tab: effectiveTab,
          startStr,
          endStr,
          listData: nextList,
          cumulativeSummary: nextSummary,
        }
        if (opts?.fresh && !opts?.skipCrossTabNotify) {
          publishReceivablePayableListInvalidated()
        }
      } catch {
        if (seq !== listLoadSeqRef.current) return
        setListData([])
        setListSourceTab(null)
        setCumulativeSummary({ totalAmount: 0, byKey: {} })
      } finally {
        if (seq === listLoadSeqRef.current) setLoading(false)
      }
    },
    [tabUi, recStoreFilter, payableStoreFilter, vendorFilter, invoiceSearch, startStr, endStr, auth?.store, auth?.role, canSelectStores, storeList]
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
    skipNextTabClearRef.current = true
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
      const type = tabUi === "receivable" || tabUi === "payable" ? tabUi : undefined
      void loadList({
        fresh: true,
        skipCrossTabNotify: true,
        overrides: type ? { type } : undefined,
      })
    })
  }, [loadList, tabUi])

  const handleLoadList = React.useCallback(() => {
    setHasSearchedList(true)
    void loadList({
      fresh: true,
      overrides: tabUi === "receivable" || tabUi === "payable" ? { type: tabUi } : undefined,
    })
  }, [loadList, tabUi])

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
      typeParam === "borrowings" ||
      Boolean(storeParam) ||
      Boolean(startParam) ||
      Boolean(endParam) ||
      Boolean(bankTxParam)
    if (!hasDeepLink) return
    urlDeepLinkAppliedRef.current = true
    if (typeParam === "receivable" || typeParam === "payable" || typeParam === "borrowings") applyTab(typeParam)
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

  React.useLayoutEffect(() => {
    if (viewCacheRestoredRef.current) return
    if (!pageActiveRef.current || !allowReceivableUrlSync) return
    viewCacheRestoredRef.current = true
    const typeParam = searchParams.get("type")
    const storeParam = searchParams.get("storeFilter") || searchParams.get("store")
    const startParam = searchParams.get("startStr") || searchParams.get("start")
    const endParam = searchParams.get("endStr") || searchParams.get("end")
    const bankTxParam = searchParams.get("bankTransactionId")
    const hasDeepLink =
      typeParam === "receivable" ||
      typeParam === "payable" ||
      typeParam === "borrowings" ||
      Boolean(storeParam) ||
      Boolean(startParam) ||
      Boolean(endParam) ||
      Boolean(bankTxParam)
    if (hasDeepLink) return
    const snap = receivablePayableViewCache.read()
    if (!snap || !snap.hasSearchedList) return
    const snapTab = snap.tab === "payable" ? "payable" : "receivable"
    if (!receivablePayableListMatchesTab(snapTab, snap.listData || [])) {
      restoreReceivablePayableQueryDraft(snap)
      draftHydratedRef.current = true
      setQueryDraftReady(true)
      return
    }
    skipNextTabClearRef.current = true
    restoreReceivablePayableQueryDraft(snap)
    setListData(snap.listData || [])
    setListSourceTab(snapTab)
    setCumulativeSummary(snap.cumulativeSummary || { totalAmount: 0, byKey: {} })
    setHasSearchedList(true)
    lastFetchedListRef.current = {
      tab: snap.tab === "payable" ? "payable" : "receivable",
      startStr: snap.startStr || "",
      endStr: snap.endStr || "",
      listData: snap.listData || [],
      cumulativeSummary: snap.cumulativeSummary || { totalAmount: 0, byKey: {} },
    }
    restoreQueryListRef.current = false
    draftHydratedRef.current = true
    setQueryDraftReady(true)
  }, [allowReceivableUrlSync, pageActiveRef, restoreReceivablePayableQueryDraft, searchParams])

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
      typeParam === "borrowings" ||
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
    void loadList({
      fresh: true,
      overrides: tabUi === "receivable" || tabUi === "payable" ? { type: tabUi } : undefined,
    })
  }, [listRestoreTick, loadList, tabUi])

  React.useEffect(() => {
    if (!pendingDeepLinkSearch) return
    setPendingDeepLinkSearch(false)
    setHasSearchedList(true)
    void loadList({
      fresh: true,
      overrides: tabUi === "receivable" || tabUi === "payable" ? { type: tabUi } : undefined,
    })
  }, [pendingDeepLinkSearch, loadList, tabUi])

  React.useEffect(() => {
    if (skipTabClearOnMountRef.current) {
      skipTabClearOnMountRef.current = false
      return
    }
    if (skipNextTabClearRef.current) {
      skipNextTabClearRef.current = false
      return
    }
    listLoadSeqRef.current += 1
    setHasSearchedList(false)
    setListData([])
    setListSourceTab(null)
    setCumulativeSummary({ totalAmount: 0, byKey: {} })
    setLoading(false)
  }, [tabUi])

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

  React.useEffect(() => {
    if (!queryDraftReady || !hasSearchedList) return
    const fetched = lastFetchedListRef.current
    if (!fetched || (fetched.tab !== "receivable" && fetched.tab !== "payable")) return
    receivablePayableViewCache.save({
      tab: fetched.tab,
      startStr: fetched.startStr,
      endStr: fetched.endStr,
      salesOutletFilter,
      payableStoreFilter,
      vendorFilter,
      invoiceSearch,
      filterUnpaidOnly,
      ledgerViewMode,
      hasSearchedList: true,
      listData: fetched.listData,
      cumulativeSummary: fetched.cumulativeSummary,
    })
  }, [
    endStr,
    filterUnpaidOnly,
    hasSearchedList,
    invoiceSearch,
    ledgerViewMode,
    listData,
    payableStoreFilter,
    queryDraftReady,
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
    (bankTransactionId: number, transDate?: string, accountId?: number | string | null) => {
      router.push(
        buildBankTransactionDeepLink({
          bankTransactionId,
          transDate,
          accountId,
        })
      )
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
    if (tab !== "receivable" && tab !== "payable") return
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

  const vendorDisplayRows = React.useMemo(
    () => [...vendors, ...salesVendors, ...relatedVendors, ...salesOutletOptions],
    [vendors, salesVendors, relatedVendors, salesOutletOptions]
  )
  const formatVendorDisplay = React.useCallback(
    (vendorCode?: string, knownName?: string | null) =>
      formatVendorDisplayLabel(vendorCode, vendorDisplayRows, knownName),
    [vendorDisplayRows]
  )
  const formatReceivableStoreDisplay = React.useCallback(
    (item: { storeName?: string; vendorCode?: string; vendorName?: string }) =>
      formatReceivableStoreDisplayLabel(item),
    []
  )

  const formatPayableRefTypeLabel = (refType?: string) => {
    if (refType === "Opening") return t("recTypeOpening") || "기초이월"
    if (refType === "PO") return t("payTypePO") || "발주"
    if (refType === "Inbound") return t("payTypeInbound") || tt("payTypeInbound", "입고")
    if (refType === "Payment") return t("payTypePayment") || "지급"
    if (isPayableWithholdingRow(refType)) return t("payTypeWithholding") || "원천세"
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
      if (tab !== "receivable" && tab !== "payable") {
        return item.cumulativeBalance != null && Number.isFinite(item.cumulativeBalance)
          ? item.cumulativeBalance
          : undefined
      }
      const keyTab =
        listSourceTab === "receivable" || listSourceTab === "payable" ? listSourceTab : tab
      const key = cumulativeBalanceKey(keyTab, item)
      if (key) {
        const fromMap = cumulativeSummary.byKey[key]
        if (fromMap != null && Number.isFinite(fromMap)) return fromMap
      }
      if (item.cumulativeBalance != null && Number.isFinite(item.cumulativeBalance)) {
        return item.cumulativeBalance
      }
      return undefined
    },
    [tab, listSourceTab, cumulativeSummary.byKey]
  )

  const listMatchesVisibleTab =
    (tabUi === "receivable" || tabUi === "payable") && listSourceTab === tabUi
  const showLedgerList = hasSearchedList && listMatchesVisibleTab

  const listSearchTotals = React.useMemo(() => {
    let accrualSum = 0
    let settlementSum = 0
    let balanceSum = 0
    let cumulativeSum = 0
    let unallocatedBankSum = 0
    let count = 0
    if (!listMatchesVisibleTab) {
      return { accrualSum: 0, settlementSum: 0, balanceSum: 0, cumulativeSum: 0, unallocatedBankSum: 0, count: 0 }
    }
    for (const item of listData) {
      const allItems = item.items ?? []
      const period = sumReceivablePayablePeriodAmounts(allItems)
      accrualSum += period.salesSum
      settlementSum += period.receiveSum
      balanceSum += period.periodNet
      const cumulativeBal = getCumulativeBalanceForItem(item)
      if (cumulativeBal != null) cumulativeSum += cumulativeBal
      unallocatedBankSum += sumUnallocatedBankDeposits(
        filterUnallocatedBankDepositsVisible(item.unallocatedBankDeposits || [])
      )
      count += 1
    }
    return { accrualSum, settlementSum, balanceSum, cumulativeSum, unallocatedBankSum, count }
  }, [listData, listMatchesVisibleTab, tab, getCumulativeBalanceForItem])

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
    () =>
      tab === "receivable" || tab === "payable"
        ? computeLedgerAging(listData, tab, endStr)
        : { buckets: emptyAgingBuckets(), total: 0, openLineCount: 0 },
    [listData, tab, endStr]
  )

  const amountGridCols =
    "grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(6rem,1fr))] gap-x-2 sm:gap-x-3 gap-y-1 items-center w-full min-w-0"
  const ledgerSummaryHeaderCellCn = "text-center min-w-0 px-1 text-sm sm:text-sm leading-tight"
  /** table-fixed+w-full은 모바일에서 뒤쪽 금액 열이 0폭으로 잘림 → min-width + 가로 스크롤 */
  const ledgerDetailTableCn = "min-w-[1190px] w-max max-w-none text-sm border-separate border-spacing-0"

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
    const payStatusText = (kind: "withholding" | "paid" | "partial" | "unpaid") =>
      kind === "withholding"
        ? (t("payStatusWithholding") || "WHT")
        : kind === "paid"
          ? (t("payStatusPaid") || "Paid")
          : kind === "partial"
            ? (t("payStatusPartial") || "Partial")
            : (t("payStatusUnpaid") || "Unpaid")
    const header = isRec
      ? [
          entityCol,
          t("date") || "Date",
          t("type") || "Type",
          tt("recColInvoiceNo", "인보이스번호"),
          tt("recColTaxInvoiceDocNo", "세금계산서번호"),
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
      const name = isRec
        ? formatReceivableStoreDisplay(item)
        : formatVendorDisplay(item.vendorCode, item.vendorName)
      const payableStatusById = isRec
        ? new Map<number, "settled" | "open" | "partial" | "standalone">()
        : ledgerAccrualStatusById(
            groupPayableLedgerRowsWithLinks(
              item.items ?? [],
              (item.settlementLinks ?? []).map((l) => ({
                payment_id: l.paymentId,
                accrual_id: l.accrualId,
              }))
            )
          )
      const typeLabel = (ref: string) =>
        ref === "Opening"
          ? typeOpening
          : ref === "AccountingPO"
            ? typeAccountingPo
            : ref === "ForceOutbound"
              ? typeForceOutbound
              : ref === "Inbound"
                ? typeInbound
              : isPayableWithholdingRow(ref)
                ? (t("payTypeWithholding") || "WHT")
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
                payStatusText(payableLineSettlementKind(row, payableStatusById)),
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
          : isPayableWithholdingRow(ref)
            ? (t("payTypeWithholding") || "WHT")
          : ref === (isRec ? "Order" : "PO")
            ? isRec
              ? (t("recTypeOrder") || "Order")
              : (t("payTypePO") || "PO")
            : isRec
              ? (t("recTypeReceive") || "Receive")
              : (t("payTypePayment") || "Payment")

  const ledgerSummaryMetrics =
    hasSearchedList && !loading && showLedgerList ? (
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
      {(tab === "receivable" || tab === "payable") && showLedgerList && !loading && ledgerAging.openLineCount > 0 ? (
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
              const name = isRec
                ? formatReceivableStoreDisplay(item)
                : formatVendorDisplay(item.vendorCode, item.vendorName)
              const key = isRec ? (item.storeName ?? `rec-${idx}`) : (item.vendorCode ?? `pay-${idx}`)
              const payableStatusById = isRec
                ? new Map<number, "settled" | "open" | "partial" | "standalone">()
                : ledgerAccrualStatusById(
                    groupPayableLedgerRowsWithLinks(
                      item.items ?? [],
                      (item.settlementLinks ?? []).map((l) => ({
                        payment_id: l.paymentId,
                        accrual_id: l.accrualId,
                      }))
                    )
                  )
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
                            {tt("recColInvoiceNo", "인보이스번호")}
                          </th>
                        )}
                        {isRec && (
                          <th className="text-center py-1 px-2 w-[160px] whitespace-nowrap">
                            {tt("recColTaxInvoiceDocNo", "세금계산서번호")}
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
                        const payKind = isRec ? null : payableLineSettlementKind(row, payableStatusById)
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
                          <td className="py-1 px-2 text-center">{isRec ? (row.ref_type === "Receive" ? (t("recStatusReceived") || "Received") : (t("recStatusUnpaid") || "Unpaid")) : payKind === "withholding" ? (t("payStatusWithholding") || "WHT") : payKind === "paid" ? (t("payStatusPaid") || "Paid") : payKind === "partial" ? (t("payStatusPartial") || "Partial") : (t("payStatusUnpaid") || "Unpaid")}</td>
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
        onValueChange={(v) => applyTab(v as "receivable" | "payable" | "borrowings")}
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
              {canSelectStores && (
                <TabsTrigger value="borrowings" className={adminTabsTriggerCn}>
                  <Landmark className={adminTabsIconCn} aria-hidden />
                  {tt("borrowingsTab", "차입금")}
                </TabsTrigger>
              )}
            </TabsList>
          </AdminTabsBarWithHelp>

        <TabsContent value="borrowings" className={cn(adminTabsContentCn, "space-y-4")}>
          <BorrowingsLedgerPanel />
        </TabsContent>

        <ReceivablePayableReceivablePanel
          amountGridCols={amountGridCols}
          auth={auth}
          canSelectStores={canSelectStores}
          contentTab={contentTab}
          cumulativeColLabel={cumulativeColLabel}
          cumulativeSummary={cumulativeSummary}
          endStr={endStr}
          expandedPayableRowId={expandedPayableRowId}
          filteredSalesOutletOptions={filteredSalesOutletOptions}
          filterItemsByUnpaid={filterItemsByUnpaid}
          filterRowsByLedgerPeriod={filterRowsByLedgerPeriod}
          filterUnpaidOnly={filterUnpaidOnly}
          formatPriorBalanceHint={formatPriorBalanceHint}
          formatReceivableStoreDisplay={formatReceivableStoreDisplay}
          formatVendorDisplay={formatVendorDisplay}
          getCumulativeBalanceForItem={getCumulativeBalanceForItem}
          getMemo={getMemo}
          handleBulkTaxInvoicePrint={handleBulkTaxInvoicePrint}
          handleExcel={handleExcel}
          handleLoadList={handleLoadList}
          handleManualBalanceDelete={handleManualBalanceDelete}
          handlePrint={handlePrint}
          handleReceiveCheckChange={handleReceiveCheckChange}
          handleTaxInvoicePrint={handleTaxInvoicePrint}
          hasSearchedList={hasSearchedList}
          invoiceSearch={invoiceSearch}
          isManager={isManager}
          jumpToPayableForMatchedVendor={jumpToPayableForMatchedVendor}
          ledgerDetailTableCn={ledgerDetailTableCn}
          ledgerNoPeriodRowsHint={ledgerNoPeriodRowsHint}
          ledgerPairLabels={ledgerPairLabels}
          ledgerSummaryHeaderCellCn={ledgerSummaryHeaderCellCn}
          ledgerSummaryMetrics={ledgerSummaryMetrics}
          ledgerViewMode={ledgerViewMode}
          ledgerViewModeSelect={ledgerViewModeSelect}
          listData={listData}
          listSearchTotals={listSearchTotals}
          loading={loading}
          loadingItemsFor={loadingItemsFor}
          managerStore={managerStore}
          manualEditSaving={manualEditSaving}
          openBankTransactionFromReceivable={openBankTransactionFromReceivable}
          openManualBalanceEdit={openManualBalanceEdit}
          openReceiveCheckDialog={openReceiveCheckDialog}
          payableItemsCache={payableItemsCache}
          purchaseVendorMatchForOutlet={purchaseVendorMatchForOutlet}
          rowHighlightsBankTx={rowHighlightsBankTx}
          salesOutletFilter={salesOutletFilter}
          salesOutletSearch={salesOutletSearch}
          selectedTaxInvoicePrintKeys={selectedTaxInvoicePrintKeys}
          setEndStr={setEndStr}
          setFilterUnpaidOnly={setFilterUnpaidOnly}
          setInvoiceSearch={setInvoiceSearch}
          setSalesOutletFilter={setSalesOutletFilter}
          setSalesOutletSearch={setSalesOutletSearch}
          setSelectedTaxInvoicePrintKeys={setSelectedTaxInvoicePrintKeys}
          setStartStr={setStartStr}
          showLedgerList={showLedgerList}
          showReceivableManualActions={showReceivableManualActions}
          showStorePurchaseJournalCol={showStorePurchaseJournalCol}
          startStr={startStr}
          t={t}
          tabPanelPendingLabel={tabPanelPendingLabel}
          taxInvoiceBulkProgress={taxInvoiceBulkProgress}
          taxInvoiceLoadingKey={taxInvoiceLoadingKey}
          taxInvoiceOverrideMap={taxInvoiceOverrideMap}
          toggleLineItemsExpand={toggleLineItemsExpand}
          toggleTaxInvoicePrintKey={toggleTaxInvoicePrintKey}
          toggleTaxInvoicePrintKeys={toggleTaxInvoicePrintKeys}
          tt={tt}
          updatingReceiveCheckId={updatingReceiveCheckId}
        />

        <ReceivablePayablePayablePanel
          amountGridCols={amountGridCols}
          auth={auth}
          canSelectStores={canSelectStores}
          contentTab={contentTab}
          cumulativeColLabel={cumulativeColLabel}
          cumulativeSummary={cumulativeSummary}
          endStr={endStr}
          expandedPayableRowId={expandedPayableRowId}
          filterItemsByUnpaid={filterItemsByUnpaid}
          filterRowsByLedgerPeriod={filterRowsByLedgerPeriod}
          filterUnpaidOnly={filterUnpaidOnly}
          formatAttributedStoreLabel={formatAttributedStoreLabel}
          formatPayableRefTypeLabel={formatPayableRefTypeLabel}
          formatPriorBalanceHint={formatPriorBalanceHint}
          formatStoreLabel={formatStoreLabel}
          formatVendorDisplay={formatVendorDisplay}
          getCumulativeBalanceForItem={getCumulativeBalanceForItem}
          getMemo={getMemo}
          handleExcel={handleExcel}
          handleLoadList={handleLoadList}
          handleManualBalanceDelete={handleManualBalanceDelete}
          handlePrint={handlePrint}
          invoiceSearch={invoiceSearch}
          isManager={isManager}
          ledgerDetailTableCn={ledgerDetailTableCn}
          ledgerNoPeriodRowsHint={ledgerNoPeriodRowsHint}
          ledgerPairLabels={ledgerPairLabels}
          ledgerSummaryHeaderCellCn={ledgerSummaryHeaderCellCn}
          ledgerSummaryMetrics={ledgerSummaryMetrics}
          ledgerViewMode={ledgerViewMode}
          ledgerViewModeSelect={ledgerViewModeSelect}
          listData={listData}
          listSearchTotals={listSearchTotals}
          loading={loading}
          loadingItemsFor={loadingItemsFor}
          managerStore={managerStore}
          manualEditSaving={manualEditSaving}
          openManualBalanceEdit={openManualBalanceEdit}
          payableItemsCache={payableItemsCache}
          payableStoreFilter={payableStoreFilter}
          setEndStr={setEndStr}
          setFilterUnpaidOnly={setFilterUnpaidOnly}
          setInvoiceSearch={setInvoiceSearch}
          setPayableLinkDialog={setPayableLinkDialog}
          setPayableStoreFilter={setPayableStoreFilter}
          setStartStr={setStartStr}
          setVendorFilter={setVendorFilter}
          showLedgerList={showLedgerList}
          showPayableLinkActions={showPayableLinkActions}
          showPayableManualActions={showPayableManualActions}
          startStr={startStr}
          storeList={storeList}
          t={t}
          tab={tab}
          tabPanelPendingLabel={tabPanelPendingLabel}
          toggleLineItemsExpand={toggleLineItemsExpand}
          tt={tt}
          vendorFilter={vendorFilter}
          vendors={vendors}
        />
      </Tabs>

      {tab !== "borrowings" && !(tab === "receivable" && isManagerOnly) && (
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

      <ReceivableReceiveCheckDialog
        handleReceiveCheckChange={handleReceiveCheckChange}
        receiveCheckDialog={receiveCheckDialog}
        setReceiveCheckDialog={setReceiveCheckDialog}
        t={t}
        tt={tt}
        updatingReceiveCheckId={updatingReceiveCheckId}
      />

      <ReceivableManualEditDialog
        canSelectStores={canSelectStores}
        formatStoreLabel={formatStoreLabel}
        handleManualBalanceDelete={handleManualBalanceDelete}
        handleManualBalanceSave={handleManualBalanceSave}
        manualEdit={manualEdit}
        manualEditSaving={manualEditSaving}
        resolveStoreKey={resolveStoreKey}
        setManualEdit={setManualEdit}
        storeList={storeList}
        t={t}
        tt={tt}
        vendors={vendors}
      />

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
