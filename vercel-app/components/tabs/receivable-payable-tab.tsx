"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

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
import { Search, Plus, Wallet, Building2, Printer, FileSpreadsheet, ChevronDown, ChevronRight, RefreshCw, ArrowRightLeft, FileText, PencilLine, Trash2 } from "lucide-react"
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
} from "@/lib/receivable-payable-period-totals"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import {
  isManagerOrFranchiseeRole,
  isManagerRole,
  canManageReceivablePayableAllStores,
  canSyncOrderReceivable,
  canBulkReconcileOrderReceivables,
  canUpdateReceivableReceiveCheck,
  canMutateManualReceivableBalance,
  canMutateManualPayableBalance,
} from "@/lib/permissions"
import {
  isManualPayableBalanceRow,
  isManualReceivableBalanceRow,
} from "@/lib/manual-balance-transaction"
import { cn } from "@/lib/utils"
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
  syncOrderReceivable,
  syncOrderReceivableFromOutbound,
  syncAllOrderReceivablesBatch,
  syncAllOrderReceivablesFromOutboundBatch,
  translateTexts,
  type ReceivablePayableItem,
  type PayableTransactionItem,
  type OrderInvoiceTotals,
} from "@/lib/api-client"
import { buildThaiSalesInvoiceData } from "@/lib/thai-sales-invoice-data"
import { roundMoney2 } from "@/lib/invoice-vat-total"
import { resolveInvoiceClientForTarget, resolveInvoiceClientFromBillToCandidates } from "@/lib/invoice-client-resolve"
import { parsePosOrderMemo } from "@/lib/pos-tax-invoice"
import type { InvoiceData } from "@/components/invoice"
import type { InvoiceDataClient } from "@/lib/api-client"

type LineItemsCacheEntry = { items: PayableTransactionItem[]; orderInvoiceTotals?: OrderInvoiceTotals }
import { orderIdFromReceivableOrderRow } from "@/lib/receivable-order-id-parse"
import { receivableStoreGroupKey } from "@/lib/receivable-store-key"

/** 방콕 달력 날짜 (YYYY-MM-DD). 로컬 PC 타임존/UTC와 어긋나면 종료일 필터로 행이 잘릴 수 있음. */
function bangkokTodayStr() {
  return new Date().toLocaleString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 10)
}

function buildTaxInvoiceDocNo(issueDate: string, refText: string): string {
  const dateDigits = String(issueDate || "").replace(/\D/g, "")
  const safeDate = dateDigits.length >= 8 ? dateDigits.slice(0, 8) : bangkokTodayStr().replace(/\D/g, "")
  const yyyymm = safeDate.slice(0, 6)
  const refDigits = String(refText || "").replace(/\D/g, "")
  const suffix = (refDigits.slice(-3) || "1").padStart(3, "0")
  return `IV.${yyyymm}XX-${suffix}`
}

function buildClientFromPosTaxMemo(
  memo: string | undefined,
  fallbackName: string
): InvoiceDataClient | null {
  const parsed = parsePosOrderMemo(memo)
  const tax = parsed.taxInvoice
  if (!tax) return null
  const name = String(tax.name || "").trim() || String(fallbackName || "").trim() || "-"
  const address = String(tax.address || "").trim() || "-"
  const taxId = String(tax.taxId || "").trim() || "-"
  const phone = String(tax.phone || "").trim() || "-"
  return { companyName: name, address, taxId, phone }
}

function cumulativeBalanceKey(tab: "receivable" | "payable", item: ReceivablePayableItem): string {
  if (tab === "receivable") {
    const storeName = String(item.storeName || "").trim()
    return storeName ? receivableStoreGroupKey(storeName) : ""
  }
  return String(item.vendorCode || "").trim().toLowerCase()
}

function buildCumulativeByKey(
  tab: "receivable" | "payable",
  rows: { storeName?: string; vendorCode?: string; balance?: number }[]
): Record<string, number> {
  const byKey: Record<string, number> = {}
  for (const row of rows) {
    const key =
      tab === "receivable"
        ? receivableStoreGroupKey(String(row.storeName || ""))
        : String(row.vendorCode || "").trim().toLowerCase()
    if (!key) continue
    byKey[key] = (byKey[key] || 0) + Number(row.balance ?? 0)
  }
  return byKey
}

function isOfficeLikeLabel(label: string): boolean {
  const v = String(label || "").trim().toLowerCase()
  if (!v) return false
  return (
    v.includes("본사") ||
    v.includes("office") ||
    v.includes("hq") ||
    v.includes("head office") ||
    v.includes("headoffice")
  )
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
  const { posStores: storeList, formatStoreLabel, resolveStoreKey } = useStoreList()
  const [vendors, setVendors] = React.useState<{ code: string; name: string; bankAccountNo?: string | null }[]>([])

  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const isManagerOnly = isManagerRole(auth?.role || "") // 매장 매니저: 수령 입력 불가
  const managerStore = (auth?.store || "").trim()
  /** 본사/회계직원: 매장별 선택해서 관리 가능 (별도 로그인 불필요) */
  const canSelectStores = canManageReceivablePayableAllStores(auth?.role || "")
  const showRecSyncBtn = canSyncOrderReceivable(auth?.role || "")
  const showBulkRecSyncBtn = canBulkReconcileOrderReceivables(auth?.role || "")

  const [tab, setTab] = React.useState<"receivable" | "payable">("receivable")
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
  const [listData, setListData] = React.useState<ReceivablePayableItem[]>([])
  const [cumulativeSummary, setCumulativeSummary] = React.useState<{ totalAmount: number; byKey: Record<string, number> }>({
    totalAmount: 0,
    byKey: {},
  })
  const [loading, setLoading] = React.useState(false)
  const [filterUnpaidOnly, setFilterUnpaidOnly] = React.useState(false)

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
  const [syncPair, setSyncPair] = React.useState<{ orderId: number; kind: "cart" | "outbound" } | null>(null)
  const [updatingReceiveCheckId, setUpdatingReceiveCheckId] = React.useState<number | null>(null)
  const [bulkRecSyncing, setBulkRecSyncing] = React.useState(false)
  const [bulkRecProgress, setBulkRecProgress] = React.useState("")
  const [bulkOutboundRecSyncing, setBulkOutboundRecSyncing] = React.useState(false)
  const [bulkOutboundRecProgress, setBulkOutboundRecProgress] = React.useState("")
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

  const showReceivableManualActions = !(tab === "receivable" && isManagerOnly)
  const showPayableManualActions = canSelectStores

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
          await appAlert(tt("recTaxInvoiceNoForceLog", "Cannot identify forced outbound log."))
          return
        }
        refType = "ForceOutbound"
        refId = sid
      } else if (row.ref_type === "AccountingPO") {
        const poId = Number(row.ref_id)
        if (!Number.isFinite(poId) || poId <= 0) {
          await appAlert(tt("recTaxInvoiceNoPoId", "Cannot identify accounting PO."))
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
        const [{ items, orderInvoiceTotals, withholdingTaxAmount, withholdingTaxRate }, invoiceDataRes, invSettings, billToCandRes] =
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
        if (refType === "Order" && refId != null) {
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
        const dateStr = (row.trans_date || "").slice(0, 10) || bangkokTodayStr()
        const refForDoc = (row.invoice_no || "").trim() || String(refId)
        const docNo = buildTaxInvoiceDocNo(dateStr, refForDoc)
        const data: InvoiceData = buildThaiSalesInvoiceData({
          documentType: "Tax Invoice/Receipt",
          documentNo: docNo,
          issueDate: dateStr,
          dueDate: dateStr,
          referenceNo: refType === "ForceOutbound" && (row.invoice_no || "").trim() ? (row.invoice_no || "").trim() : docNo,
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
        })
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
    return () => { cancelled = true }
  }, [listData, lang])

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
    if (!canSelectStores && isManager && tab === "payable") setTab("receivable")
  }, [canSelectStores, isManager, tab])

  const loadList = React.useCallback(() => {
    setLoading(true)
    const listParams = {
      type: tab as "receivable" | "payable",
      storeFilter:
        tab === "receivable" && recStoreFilter !== "All"
          ? recStoreFilter
          : tab === "payable" && payStoreFilter !== "All"
            ? payStoreFilter
            : undefined,
      vendorFilter: tab === "payable" && vendorFilter !== "All" ? vendorFilter : undefined,
      startStr,
      endStr,
      userStore: auth?.store || undefined,
      userRole: auth?.role || undefined,
    }
    const summaryParams = {
      type: tab as "receivable" | "payable",
      endStr,
      storeFilter:
        tab === "receivable" && recStoreFilter !== "All"
          ? recStoreFilter
          : tab === "payable" && payStoreFilter !== "All"
            ? payStoreFilter
            : undefined,
      vendorFilter: tab === "payable" && vendorFilter !== "All" ? vendorFilter : undefined,
      userStore: auth?.store || undefined,
      userRole: auth?.role || undefined,
    }
    Promise.all([getReceivablePayableList(listParams), getReceivablePayableSummary(summaryParams)])
      .then(([listRes, summaryRes]) => {
        setListData(listRes.list || [])
        const byKey = buildCumulativeByKey(tab, summaryRes.list || [])
        const totalAmount = Object.values(byKey).reduce((sum, v) => sum + v, 0)
        setCumulativeSummary({
          totalAmount,
          byKey,
        })
      })
      .catch(() => {
        setListData([])
        setCumulativeSummary({ totalAmount: 0, byKey: {} })
      })
      .finally(() => setLoading(false))
  }, [tab, recStoreFilter, payStoreFilter, vendorFilter, startStr, endStr, auth?.store, auth?.role])

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
        loadList()
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
          loadList()
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
    setTab("payable")
    setVendorFilter(v.code)
    setPayableStoreFilter("All")
    window.setTimeout(() => {
      setLoading(true)
      setHasSearchedList(true)
      const listParams = {
        type: "payable" as const,
        storeFilter: undefined,
        vendorFilter: v.code,
        startStr,
        endStr,
        userStore: auth?.store || undefined,
        userRole: auth?.role || undefined,
      }
      const summaryParams = {
        type: "payable" as const,
        endStr,
        vendorFilter: v.code,
        userStore: auth?.store || undefined,
        userRole: auth?.role || undefined,
      }
      Promise.all([getReceivablePayableList(listParams), getReceivablePayableSummary(summaryParams)])
        .then(([listRes, summaryRes]) => {
          setListData(listRes.list || [])
          const byKey = buildCumulativeByKey("payable", summaryRes.list || [])
          const totalAmount = Object.values(byKey).reduce((sum, v) => sum + v, 0)
          setCumulativeSummary({
            totalAmount,
            byKey,
          })
        })
        .catch(() => {
          setListData([])
          setCumulativeSummary({ totalAmount: 0, byKey: {} })
        })
        .finally(() => setLoading(false))
    }, 0)
  }, [purchaseVendorMatchForOutlet, canSelectStores, startStr, endStr, auth?.store, auth?.role])

  const [hasSearchedList, setHasSearchedList] = React.useState(false)

  const handleLoadList = React.useCallback(() => {
    setHasSearchedList(true)
    loadList()
  }, [loadList])

  const patchListReceiveChecked = React.useCallback((receivableId: number, receiveChecked: boolean) => {
    setListData((prev) =>
      prev.map((grp) => ({
        ...grp,
        items: (grp.items || []).map((r) =>
          r.id === receivableId ? { ...r, receive_checked: receiveChecked } : r
        ),
      }))
    )
  }, [])

  const handleReceiveCheckChange = React.useCallback(
    async (params: {
      receivableId: number
      receiveChecked: boolean
      outletStoreName: string
    }) => {
      const { receivableId, receiveChecked, outletStoreName } = params
      if (!canUpdateReceivableReceiveCheck(auth?.role || "", auth?.store || "", outletStoreName)) return
      setUpdatingReceiveCheckId(receivableId)
      try {
        const res = await updateReceivableReceiveCheck({
          id: receivableId,
          receiveChecked,
          userStore: auth?.store,
          userRole: auth?.role,
        })
        if (res.success) {
          patchListReceiveChecked(receivableId, res.receiveChecked ?? receiveChecked)
        } else {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail") || "Failed")
        }
      } catch (e) {
        await appAlert((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setUpdatingReceiveCheckId(null)
      }
    },
    [auth?.role, auth?.store, patchListReceiveChecked, t]
  )

  const handleSyncOrderReceivable = React.useCallback(
    async (orderId: number | undefined) => {
      if (orderId == null || Number.isNaN(orderId)) return
      setSyncPair({ orderId, kind: "cart" })
      try {
        const res = await syncOrderReceivable({ orderId, userRole: auth?.role })
        if (res.success) {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processSuccess") || "Processed successfully.")
          loadList()
        } else {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail") || "Failed")
        }
      } catch (e) {
        await appAlert((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setSyncPair(null)
      }
    },
    [auth?.role, loadList, t]
  )

  const handleSyncOrderReceivableFromOutbound = React.useCallback(
    async (orderId: number | undefined) => {
      if (orderId == null || Number.isNaN(orderId)) return
      setSyncPair({ orderId, kind: "outbound" })
      try {
        const res = await syncOrderReceivableFromOutbound({ orderId, userRole: auth?.role })
        if (res.success) {
          const msg =
            translateApiMessage(res.message, t) ||
            res.message ||
            t("processSuccess") ||
            "처리되었습니다."
          await appAlert(msg)
          loadList()
        } else {
          await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail") || "Failed")
        }
      } catch (e) {
        await appAlert((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setSyncPair(null)
      }
    },
    [auth?.role, loadList, t]
  )

  const handleBulkSyncOrderReceivables = React.useCallback(async () => {
    const msg =
      salesOutletFilter !== "All"
        ? tt(
            "recBulkSyncConfirmOutlet",
            "선택한 매출처({outlet})의 Order 미수금만 현재 품목·직접정산(지두방) 규칙으로 다시 맞춥니다. 계속할까요?"
          ).replace(/\{outlet\}/g, selectedSalesOutletLabel)
        : tt(
            "recBulkSyncConfirmAll",
            "전체 매출처의 Order 미수금을 현재 품목·직접정산(지두방) 규칙으로 다시 맞춥니다. 시간이 걸릴 수 있습니다. 계속할까요?"
          )
    const ok = await appConfirm(msg)
    if (!ok) return
    setBulkRecSyncing(true)
    let lastReceivableId = 0
    const acc = {
      processed: 0,
      updated: 0,
      removed: 0,
      skipped: 0,
      orphanRemoved: 0,
      errors: 0,
    }
    try {
      for (;;) {
        const r = await syncAllOrderReceivablesBatch({
          lastReceivableId,
          batchSize: 120,
          userRole: auth?.role,
          storeFilter: salesOutletFilter !== "All" ? salesOutletFilter : undefined,
        })
        if (!r.success) {
          await appAlert(translateApiMessage(r.message, t) || r.message || t("processFail") || "Failed")
          break
        }
        const s = r.stats
        if (s) {
          acc.processed += s.processed
          acc.updated += s.updated
          acc.removed += s.removed
          acc.skipped += s.skipped
          acc.orphanRemoved += s.orphanRemoved
          acc.errors += s.errors
        }
        lastReceivableId = Number(r.nextReceivableId ?? lastReceivableId)
        setBulkRecProgress(
          tt("recBulkSyncProgress", `처리 중… 누적 ${acc.processed}건 (갱신 ${acc.updated} / 제거 ${acc.removed} / 스킵 ${acc.skipped})`)
        )
        if (!r.hasMore) {
          const detail =
            (r.errorSamples?.length
              ? `\n${r.errorSamples.map((e) => `#${e.orderId}: ${translateApiMessage(e.message, t) || e.message}`).join("\n")}`
              : "")
          await appAlert(
            tt(
              "recBulkSyncDone",
              "일괄 동기화 완료.\n처리 {processed}건 · 갱신 {updated} · 제거 {removed} · 스킵 {skipped} · 고아 삭제 {orphanRemoved} · 오류 {errors}"
            )
              .replace(/\{processed\}/g, String(acc.processed))
              .replace(/\{updated\}/g, String(acc.updated))
              .replace(/\{removed\}/g, String(acc.removed))
              .replace(/\{skipped\}/g, String(acc.skipped))
              .replace(/\{orphanRemoved\}/g, String(acc.orphanRemoved))
              .replace(/\{errors\}/g, String(acc.errors)) + detail
          )
          loadList()
          break
        }
      }
    } catch (e) {
      await appAlert((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBulkRecSyncing(false)
      setBulkRecProgress("")
    }
  }, [auth?.role, loadList, salesOutletFilter, selectedSalesOutletLabel, t, tt])

  const handleBulkOutboundSyncOrderReceivables = React.useCallback(async () => {
    const msg =
      salesOutletFilter !== "All"
        ? tt(
            "recBulkOutboundSyncConfirmOutlet",
            '선택한 매출처({outlet})의 주문(출고) 미수금과 강제출고 미수금을 출고 관리와 같은 규칙으로 맞춥니다. 계속할까요?'
          ).replace(/\{outlet\}/g, selectedSalesOutletLabel)
        : tt(
            "recBulkOutboundSyncConfirmAll",
            "전체 매출처의 주문(출고) 미수금과 강제출고 미수금을 출고(본사 출고 로그) 기준으로 맞춥니다. 계속할까요?"
          )
    const ok = await appConfirm(msg)
    if (!ok) return
    setBulkOutboundRecSyncing(true)
    let lastReceivableId = 0
    const acc = {
      processed: 0,
      updated: 0,
      removed: 0,
      skipped: 0,
      errors: 0,
      cartFallback: 0,
      forceOutboundProcessed: 0,
      forceOutboundErrors: 0,
    }
    try {
      for (;;) {
        const r = await syncAllOrderReceivablesFromOutboundBatch({
          lastReceivableId,
          batchSize: 120,
          userRole: auth?.role,
          storeFilter: salesOutletFilter !== "All" ? salesOutletFilter : undefined,
        })
        if (!r.success) {
          await appAlert(translateApiMessage(r.message, t) || r.message || t("processFail") || "Failed")
          break
        }
        const s = r.stats
        if (s) {
          acc.processed += s.processed
          acc.updated += s.updated
          acc.removed += s.removed
          acc.skipped += s.skipped
          acc.errors += s.errors
          acc.cartFallback += s.cartFallback
          if (s.forceOutboundProcessed != null) acc.forceOutboundProcessed = s.forceOutboundProcessed
          if (s.forceOutboundErrors != null) acc.forceOutboundErrors = s.forceOutboundErrors
        }
        lastReceivableId = Number(r.nextReceivableId ?? lastReceivableId)
        setBulkOutboundRecProgress(
          tt(
            "recBulkOutboundSyncProgress",
            `출고 맞춤 처리 중… 주문(출고) 누적 ${acc.processed}건 (갱신 ${acc.updated} / 제거 ${acc.removed} / 스킵 ${acc.skipped} / 카트대체 ${acc.cartFallback} / 오류 ${acc.errors}) · 강제출고는 마지막에 일괄 반영됩니다`
          )
            .replace(/\{processed\}/g, String(acc.processed))
            .replace(/\{updated\}/g, String(acc.updated))
            .replace(/\{removed\}/g, String(acc.removed))
            .replace(/\{skipped\}/g, String(acc.skipped))
            .replace(/\{fallback\}/g, String(acc.cartFallback))
            .replace(/\{errors\}/g, String(acc.errors))
        )
        if (!r.hasMore) {
          const detail =
            r.errorSamples?.length
              ? `\n${r.errorSamples.map((e) => `#${e.orderId}: ${translateApiMessage(e.message, t) || e.message}`).join("\n")}`
              : ""
          await appAlert(
            tt(
              "recBulkOutboundSyncDone",
              `출고 기준 일괄 맞춤 완료: 주문(출고) {processed}건 (갱신 {updated} / 제거 {removed} / 스킵 {skipped} / 오류 {errors} / 카트대체 {fallback}) · 강제출고 {forceFc}건 맞춤 (오류 {forceErr})`
            )
              .replace(/\{processed\}/g, String(acc.processed))
              .replace(/\{updated\}/g, String(acc.updated))
              .replace(/\{removed\}/g, String(acc.removed))
              .replace(/\{skipped\}/g, String(acc.skipped))
              .replace(/\{errors\}/g, String(acc.errors))
              .replace(/\{fallback\}/g, String(acc.cartFallback))
              .replace(/\{forceFc\}/g, String(acc.forceOutboundProcessed))
              .replace(/\{forceErr\}/g, String(acc.forceOutboundErrors)) + detail
          )
          loadList()
          break
        }
      }
    } catch (e) {
      await appAlert((t("processFail") || "Failed") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBulkOutboundRecSyncing(false)
      setBulkOutboundRecProgress("")
    }
  }, [auth?.role, loadList, salesOutletFilter, selectedSalesOutletLabel, t, tt])

  React.useEffect(() => {
    setHasSearchedList(false)
  }, [tab])

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
        loadList()
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
    return items.filter((r) => r.ref_type === "Opening" || r.ref_type === "PO")
  }

  const getCumulativeBalanceForItem = React.useCallback(
    (item: ReceivablePayableItem) => {
      if (item.cumulativeBalance != null && Number.isFinite(item.cumulativeBalance)) {
        return item.cumulativeBalance
      }
      const key = cumulativeBalanceKey(tab, item)
      if (!key) return undefined
      const balance = cumulativeSummary.byKey[key]
      return balance == null ? undefined : balance
    },
    [tab, cumulativeSummary.byKey]
  )

  const listSearchTotals = React.useMemo(() => {
    const isRecTab = tab === "receivable"
    let accrualSum = 0
    let settlementSum = 0
    let balanceSum = 0
    let cumulativeSum = 0
    let count = 0
    for (const item of listData) {
      const allItems = item.items ?? []
      const displayItems = filterItemsByUnpaid(item.items, isRecTab)
      const tableItems = displayItems.length > 0 ? displayItems : allItems
      if (tableItems.length === 0) continue
      const period = sumReceivablePayablePeriodAmounts(allItems)
      accrualSum += period.salesSum
      settlementSum += period.receiveSum
      balanceSum += period.periodNet
      const cumulativeBal = getCumulativeBalanceForItem(item)
      if (cumulativeBal != null) cumulativeSum += cumulativeBal
      count += 1
    }
    return { accrualSum, settlementSum, balanceSum, cumulativeSum, count }
  }, [listData, tab, filterUnpaidOnly, getCumulativeBalanceForItem])

  const ledgerAging = React.useMemo(
    () => computeLedgerAging(listData, tab, endStr),
    [listData, tab, endStr]
  )

  const amountGridCols = "grid grid-cols-[minmax(0,1fr)_110px_110px_110px_110px] gap-2 items-center"

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
        ? tt("ledgerPriorBalanceBeforeStart", "조회 시작({date}) 이전 ฿{amount}")
        : tt("ledgerPriorBalanceBeforePeriod", "조회 기간 이전 ฿{amount}")
      return template.replace("{date}", startStr).replace("{amount}", prior.toLocaleString())
    },
    [startStr, tt]
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
    const typeAccountingPo = tt("recTypeAccountingPO", "Accounting PO")
    const typeForceOutbound = tt("recTypeForceOutbound", "Forced Outbound")
    const typeReceive = isRec ? (t("recTypeReceive") || "Receive") : (t("payTypePayment") || "Payment")
    const typeOpening = t("recTypeOpening") || "Opening Balance"
    const statusRec = (r: { ref_type?: string }) => r.ref_type === "Receive" ? (t("recStatusReceived") || "Received") : (t("recStatusUnpaid") || "Unpaid")
    const statusPay = (r: { ref_type?: string }) => r.ref_type === "Payment" ? (t("payStatusPaid") || "Paid") : (t("payStatusUnpaid") || "Unpaid")
    const header = isRec
      ? [entityCol, t("date") || "Date", t("type") || "Type", t("recColOrderNo") || "Order No", t("recColReceiveStatus") || "Receive Status", t("recColReceiveCheck") || "Collection Check", t("amount") || "Amount", t("memo") || "Memo"]
      : [
          entityCol,
          t("date") || "Date",
          t("type") || "Type",
          t("poInvoice") || "Invoice",
          tt("payColAttributedStore", "Attributed Store"),
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
              : ref === (isRec ? "Order" : "PO")
                ? typeOrder
                : typeReceive
      for (const row of displayItems) {
        const orderOrInv =
          isRec && (row.ref_type === "Order" || row.ref_type === "AccountingPO" || row.ref_type === "ForceOutbound")
            ? row.ref_type === "AccountingPO"
              ? row.invoice_no || (row.ref_id ? `APO#${row.ref_id}` : "")
              : row.ref_type === "ForceOutbound"
                ? row.invoice_no || (row.ref_id ? `IVF#${row.ref_id}` : "")
                : row.invoice_no ||
                  (row.ref_id && row.trans_date
                    ? `IV${String(row.trans_date).replace(/\D/g, "").slice(0, 8)}-${row.ref_id}`
                    : row.ref_id
                      ? `#${row.ref_id}`
                      : "")
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
            ? [name, row.trans_date || "-", typeLabel(row.ref_type || ""), orderOrInv, statusRec(row), receiveCheckCell, String(row.amount ?? 0), getMemo(row.memo) || ""]
            : [
                name,
                row.trans_date || "-",
                typeLabel(row.ref_type || ""),
                invPayable,
                (row as { attributed_store?: string }).attributed_store || "",
                statusPay(row),
                String(row.amount ?? 0),
                getMemo(row.memo) || "",
              ]
        )
      }
    }
    if (rows.length <= 1) return
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td,th{border:1px solid #333;padding:4px 8px;font-size:11px}th{font-weight:bold;background:#e8e8e8}table{border-collapse:collapse;width:100%}</style></head>
<body>
<table>
<tr>${rows[0].map((c) => `<th>${escapeXml(c)}</th>`).join("")}</tr>
${rows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>`).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${tab}_${startStr}_${endStr}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isRec = tab === "receivable"
  const printTitle = isRec ? (t("receivableTab") || "Receivables (Sales)") : (t("payableTab") || "Payables (Purchase)")
  const typeLabel = (ref: string) =>
    ref === "Opening"
      ? (t("recTypeOpening") || "Opening Balance")
      : ref === "AccountingPO"
        ? (t("recTypeAccountingPO") || "Accounting PO")
        : ref === "ForceOutbound"
          ? (t("recTypeForceOutbound") || "Forced Outbound")
          : ref === (isRec ? "Order" : "PO")
            ? isRec
              ? (t("recTypeOrder") || "Order")
              : (t("payTypePO") || "PO")
            : isRec
              ? (t("recTypeReceive") || "Receive")
              : (t("payTypePayment") || "Payment")

  return (
    <div className="space-y-4">
      {hasSearchedList && !loading ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MetricCard
            size="sm"
            variant="primary"
            label={t("acct_kpi_cumulative_balance")}
            value={`฿${cumulativeSummary.totalAmount.toLocaleString()}`}
            subLabel={cumulativeBalanceLabel}
          />
          {listSearchTotals.count > 0 ? (
            <>
              <MetricCard
                size="sm"
                label={t("acct_kpi_period_net")}
                value={`฿${listSearchTotals.balanceSum.toLocaleString()}`}
              />
              <MetricCard
                size="sm"
                label={t("acct_kpi_period_accrual")}
                value={`฿${listSearchTotals.accrualSum.toLocaleString()}`}
              />
              <MetricCard
                size="sm"
                label={t("acct_kpi_period_settlement")}
                value={`฿${listSearchTotals.settlementSum.toLocaleString()}`}
              />
            </>
          ) : null}
        </div>
      ) : null}
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
          {storeFilter !== "All" && (isRec ? ` · ${t("outColStore")}: ${storeFilter}` : ` · ${tt("payColAttributedStore", "Attributed Store")}: ${storeFilter}`)}
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
                  <p className="text-primary font-bold mb-2">฿{(item.balance ?? 0).toLocaleString()}</p>
                  <table className="w-full text-xs border-collapse table-fixed">
                    <thead>
                      <tr className="border-b">
                        <th className="text-center py-1 px-2 w-[115px]">{t("date") || "Date"}</th>
                        <th className="text-center py-1 px-2 w-[95px]">{t("type") || "Type"}</th>
                        {isRec && (
                          <th className="text-center py-1 px-2 w-[160px] whitespace-nowrap">
                            {t("recColOrderNo") || "Order No"}
                          </th>
                        )}
                        {!isRec && <th className="text-center py-1 px-2 w-[100px]">{t("poInvoice") || "Invoice"}</th>}
                        {!isRec && (
                          <th className="text-center py-1 px-2 w-[100px] whitespace-nowrap">
                            {tt("payColAttributedStore", "Attributed Store")}
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
                            <td className="py-1 px-2 w-[160px] whitespace-nowrap">
                              {row.ref_type === "Order"
                                ? row.invoice_no ||
                                  (row.ref_id && row.trans_date
                                    ? `IV${String(row.trans_date).replace(/\D/g, "").slice(0, 8)}-${row.ref_id}`
                                    : row.ref_id
                                      ? `#${row.ref_id}`
                                      : "") ||
                                  "-"
                                : row.ref_type === "AccountingPO"
                                  ? row.invoice_no || (row.ref_id ? `APO#${row.ref_id}` : "-")
                                  : row.ref_type === "ForceOutbound"
                                    ? row.invoice_no || (row.ref_id ? `IVF#${row.ref_id}` : "-")
                                    : "-"}
                            </td>
                          )}
                          {!isRec && <td className="py-1 px-2 text-center">{invCell}</td>}
                          {!isRec && (
                            <td className="py-1 px-2 text-center text-muted-foreground text-[11px] whitespace-nowrap">
                              {(row as { attributed_store?: string }).attributed_store || "—"}
                            </td>
                          )}
                          <td className="py-1 px-2 text-center">{isRec ? (row.ref_type === "Receive" ? (t("recStatusReceived") || "Received") : (t("recStatusUnpaid") || "Unpaid")) : (row.ref_type === "Payment" ? (t("payStatusPaid") || "Paid") : (t("payStatusUnpaid") || "Unpaid"))}</td>
                          {isRec && (
                            <td className="py-1 px-2 text-center text-xs">
                              {row.ref_type === "Order" || row.ref_type === "ForceOutbound" || row.ref_type === "AccountingPO"
                                ? (row.receive_checked ? (t("recCheckPaid") || "Collected") : (t("recCheckWait") || "Pending"))
                                : "—"}
                            </td>
                          )}
                          <td className="py-1 px-2 text-right">{Number(row.amount ?? 0) >= 0 ? "+" : ""}฿{(row.amount ?? 0).toLocaleString()}</td>
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "receivable" | "payable")} className={adminTabsRootCn}>
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
                    <Button
                      size="sm"
                      onClick={handleLoadList}
                      disabled={loading || bulkRecSyncing || bulkOutboundRecSyncing}
                      className="h-9"
                    >
                      <Search className="h-4 w-4 mr-1" />
                      {t("btn_query")}
                    </Button>
                    {showBulkRecSyncBtn && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => void handleBulkOutboundSyncOrderReceivables()}
                        disabled={loading || bulkRecSyncing || bulkOutboundRecSyncing}
                        className="h-9"
                        title={tt(
                          "recBulkOutboundSyncBtnTitle",
                          "Order 미수금을 출고 로그·출고 화면과 같은 합계로 전건 재설정합니다. 시간이 걸릴 수 있습니다."
                        )}
                      >
                        <ArrowRightLeft className={cn("h-4 w-4 mr-1", bulkOutboundRecSyncing && "animate-spin")} />
                        {tt("recBulkOutboundSyncBtn", "Bulk Align by Outbound")}
                      </Button>
                    )}
                    {showBulkRecSyncBtn && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleBulkSyncOrderReceivables()}
                        disabled={loading || bulkRecSyncing || bulkOutboundRecSyncing}
                        className="h-9"
                        title={tt(
                          "recBulkSyncBtnTitle",
                          "과거 포함 Order 미수금 전건을 출고·직접정산 규칙에 맞게 재계산합니다."
                        )}
                      >
                        <RefreshCw className={cn("h-4 w-4 mr-1", bulkRecSyncing && "animate-spin")} />
                        {tt("recBulkSyncBtn", "Bulk Sync Order Receivables")}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading || listData.length === 0} title={t("pettyPrintHint")} className="h-9">
                      <Printer className="h-4 w-4 mr-1" />
                      {t("printBtn")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExcel} disabled={loading || listData.length === 0} title={t("pettyExcelHint")} className="h-9">
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      {t("excelBtn")}
                    </Button>
                    {hasSearchedList && !loading ? (
                      <div className="ml-auto flex flex-col items-end gap-0.5 shrink-0 max-w-[min(100%,420px)]">
                        <span className="text-sm font-bold text-primary tabular-nums text-right">
                          {cumulativeBalanceLabel}: ฿{cumulativeSummary.totalAmount.toLocaleString()}
                        </span>
                        {listSearchTotals.count > 0 ? (
                          <>
                            <span className="text-sm font-semibold tabular-nums text-right">
                              {t("recSearchTotalRemaining") || tt("recSearchTotalRemaining", "조회 기간 합계 (순잔액)")}: ฿
                              {listSearchTotals.balanceSum.toLocaleString()}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums text-right">
                              {(t("recColSalesAmount") || "매출금액")} ฿{listSearchTotals.accrualSum.toLocaleString()} ·{" "}
                              {(t("recColReceiveAmount") || "수령금액")} ฿{listSearchTotals.settlementSum.toLocaleString()}
                            </span>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {canSelectStores ? (
                    <p className="text-xs text-amber-900 dark:text-amber-100/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-md px-3 py-2 mb-3 leading-snug">
                      {tt(
                        "recVsPayPoHint",
                        "※ 발주(PO) 승인·매입 대금은 「미지급금(매입)」에 반영됩니다. 이 탭(미수금)은 매장·매출처 매출 회수(주문·수금)용입니다."
                      )}
                    </p>
                  ) : null}
                  {bulkOutboundRecProgress ? (
                    <p className="text-xs text-muted-foreground mb-1">{bulkOutboundRecProgress}</p>
                  ) : null}
                  {bulkRecProgress ? (
                    <p className="text-xs text-muted-foreground mb-2">{bulkRecProgress}</p>
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
                    <div className="w-full">
                      {/* 헤더: 출고처, 매출금액, 수령금액, 기간 순잔액, 누적 잔액 */}
                      <div className={cn(amountGridCols, "px-4 py-2 border-b bg-muted/50 font-semibold text-sm")}>
                        <div className="text-center">{(t("outColStore") || "출고처")}</div>
                        <div className="text-center tabular-nums">{(t("recColSalesAmount") || "매출금액")}</div>
                        <div
                          className="text-center tabular-nums"
                          title={tt("recReceiveAmountHint", "조회 기간 내 수령·통장 분개(음수) 합계. 수금확인 체크와 별도입니다.")}
                        >
                          {(t("recColReceiveAmount") || "수령금액")}
                        </div>
                        <div
                          className="text-center tabular-nums"
                          title={tt("recPeriodNetHint", "매출금액 − 수령금액 (조회 기간 내 순증감)")}
                        >
                          {(t("recColRemainingReceivable") || "기간 순잔액")}
                        </div>
                        <div
                          className="text-center tabular-nums text-primary"
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
                          const tableItems = displayItems.length > 0 ? displayItems : allItems
                          if (tableItems.length === 0) return null
                          const period = sumReceivablePayablePeriodAmounts(allItems)
                          const cumulativeBal = getCumulativeBalanceForItem(item)
                          const priorBal = priorCumulativeBalance(cumulativeBal, period.periodNet)
                          const priorBalanceHint = formatPriorBalanceHint(priorBal)
                          return (
                          <AccordionItem key={item.storeName!} value={item.storeName!}>
                            <AccordionTrigger className="hover:no-underline px-4 py-3 [&>svg]:shrink-0">
                              <div className="flex-1 min-w-0">
                                <div className={cn(amountGridCols, "w-full")}>
                                  <div className="flex flex-col items-start gap-0.5 min-w-0 text-left">
                                    <span className="font-semibold truncate">{item.storeName}</span>
                                    {item.vendorCode && (
                                      <span className="text-xs text-muted-foreground">
                                        {t("vendor") || "거래처"}: {item.vendorName === item.vendorCode ? item.vendorCode : `${item.vendorName} (${item.vendorCode})`}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-center tabular-nums">฿{period.salesSum.toLocaleString()}</div>
                                  <div className="text-center tabular-nums">฿{period.receiveSum.toLocaleString()}</div>
                                  <div className="text-center tabular-nums">฿{period.periodNet.toLocaleString()}</div>
                                  <div className="text-center tabular-nums font-bold text-primary">
                                    {cumulativeBal != null ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span>฿{cumulativeBal.toLocaleString()}</span>
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
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4">
                              <table className="w-full text-sm border-collapse table-fixed">
                                <thead>
                                  <tr className="border-b bg-muted/50">
                                    <th className="text-center py-2 px-2 w-[35px] font-semibold" aria-hidden />
                                    <th className="text-center py-2 px-4 w-[115px] font-semibold">{t("date") || "날짜"}</th>
                                    <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("type") || "구분"}</th>
                                    <th className="text-center py-2 px-3 w-[160px] min-w-[160px] font-semibold whitespace-nowrap">
                                      {t("recColOrderNo") || "주문번호"}
                                    </th>
                                    <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("recColReceiveStatus") || "수령여부"}</th>
                                    <th className="text-center py-2 px-2 w-[108px] font-semibold whitespace-nowrap">{t("recColReceiveCheck") || "수금확인"}</th>
                                    <th className="text-center py-2 px-1 w-[72px] text-xs font-semibold whitespace-nowrap">
                                      {t("recColTaxInvoice") || "Tax Invoice"}
                                    </th>
                                    <th className="text-center py-2 px-4 w-[135px] font-semibold">{t("amount") || "금액"}</th>
                                    <th className="text-center py-2 px-4 min-w-[150px] font-semibold">{t("memo") || "메모"}</th>
                                    {showReceivableManualActions && (
                                      <th className="text-center py-2 px-1 w-[72px] font-semibold whitespace-nowrap">
                                        {t("btnEdit") || "수정"}
                                      </th>
                                    )}
                                    {showRecSyncBtn && (
                                      <th
                                        className="text-center py-2 px-1 w-[88px] text-xs font-semibold text-muted-foreground"
                                        title={`${tt("recSyncOrderColHint", "카트·직접정산")} / ${tt("recSyncOutboundColHint", "출고 관리 합계")}`}
                                      >
                                        {tt("recSyncAlignColShort", "맞춤")}
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
                                    const recLineColSpan = 9 + (showReceivableManualActions ? 1 : 0) + (showRecSyncBtn ? 1 : 0)
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
                                    const orderNoDisplay =
                                      row.ref_type === "AccountingPO"
                                        ? row.invoice_no || (row.ref_id != null ? `APO#${row.ref_id}` : "-")
                                        : row.ref_type === "ForceOutbound"
                                          ? row.invoice_no || (row.ref_id != null ? `IVF#${row.ref_id}` : "-")
                                          : row.ref_type === "Order"
                                            ? row.invoice_no ||
                                              (rowOrderId != null ? `#${rowOrderId}` : row.ref_id ? `#${row.ref_id}` : "") ||
                                              "-"
                                            : "-"
                                    const isAccrualRow = isAccrualRefType(row.ref_type, "receivable")
                                    const rowAgeDays =
                                      isAccrualRow && Number(row.amount ?? 0) > 0
                                        ? agingDaysBetween(endStr, row.trans_date || endStr)
                                        : 0
                                    return (
                                    <React.Fragment key={row.id ?? recRowKey}>
                                    <tr
                                      className={cn(
                                        "border-b border-border/50",
                                        rowAgeDays > 0 ? agingRowToneClass(rowAgeDays) : ""
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
                                        {canExpandRecLines ? (
                                          recLinesLoading ? (
                                            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                          ) : isRecExpanded ? (
                                            <ChevronDown className="h-4 w-4 mx-auto" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4 mx-auto" />
                                          )
                                        ) : null}
                                      </td>
                                      <td className="py-1.5 px-4 w-[115px]">
                                        <span>{row.trans_date || "-"}</span>
                                        {rowAgeDays > 30 ? (
                                          <span className="ml-1 text-[10px] font-medium text-amber-800 dark:text-amber-200">
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
                                          "py-1.5 px-3 w-[160px] min-w-[160px] whitespace-nowrap",
                                          canExpandRecLines
                                            ? "text-primary cursor-pointer hover:underline font-medium"
                                            : "text-muted-foreground"
                                        )}
                                        title={
                                          canExpandRecLines
                                            ? row.ref_type === "ForceOutbound"
                                              ? tt("recClickForceForLines", "클릭하면 강제출고 품목을 펼칩니다.")
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
                                      <td className="py-1.5 px-4 w-[95px] text-center">
                                        <span className={cn(
                                          "text-xs font-medium px-2 py-0.5 rounded",
                                          row.ref_type === "Receive" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                        )}>
                                          {row.ref_type === "Receive" ? (t("recStatusReceived") || "수령") : (t("recStatusUnpaid") || "미수")}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2 w-[108px] text-center align-middle">
                                        {(row.ref_type === "Order" || row.ref_type === "ForceOutbound" || row.ref_type === "AccountingPO") && row.id != null ? (
                                          <div className="flex flex-col items-center gap-0.5">
                                            <Checkbox
                                              checked={!!row.receive_checked}
                                              disabled={!canEditReceiveCheck || updatingReceiveCheckId === row.id}
                                              title={
                                                row.receive_checked
                                                  ? (t("recCheckPaid") || "수금완료")
                                                  : (t("recCheckWait") || "수금대기")
                                              }
                                              onCheckedChange={(v) => {
                                                if (!canEditReceiveCheck || row.id == null) return
                                                void handleReceiveCheckChange({
                                                  receivableId: row.id,
                                                  receiveChecked: !!v,
                                                  outletStoreName: item.storeName || "",
                                                })
                                              }}
                                              className="mt-0.5"
                                            />
                                            <span className="text-[10px] text-muted-foreground leading-none">
                                              {row.receive_checked
                                                ? (t("recCheckPaid") || "완료")
                                                : (t("recCheckWait") || "대기")}
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
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
                                      <td className="py-1.5 px-4 w-[135px] text-right tabular-nums font-medium">{(row.amount ?? 0) >= 0 ? "+" : ""}฿{(row.amount ?? 0).toLocaleString()}</td>
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
                                      {showRecSyncBtn && (
                                        <td className="py-1.5 px-1 w-[88px] text-center align-middle">
                                          {row.ref_type === "Order" && rowOrderId != null ? (
                                            <div className="flex justify-center items-center gap-0.5">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 shrink-0"
                                                disabled={syncPair != null}
                                                title={tt("recSyncOrderBtnTitle", "본사 미수 재동기화 (지두방·직접정산 반영)")}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  void handleSyncOrderReceivable(rowOrderId)
                                                }}
                                              >
                                                <RefreshCw
                                                  className={cn(
                                                    "h-4 w-4",
                                                    syncPair?.orderId === rowOrderId && syncPair?.kind === "cart" && "animate-spin"
                                                  )}
                                                />
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0 shrink-0"
                                                disabled={syncPair != null}
                                                title={tt("recSyncOutboundBtnTitle", "출고 관리 합계에 맞춤 (출고 로그·수량 반영)")}
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  void handleSyncOrderReceivableFromOutbound(rowOrderId)
                                                }}
                                              >
                                                <ArrowRightLeft
                                                  className={cn(
                                                    "h-4 w-4",
                                                    syncPair?.orderId === rowOrderId && syncPair?.kind === "outbound" && "animate-spin"
                                                  )}
                                                />
                                              </Button>
                                            </div>
                                          ) : null}
                                        </td>
                                      )}
                                    </tr>
                                    {isRecExpanded && (
                                      <tr className="border-b border-border/50 bg-muted/10">
                                        <td colSpan={recLineColSpan} className="py-2 px-4">
                                          {recLinesLoading ? (
                                            <p className="text-xs text-muted-foreground py-2">{t("loadingItems")}</p>
                                          ) : recLineItems.length > 0 ? (
                                            <div className="ml-4 rounded border border-border/50 bg-background p-3 text-xs">
                                              <div className="mb-2 font-semibold text-muted-foreground">
                                                {t("outColItem") || "품목"}
                                              </div>
                                              <p className="mb-2 text-[11px] text-muted-foreground">
                                                {tt(
                                                  "recLineItemsVatHint",
                                                  "행 금액은 VAT 포함 합계입니다. 아래 품목 금액은 공급가(단가×수량)이며, 맨 아래 소계·VAT·합계로 맞춥니다."
                                                )}
                                              </p>
                                              <table className="w-full text-xs">
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
                                                        {it.unitCost != null ? `฿${it.unitCost.toLocaleString()}` : "-"}
                                                      </td>
                                                      <td className="py-1 px-2 text-right tabular-nums font-medium">
                                                        ฿{(it.amount ?? 0).toLocaleString()}
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
                                                          ฿{recOrderTotals.subtotalRounded.toLocaleString()}
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
                                                          ฿{recOrderTotals.vatRounded.toLocaleString()}
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
                                                          ฿{recOrderTotals.grandTotal.toLocaleString()}
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
                            </AccordionContent>
                          </AccordionItem>
                          )
                        })}
                      </Accordion>
                      {listSearchTotals.count > 0 ? (
                        <div className={cn(amountGridCols, "px-4 py-3 border-t bg-muted/40 font-semibold text-sm")}>
                          <div className="text-right">{tt("recSearchTotalLabel", "합계")}</div>
                          <div className="text-center tabular-nums">฿{listSearchTotals.accrualSum.toLocaleString()}</div>
                          <div className="text-center tabular-nums">฿{listSearchTotals.settlementSum.toLocaleString()}</div>
                          <div className="text-center tabular-nums font-semibold">
                            ฿{listSearchTotals.balanceSum.toLocaleString()}
                          </div>
                          <div className="text-center tabular-nums font-bold text-primary">
                            ฿{(listSearchTotals.cumulativeSum || cumulativeSummary.totalAmount).toLocaleString()}
                          </div>
                        </div>
                      ) : null}
                    </div>
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
                    {hasSearchedList && !loading ? (
                      <div className="ml-auto flex flex-col items-end gap-0.5 shrink-0 max-w-[min(100%,420px)]">
                        <span className="text-sm font-bold text-primary tabular-nums text-right">
                          {cumulativeBalanceLabel}: ฿{cumulativeSummary.totalAmount.toLocaleString()}
                        </span>
                        {listSearchTotals.count > 0 ? (
                          <>
                            <span className="text-sm font-semibold tabular-nums text-right">
                              {t("paySearchTotalRemaining") || tt("paySearchTotalRemaining", "조회 기간 합계 (순잔액)")}: ฿
                              {listSearchTotals.balanceSum.toLocaleString()}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums text-right">
                              {(t("payColPurchaseAmount") || "매입금액")} ฿{listSearchTotals.accrualSum.toLocaleString()} ·{" "}
                              {(t("payColPaymentAmount") || "지급금액")} ฿{listSearchTotals.settlementSum.toLocaleString()}
                            </span>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {loading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                  ) : !hasSearchedList ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query") || "검색 버튼을 눌러 주세요."}</p>
                  ) : listData.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("payableEmpty") || "조회된 미지급금이 없습니다."}</p>
                  ) : !listData.some((item) => filterItemsByUnpaid(item.items, false).length > 0) ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("payFilterUnpaidOnlyEmpty") || "미지급만 필터 적용 시 해당하는 내역이 없습니다."}</p>
                  ) : (
                    <div className="w-full">
                      {/* 헤더: 매입처, 매입금액, 지급금액, 기간 순잔액, 누적 잔액 */}
                      <div className={cn(amountGridCols, "px-4 py-2 border-b bg-muted/50 font-semibold text-sm")}>
                        <div className="text-center">{(t("vendor") || "매입처")}</div>
                        <div className="text-center tabular-nums">{(t("payColPurchaseAmount") || "매입금액")}</div>
                        <div className="text-center tabular-nums">{(t("payColPaymentAmount") || "지급금액")}</div>
                        <div
                          className="text-center tabular-nums"
                          title={tt("payPeriodNetHint", "매입금액 − 지급금액 (조회 기간 내 순증감)")}
                        >
                          {(t("payColRemainingPayable") || "기간 순잔액")}
                        </div>
                        <div
                          className="text-center tabular-nums text-primary"
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
                          const tableItems = displayItems.length > 0 ? displayItems : allItems
                          if (tableItems.length === 0) return null
                          const period = sumReceivablePayablePeriodAmounts(allItems)
                          const cumulativeBal = getCumulativeBalanceForItem(item)
                          const priorBal = priorCumulativeBalance(cumulativeBal, period.periodNet)
                          const priorBalanceHint = formatPriorBalanceHint(priorBal)
                          return (
                          <AccordionItem key={item.vendorCode!} value={item.vendorCode!}>
                            <AccordionTrigger className="hover:no-underline px-4 py-3 [&>svg]:shrink-0">
                              <div className="flex-1 min-w-0">
                                <div className={cn(amountGridCols, "w-full")}>
                                  <div className="flex flex-col items-start gap-0.5 min-w-0 text-left">
                                    <span className="font-semibold truncate">{formatVendorDisplay(item.vendorCode)}</span>
                                  </div>
                                  <div className="text-center tabular-nums">฿{period.salesSum.toLocaleString()}</div>
                                  <div className="text-center tabular-nums">฿{period.receiveSum.toLocaleString()}</div>
                                  <div className="text-center tabular-nums">฿{period.periodNet.toLocaleString()}</div>
                                  <div className="text-center tabular-nums font-bold text-primary">
                                    {cumulativeBal != null ? (
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span>฿{cumulativeBal.toLocaleString()}</span>
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
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4">
                              <table className="w-full text-sm border-collapse table-fixed">
                                <thead>
                                  <tr className="border-b bg-muted/50">
                                    <th className="text-center py-2 px-4 w-[35px] font-semibold"></th>
                                    <th className="text-center py-2 px-4 w-[115px] font-semibold">{t("date") || "날짜"}</th>
                                    <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("type") || "구분"}</th>
                                    <th className="text-center py-2 px-4 w-[100px] font-semibold">{t("poInvoice") || "인보이스"}</th>
                                    <th className="text-center py-2 px-4 w-[92px] font-semibold whitespace-nowrap">
                                      {tt("payColAttributedStore", "귀속 매장")}
                                    </th>
                                    <th className="text-center py-2 px-4 w-[95px] font-semibold">{t("payColPaymentStatus") || "지급여부"}</th>
                                    <th className="text-center py-2 px-4 w-[135px] font-semibold">{t("amount") || "금액"}</th>
                                    <th className="text-center py-2 px-4 min-w-[150px] font-semibold">{t("memo") || "메모"}</th>
                                    {showPayableManualActions && (
                                      <th className="text-center py-2 px-1 w-[72px] font-semibold whitespace-nowrap">
                                        {t("btnEdit") || "수정"}
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
                                    return (
                                      <React.Fragment key={row.id ?? rowKey}>
                                        <tr
                                          className={cn(
                                            "border-b border-border/50",
                                            payRowAgeDays > 0 ? agingRowToneClass(payRowAgeDays) : ""
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
                                            {canExpand ? (
                                              isLoading ? (
                                                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                              ) : (
                                                isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                                              )
                                            ) : null}
                                          </td>
                                          <td className="py-1.5 px-4 w-[115px]">
                                            <span>{row.trans_date || "-"}</span>
                                            {payRowAgeDays > 30 ? (
                                              <span className="ml-1 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                                                {t("acct_aging_days_badge").replace("{n}", String(payRowAgeDays))}
                                              </span>
                                            ) : null}
                                          </td>
                                          <td className="py-1.5 px-4 w-[95px]">{row.ref_type === "Opening" ? (t("recTypeOpening") || "기초이월") : row.ref_type === "PO" ? (t("payTypePO") || "발주") : (t("payTypePayment") || "지급")}</td>
                                          <td
                                            className={cn(
                                              "py-1.5 px-4 w-[100px] text-center",
                                              canExpand && "cursor-pointer hover:bg-muted/20 text-primary font-medium hover:underline"
                                            )}
                                            title={
                                              canExpand
                                                ? tt("payClickInvoiceForLines", "클릭하면 입고·발주 품목 목록을 펼칩니다.")
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
                                                <span className="text-xs text-green-700 dark:text-green-400" title={row.invoice_no || ""}>
                                                  ✓ {row.invoice_no ? String(row.invoice_no).slice(0, 12) + (String(row.invoice_no).length > 12 ? "…" : "") : (t("poInvoiceReceived") || "수령")}
                                                </span>
                                              ) : (
                                                <span className="text-xs text-amber-700 dark:text-amber-400">{t("poInvoiceNotReceived") || "미수령"}</span>
                                              )
                                            ) : "-"}
                                          </td>
                                          <td className="py-1.5 px-4 w-[92px] text-center text-muted-foreground text-xs whitespace-nowrap">
                                            {(row as { attributed_store?: string }).attributed_store || "—"}
                                          </td>
                                          <td className="py-1.5 px-4 w-[95px] text-center">
                                            <span className={cn(
                                              "text-xs font-medium px-2 py-0.5 rounded",
                                              row.ref_type === "Payment" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                            )}>
                                              {row.ref_type === "Payment" ? (t("payStatusPaid") || "지급") : (t("payStatusUnpaid") || "미지급")}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-4 w-[135px] text-right tabular-nums font-medium">{(row.amount ?? 0) >= 0 ? "+" : ""}฿{(row.amount ?? 0).toLocaleString()}</td>
                                          <td className="py-1.5 px-4 min-w-[150px] text-muted-foreground">{getMemo(row.memo)}</td>
                                          {showPayableManualActions && (
                                            <td className="py-1.5 px-1 w-[72px] text-center align-middle">
                                              {canEditManualPayRow ? (
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
                                                </div>
                                              ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                              )}
                                            </td>
                                          )}
                                        </tr>
                                        {isExpanded && (
                                          <tr className="border-b border-border/50 bg-muted/10">
                                            <td colSpan={showPayableManualActions ? 9 : 8} className="py-2 px-4">
                                              {isLoading ? (
                                                <p className="text-xs text-muted-foreground py-2">{t("loadingItems")}</p>
                                              ) : items.length > 0 ? (
                                                <div className="ml-4 rounded border border-border/50 bg-background p-3 text-xs">
                                                  <div className="mb-2 font-semibold text-muted-foreground">{t("outColItem") || "품목"}</div>
                                                  <table className="w-full text-xs">
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
                                                            {it.unitCost != null ? `฿${it.unitCost.toLocaleString()}` : "-"}
                                                          </td>
                                                          <td className="py-1 px-2 text-right tabular-nums font-medium">
                                                            ฿{(it.amount ?? 0).toLocaleString()}
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
                            </AccordionContent>
                          </AccordionItem>
                          )
                        })}
                      </Accordion>
                      {listSearchTotals.count > 0 ? (
                        <div className={cn(amountGridCols, "px-4 py-3 border-t bg-muted/40 font-semibold text-sm")}>
                          <div className="text-right">{tt("paySearchTotalLabel", "합계")}</div>
                          <div className="text-center tabular-nums">฿{listSearchTotals.accrualSum.toLocaleString()}</div>
                          <div className="text-center tabular-nums">฿{listSearchTotals.settlementSum.toLocaleString()}</div>
                          <div className="text-center tabular-nums font-semibold">
                            ฿{listSearchTotals.balanceSum.toLocaleString()}
                          </div>
                          <div className="text-center tabular-nums font-bold text-primary">
                            ฿{(listSearchTotals.cumulativeSum || cumulativeSummary.totalAmount).toLocaleString()}
                          </div>
                        </div>
                      ) : null}
                    </div>
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
                  ? "기존 회계에서 이월할 미수금 잔액을 매장별로 입력하세요. (2월 말 기준 권장)"
                  : "기존 회계에서 이월할 미지급금 잔액을 거래처별로 입력하세요. (2월 말 기준 권장)"}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  {tab === "receivable" ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")}
                </label>
                <Select value={addEntity} onValueChange={setAddEntity}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder={tab === "receivable" ? "매장 선택" : "거래처 선택"} />
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
                  placeholder={tab === "receivable" ? "수령 메모" : "지급 메모"}
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
                        ? "수령 메모"
                        : "지급 메모"
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
    </div>
  )
}
