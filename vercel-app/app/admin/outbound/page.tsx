"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"
import { buildErpExcelHtmlDocument, erpExcelSimpleTableStyle, triggerErpExcelHtmlDownload } from "@/lib/erp-excel-export"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ArrowUpFromLine, Download } from "lucide-react"
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
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { thaiInvoiceTotalsFromRawSubtotal } from "@/lib/invoice-vat-total"
import { buildThaiSalesInvoiceData } from "@/lib/thai-sales-invoice-data"
import {
  resolveInvoiceClientForTarget,
  resolveInvoiceClientFromBillToCandidates,
} from "@/lib/invoice-client-resolve"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { getBangkokMonthRange, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { parsePurchaseDrillNav } from "@/lib/income-statement-purchase-drill-nav"
import {
  getAdminItems,
  getAdminVendors,
  getStockStores,
  forceOutboundBatch,
  getCombinedOutboundHistory,
  previewDeleteOutbound,
  deleteOutbound,
  getOrderReceivePhoto,
  updateForceOutboundReceived,
  getMyUsageHistory,
  getInvoiceData,
  getInvoiceOrderBillToCandidates,
  getInvoiceSettings,
  updateInvoiceSettings,
  getOutboundByWarehouse,
  getWarehouseLocations,
  generateEtaxXmlApi,
  useStoreList,
  type AdminItem,
  type AdminVendor,
  type OutboundHistoryItem,
  type UsageHistoryItem,
  type InvoiceDataCompany,
  type InvoiceDataClient,
  type GetOutboundByWarehouseResult,
} from "@/lib/api-client"
import { ItemPickerDialog } from "@/components/erp/item-picker-dialog"
import {
  ShipmentFilterBar,
  ShipmentTable,
  OutboundStoreMonthMatrixPanel,
  type ShipmentHistorySortKey,
  type ShipmentTableRow,
} from "@/components/shipment"
import type { InvoiceData } from "@/components/invoice"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점", "Head Office", "HQ", "Head office", "head office"]

/** 품목 코드 자연 정렬 (CM005 < CM022, CT005 < CT005.1 등). */
function compareItemCodes(a: string, b: string): number {
  return (a || "").localeCompare(b || "", undefined, { numeric: true, sensitivity: "base" })
}

type OutboundDeleteJob = {
  mode: "order" | "force"
  orderId?: number
  stockLogIds?: number[]
  orderDate: string
  target: string
}

function deleteJobFromShipmentRow(row: ShipmentTableRow): OutboundDeleteJob | null {
  const orderIdNum = Number(row.orderRowId || 0)
  const forceStockLogIds = row.items
    .map((d) => Number(d.stockLogId || 0))
    .filter((n) => Number.isFinite(n) && n > 0)
  if (row.type === "Outbound" && orderIdNum > 0) {
    return { mode: "order", orderId: orderIdNum, orderDate: row.orderDate, target: row.target }
  }
  if (row.type === "Force" && forceStockLogIds.length > 0) {
    return { mode: "force", stockLogIds: forceStockLogIds, orderDate: row.orderDate, target: row.target }
  }
  return null
}

function ReceivePhotoGallery({ urls, t }: { urls: string[]; t: (k: string) => string }) {
  const [idx, setIdx] = React.useState(0)
  const current = urls[idx] ?? urls[0]
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-center bg-black/30 min-h-[200px] rounded-lg">
        <ImageViewerWithRotate
          src={current}
          alt=""
          imgClassName="max-w-full max-h-[70vh] object-contain rounded"
          rotateLeftLabel={t("imageRotateLeft")}
          rotateRightLabel={t("imageRotateRight")}
          zoomInLabel={t("att_zoom_in")}
          zoomOutLabel={t("att_zoom_out")}
        />
      </div>
      {urls.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIdx((i) => (i <= 0 ? urls.length - 1 : i - 1))}
          >
            ‹
          </Button>
          <span className="text-sm text-muted-foreground">
            {idx + 1} / {urls.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIdx((i) => (i >= urls.length - 1 ? 0 : i + 1))}
          >
            ›
          </Button>
        </div>
      )}
      {urls.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1">
          {urls.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`h-12 w-12 rounded border-2 overflow-hidden shrink-0 ${
                i === idx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface OutboundCartItem {
  date: string
  deliveryDate: string
  store: string
  code: string
  name: string
  spec: string
  qty: string
}

export default function OutboundPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores: pageStoreList } = useStoreList()
  const [items, setItems] = React.useState<AdminItem[]>([])
  const [outboundTargets, setOutboundTargets] = React.useState<string[]>([])
  const [storeTargets, setStoreTargets] = React.useState<string[]>([])
  const [salesTargets, setSalesTargets] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyList, setHistoryList] = React.useState<OutboundHistoryItem[]>([])
  const [usageList, setUsageList] = React.useState<UsageHistoryItem[]>([])

  const [outDate, setOutDate] = React.useState("")
  const [deliveryDate, setDeliveryDate] = React.useState("")
  const [outReferenceNo, setOutReferenceNo] = React.useState("")
  const [outStore, setOutStore] = React.useState("")
  const [outQty, setOutQty] = React.useState("")
  const [cart, setCart] = React.useState<OutboundCartItem[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<AdminItem | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [deletingOutbound, setDeletingOutbound] = React.useState(false)

  const [histStart, setHistStart] = React.useState(() => getBangkokTodayDateString())
  const [histEnd, setHistEnd] = React.useState(() => getBangkokTodayDateString())
  const [histMonth, setHistMonth] = React.useState("")
  const [histStore, setHistStore] = React.useState("")
  const [histTargetType, setHistTargetType] = React.useState<"" | "store" | "sales">("")
  const [histType, setHistType] = React.useState("")
  const [histDeliveryStatus, setHistDeliveryStatus] = React.useState("")
  const [invoiceSearch, setInvoiceSearch] = React.useState("")
  const [itemSearch, setItemSearch] = React.useState("")
  const [summaryVendorFilter, setSummaryVendorFilter] = React.useState("")
  const [summaryCategoryFilter, setSummaryCategoryFilter] = React.useState("")
  const [summaryMenuSearch, setSummaryMenuSearch] = React.useState("")
  const [summaryStoreFilter, setSummaryStoreFilter] = React.useState("")
  const [summaryVendorSortBy, setSummaryVendorSortBy] = React.useState<"qty" | "amount">("amount")
  const [summaryVendorSortDir, setSummaryVendorSortDir] = React.useState<"asc" | "desc">("desc")
  const [summaryMenuSortBy, setSummaryMenuSortBy] = React.useState<"qty" | "amount">("amount")
  const [summaryMenuSortDir, setSummaryMenuSortDir] = React.useState<"asc" | "desc">("desc")
  const [historySortKey, setHistorySortKey] = React.useState<ShipmentHistorySortKey>("orderDate")
  const [historySortDir, setHistorySortDir] = React.useState<"asc" | "desc">("desc")
  const [summaryMonthDialogOpen, setSummaryMonthDialogOpen] = React.useState(false)
  const [summaryMonthDraft, setSummaryMonthDraft] = React.useState("")
  const [selectedForPrint, setSelectedForPrint] = React.useState<Set<number>>(new Set())
  const [photoModalOpen, setPhotoModalOpen] = React.useState(false)
  const [photoModalUrls, setPhotoModalUrls] = React.useState<string[]>([])
  const [photoModalLoading, setPhotoModalLoading] = React.useState(false)

  const [whStart, setWhStart] = React.useState("")
  const [whEnd, setWhEnd] = React.useState("")
  const [whFilterBy, setWhFilterBy] = React.useState<"order" | "delivery">("delivery")
  const [whLoading, setWhLoading] = React.useState(false)
  const [whData, setWhData] = React.useState<GetOutboundByWarehouseResult | null>(null)
  const [whWarehouseFilter, setWhWarehouseFilter] = React.useState("")
  const [whStoreFilter, setWhStoreFilter] = React.useState("")
  const [whItemFilter, setWhItemFilter] = React.useState("")
  const [whSelectedWarehouses, setWhSelectedWarehouses] = React.useState<Set<string>>(new Set())
  const [whWarehouseOptions, setWhWarehouseOptions] = React.useState<string[]>([])

  const [invSettings, setInvSettings] = React.useState<Record<string, string>>({})
  const [invSettingsLoading, setInvSettingsLoading] = React.useState(false)
  const [invSettingsSaving, setInvSettingsSaving] = React.useState(false)

  const isOffice = React.useMemo(() => {
    const store = (auth?.store || "").trim()
    return OFFICE_STORES.some((s) => store.toLowerCase().includes(s.toLowerCase()))
  }, [auth?.store])

  /** 출고 로그 단가 API·UI — JWT office 권한과 동일(역할 기준). 매장명이 본사가 아니어도 Officer/Director면 표시 */
  const canEditOutboundLogUnitPrice = React.useMemo(
    () => isOfficeRole(auth?.role || ""),
    [auth?.role]
  )

  const [tabValue, setTabValue] = React.useState<
    "new" | "hist" | "warehouse" | "invoice" | "summary" | "storeMonth"
  >("hist")
  const searchParams = useSearchParams()
  const plDrillNavAppliedRef = React.useRef(false)
  const plDrillAutoFetchRef = React.useRef(false)

  React.useEffect(() => {
    const today = getBangkokTodayDateString()
    setOutDate(today)
  }, [])

  React.useEffect(() => {
    const nav = parsePurchaseDrillNav(searchParams)
    if (nav.fromPlDrill) {
      if (nav.startStr) setHistStart(nav.startStr)
      if (nav.endStr) setHistEnd(nav.endStr)
      if (nav.yearMonth) {
        setHistMonth(nav.yearMonth)
      } else if (nav.startStr && nav.endStr) {
        setHistMonth("")
      }
      if (nav.store) {
        setHistTargetType("store")
        setHistStore(nav.store)
      }
      if (searchParams.get("tab") === "hist") setTabValue("hist")
      plDrillNavAppliedRef.current = true
      return
    }
    const today = getBangkokTodayDateString()
    setHistStart(today)
    setHistEnd(today)
  }, [searchParams])

  React.useEffect(() => {
    const today = getBangkokTodayDateString()
    setWhStart((p) => p || today)
    setWhEnd((p) => p || today)
  }, [])

  const handleHistStartChange = React.useCallback((next: string) => {
    setHistStart(next)
    if (next && histMonth) setHistMonth("")
  }, [histMonth])

  const handleHistEndChange = React.useCallback((next: string) => {
    setHistEnd(next)
    if (next && histMonth) setHistMonth("")
  }, [histMonth])

  const handleHistMonthChange = React.useCallback((next: string) => {
    setHistMonth(next)
    if (!next) return
    const { startStr, endStr } = getBangkokMonthRange(next)
    setHistStart(startStr)
    setHistEnd(endStr)
  }, [])

  const handleHistorySortChange = React.useCallback((key: ShipmentHistorySortKey) => {
    if (historySortKey === key) {
      setHistorySortDir((prev) => (prev === "desc" ? "asc" : "desc"))
      return
    }
    setHistorySortKey(key)
    setHistorySortDir("desc")
  }, [historySortKey])

  const openSummaryMonthDialog = React.useCallback(() => {
    setSummaryMonthDraft(histMonth || "")
    setSummaryMonthDialogOpen(true)
  }, [histMonth])

  const pickCurrentSummaryMonth = React.useCallback(() => {
    const { yearMonth } = getBangkokMonthRange()
    setSummaryMonthDraft(yearMonth)
  }, [])

  const applySummaryMonth = React.useCallback(() => {
    handleHistMonthChange(summaryMonthDraft)
    setSummaryMonthDialogOpen(false)
  }, [handleHistMonthChange, summaryMonthDraft])

  const clearSummaryMonth = React.useCallback(() => {
    handleHistMonthChange("")
    setSummaryMonthDialogOpen(false)
  }, [handleHistMonthChange])

  React.useEffect(() => {
    Promise.all([getAdminItems({ scope: 'outbound' }), getAdminVendors(), getStockStores(), getWarehouseLocations()])
      .then(([itemList, vendorList, storeList, whLocs]) => {
        setItems(Array.isArray(itemList) ? itemList : [])
        const vendors = Array.isArray(vendorList) ? vendorList : []
        const fromStockLogs = (Array.isArray(storeList) ? storeList : []).filter(
          (s: string) => !OFFICE_STORES.some((o) => s.toLowerCase().includes(o.toLowerCase()))
        )
        const vendorStoreNames = vendors
          .filter((v: AdminVendor) => (v.type === "sales" || v.type === "both") && (v.gps_name?.trim() || ""))
          .map((v: AdminVendor) => (v.gps_name || "").trim())
        const vendorSalesNames = vendors
          .filter((v: AdminVendor) => (v.type === "sales" || v.type === "both") && (v.sales_outlet?.trim() || ""))
          .map((v: AdminVendor) => (v.sales_outlet || "").trim())
        const storeArr = [...new Set([...fromStockLogs, ...vendorStoreNames])].filter(Boolean).sort()
        const salesArr = [...new Set(vendorSalesNames)].filter(Boolean).sort()
        const fromMasterStores = (pageStoreList || []).filter((s) => s && s !== "All")
        const merged = [...new Set([...storeArr, ...salesArr, ...fromMasterStores])].filter(Boolean).sort()
        setStoreTargets(storeArr)
        setSalesTargets(salesArr)
        setOutboundTargets(merged)
        const whNames = (whLocs || []).map((l: { name?: string }) => (l.name || "").trim()).filter(Boolean)
        setWhWarehouseOptions(whNames)
      })
      .catch(() => {
        setItems([])
        setOutboundTargets([])
        setStoreTargets([])
        setSalesTargets([])
        setWhWarehouseOptions([])
      })
      .finally(() => setLoading(false))
  }, [pageStoreList])

  const handleItemSelect = (item: AdminItem) => {
    setSelectedItem(item)
    setOutQty("")
  }

  const handleAddToList = async () => {
    if (!selectedItem) {
      await appAlert(t("inAlertSelectItem"))
      return
    }
    if (!outQty.trim()) {
      await appAlert(t("inAlertEnterQty"))
      return
    }
    if (!outStore) {
      await appAlert(t("outStorePlaceholder"))
      return
    }
    const q = parseFloat(outQty.replace(/,/g, ""))
    if (isNaN(q) || q <= 0) {
      await appAlert(t("inAlertEnterQty"))
      return
    }
    setCart((prev) => [
      ...prev,
      {
        date: outDate || new Date().toISOString().slice(0, 10),
        deliveryDate: deliveryDate || "",
        store: outStore,
        code: selectedItem.code,
        name: selectedItem.name,
        spec: selectedItem.spec || "",
        qty: outQty,
      },
    ])
    setSelectedItem(null)
    setOutQty("")
  }

  const handleRemoveFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!cart.length) {
      await appAlert(t("outEmptyList"))
      return
    }
    if (!outReferenceNo.trim()) {
      await appAlert(`${t("outReferenceNoLabel")} ${t("required")}`)
      return
    }
    if (!await appConfirm(t("outConfirmMsg"))) return
    setSaving(true)
    try {
      const list = cart.map((c) => ({
        date: c.date,
        deliveryDate: c.deliveryDate || undefined,
        store: c.store,
        code: c.code,
        name: c.name,
        spec: c.spec,
        qty: c.qty,
      }))
      const res = await forceOutboundBatch(list, {
        processorName: auth?.user,
        referenceNo: outReferenceNo.trim(),
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("outSaveSuccess"))
        setCart([])
        setOutReferenceNo("")
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("outSaveFailed"))
      }
    } catch {
      await appAlert(t("outProcessFail"))
    } finally {
      setSaving(false)
    }
  }

  const fetchWarehouseOutbound = React.useCallback(async () => {
    if (!whStart || !whEnd) {
      await appAlert(t("visit_stats_date_hint"))
      return
    }
    setWhLoading(true)
    setWhData(null)
    try {
      const res = await getOutboundByWarehouse({
        startStr: whStart,
        endStr: whEnd,
        filterBy: whFilterBy,
      })
      if (res && typeof res === "object" && ("byWarehouse" in res || "warehouseOrder" in res)) {
        setWhData(res)
      } else {
        setWhData({ byWarehouse: {}, warehouseOrder: [], period: { start: whStart, end: whEnd }, filterBy: whFilterBy })
      }
    } catch (err) {
      console.error("getOutboundByWarehouse:", err)
      setWhData(null)
      const msg = err instanceof Error ? err.message : String(err)
      await appAlert(t("orderNoData") + "\n\n" + t("msg_error_prefix") + msg)
    } finally {
      setWhLoading(false)
    }
  }, [whStart, whEnd, whFilterBy, t])

  const whWarehouseSelectOptions = React.useMemo(() => {
    const fromData = whData?.warehouseOrder || []
    const fromLocs = whWarehouseOptions
    const merged = [...new Set([...fromData, ...fromLocs])].filter(Boolean).sort()
    return merged
  }, [whData?.warehouseOrder, whWarehouseOptions])

  const fetchInvSettings = React.useCallback(async () => {
    setInvSettingsLoading(true)
    try {
      const s = await getInvoiceSettings()
      setInvSettings(typeof s === "object" && s !== null ? s : {})
    } catch {
      setInvSettings({})
    } finally {
      setInvSettingsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (tabValue === "invoice" && isOffice) fetchInvSettings()
  }, [tabValue, isOffice, fetchInvSettings])

  const handleSaveInvSettings = async () => {
    setInvSettingsSaving(true)
    try {
      const res = await updateInvoiceSettings(invSettings)
      if (res.success) {
        await appAlert(t("inv_settings_saved"))
      } else {
        await appAlert(res.message || t("outSaveFailed"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setInvSettingsSaving(false)
    }
  }

  const whStoreSelectOptions = React.useMemo(() => {
    if (whData?.byWarehouse) {
      const fromData = [...new Set(
        Object.values(whData.byWarehouse).flatMap((rows) => rows.map((r) => r.store).filter(Boolean))
      )].sort()
      const merged = [...new Set([...fromData, ...outboundTargets])].filter(Boolean).sort()
      return merged
    }
    return outboundTargets
  }, [whData?.byWarehouse, outboundTargets])

  const whFilteredData = React.useMemo(() => {
    if (!whData || !whData.byWarehouse) return { order: [] as string[], byWarehouse: {} as Record<string, { store: string; code: string; name: string; spec: string; qty: number; deliveryDate: string; source: "Order" | "Force" }[]> }
    const itemQ = whItemFilter.trim().toLowerCase()
    const unspecifiedRaw = "(미지정)"
    const filteredOrder = whWarehouseFilter
      ? whData.warehouseOrder.filter((wn) => (wn || unspecifiedRaw) === whWarehouseFilter)
      : whData.warehouseOrder
    const filteredByWh: Record<string, { store: string; code: string; name: string; spec: string; qty: number; deliveryDate: string; source: "Order" | "Force" }[]> = {}
    for (const wn of filteredOrder) {
      let rows = whData.byWarehouse[wn] || []
      if (whStoreFilter) rows = rows.filter((r) => (r.store || "").trim() === whStoreFilter)
      if (itemQ) rows = rows.filter((r) => (r.name || "").toLowerCase().includes(itemQ) || (r.code || "").toLowerCase().includes(itemQ))
      if (rows.length > 0) filteredByWh[wn] = [...rows].sort((a, b) => compareItemCodes(a.code, b.code))
    }
    return { order: Object.keys(filteredByWh).filter((wn) => (filteredByWh[wn] || []).length > 0), byWarehouse: filteredByWh }
  }, [whData, whWarehouseFilter, whStoreFilter, whItemFilter])

  React.useEffect(() => {
    if (whFilteredData.order.length > 0) {
      setWhSelectedWarehouses(new Set(whFilteredData.order))
    } else {
      setWhSelectedWarehouses(new Set())
    }
  }, [whFilteredData.order])

  const toggleWhSelect = (wn: string) => {
    setWhSelectedWarehouses((prev) => {
      const next = new Set(prev)
      if (next.has(wn)) next.delete(wn)
      else next.add(wn)
      return next
    })
  }

  const toggleWhSelectAll = () => {
    if (whSelectedWarehouses.size >= whFilteredData.order.length) {
      setWhSelectedWarehouses(new Set())
    } else {
      setWhSelectedWarehouses(new Set(whFilteredData.order))
    }
  }

  const whOrderToUse = React.useMemo(() => whFilteredData.order.filter((wn) => whSelectedWarehouses.has(wn)), [whFilteredData.order, whSelectedWarehouses])

  const handleWarehousePrint = async () => {
    if (!whData || whOrderToUse.length === 0) {
      await appAlert(whFilteredData.order.length === 0 ? t("outWhNoDataHint") : t("outSelectWarehouseForPrint"))
      return
    }
    const filterLabel = whData.filterBy === "delivery" ? t("outWhFilterDelivery") : t("outWhFilterOrder")
    const _title = `${t("outTabByWarehouse")} [${filterLabel}] (${whData.period.start} ~ ${whData.period.end})`
    const colCheck = t("store_check")
    const colCode = t("outColCode")
    const colItem = t("outColItem")
    const colSpec = t("spec")
    const colQty = t("outColQty")
    const colDeliveryDate = t("orderColDeliveryDate")
    const _colStore = t("outColStore")
    const whLabel = t("outWhWarehouseCol")
    const packingListTitle = t("outWhPackingList")
    const periodLabel = t("outWhPeriod")
    const outboundColLabel = t("outWhOutboundCol")
    const itemCountLabel = t("outWhItemCountLabel")
    const totalQtyLabel = t("outWhTotalQtyLabel")
    const checkBoxHtml = '<span style="display:inline-block;width:16px;height:16px;border:2px solid #475569;border-radius:3px;background:#fff;vertical-align:middle;"></span>'
    const printWindow = window.open("", "_blank")
    if (!printWindow) return
    const escape = (s: string) => (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const sections: string[] = []
    const tableStyle = "width:100%; border-collapse:collapse; margin:12px 0; font-size:12px; box-shadow:0 1px 3px rgba(0,0,0,0.06); border-radius:4px; overflow:hidden;"
    const thStyle = "background:linear-gradient(180deg, #1e40af 0%, #1e3a8a 100%); color:#fff; padding:10px 12px; text-align:center; border:1px solid #1e3a8a; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.5px;"
    const tdStyle = (idx: number) => `padding:10px 12px; border:1px solid #e2e8f0; ${idx % 2 === 0 ? "background:#f8fafc;" : "background:#fff;"}`

    // 배송일 → 매장 기준으로 그룹, 매장 내에서 Jidubang/S&J 등 출고지별 구분 출력
    const allRows: { wh: string; row: { store: string; code: string; name: string; spec: string; qty: number; deliveryDate: string } }[] = []
    for (const wn of whOrderToUse) {
      const items = whFilteredData.byWarehouse[wn] || []
      for (const r of items) allRows.push({ wh: wn, row: r })
    }
    type WhRow = typeof allRows[0]["row"]
    const byDateThenStoreThenWh = new Map<string, Map<string, Map<string, WhRow[]>>>()
    for (const { wh, row } of allRows) {
      const date = row.deliveryDate || t("outWhUnspecified")
      const store = row.store || t("outWhUnspecified")
      if (!byDateThenStoreThenWh.has(date)) byDateThenStoreThenWh.set(date, new Map())
      const storeMap = byDateThenStoreThenWh.get(date)!
      if (!storeMap.has(store)) storeMap.set(store, new Map<string, WhRow[]>())
      const whMap = storeMap.get(store)!
      if (!whMap.has(wh)) whMap.set(wh, [] as WhRow[])
      whMap.get(wh)!.push(row)
    }

    // (date, store)별 총 건수 미리 계산
    const totalByDateStore = new Map<string, number>()
    let totalPageCount = 0
    for (const date of Array.from(byDateThenStoreThenWh.keys())) {
      const storeMap = byDateThenStoreThenWh.get(date)!
      for (const [storeName, whMap] of storeMap) {
        let total = 0
        for (const wn of whOrderToUse) {
          const whItems = whMap.get(wn) || []
          const jc = whItems.filter((r) => /^jd/i.test(r.code)).length
          const hc = whItems.filter((r) => !/^jd/i.test(r.code)).length
          total += jc + hc
          if (jc > 0) totalPageCount++
          if (hc > 0) totalPageCount++
        }
        if (total > 0) totalByDateStore.set(`${date}|${storeName}`, total)
      }
    }

    // 창고+품목유형별로 각각 한 장씩 인쇄 (헤더는 매 페이지 동일하게 반복)
    let firstSection = true
    let pageNum = 0
    for (const date of Array.from(byDateThenStoreThenWh.keys()).sort()) {
      const storeMap = byDateThenStoreThenWh.get(date)!
      for (const [storeName, whMap] of Array.from(storeMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        const totalForStore = totalByDateStore.get(`${date}|${storeName}`) ?? 0
        for (const wn of whOrderToUse) {
          const whItems = whMap.get(wn) || []
          if (whItems.length === 0) continue
          const whDisplay = (wn === "(미지정)" || !wn) ? t("outWhUnspecified") : wn
          const jidubangItems = whItems.filter((r) => /^jd/i.test(r.code))
          const hqItems = whItems.filter((r) => !/^jd/i.test(r.code))
          const itemGroups: { label: string; items: WhRow[] }[] = [
            { label: t("outWhItemTypeJidubang"), items: jidubangItems },
            { label: t("outWhItemTypeHq"), items: hqItems },
          ]
          for (const { label, items } of itemGroups) {
            if (items.length === 0) continue
            pageNum++
            const pageBreakBefore = firstSection ? "" : " page-break-before: always;"
            firstSection = false
            const whDisplayForHeader = `${whDisplay} - ${label}`
            const countStr = totalForStore > 0
              ? `${items.length}/${totalForStore} ${t("outWhCountSuffix")} (${t("outWhWarehouseAll")})`
              : `${items.length} ${t("outWhCountSuffix")}`
            const sumQty = items.reduce((s, r) => s + (r.qty || 0), 0)
            const storeHeaderHtml = `<div style="margin-bottom:20px;">
          <h2 style="margin:0 0 12px 0; font-size:1.35rem; font-weight:700; color:#0f172a;">${escape(packingListTitle)} - ${escape(storeName)}</h2>
          <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">
            <thead><tr style="background:linear-gradient(180deg, #1e40af 0%, #1e3a8a 100%); color:#fff;">
              <th style="padding:10px 14px; text-align:center; font-weight:600;">${escape(periodLabel)}</th>
              <th style="padding:10px 14px; text-align:center; font-weight:600;">${escape(outboundColLabel)}</th>
              <th style="padding:10px 14px; text-align:center; font-weight:600;">${escape(itemCountLabel)}</th>
              <th style="padding:10px 14px; text-align:center; font-weight:600;">${escape(totalQtyLabel)}</th>
            </tr></thead>
            <tbody><tr>
              <td style="padding:12px 14px; border-top:1px solid #e2e8f0; background:#f8fafc; text-align:center; font-weight:600;">${escape(date)}</td>
              <td style="padding:12px 14px; border-top:1px solid #e2e8f0; text-align:center; font-weight:600;">${escape(whDisplayForHeader)}</td>
              <td style="padding:12px 14px; border-top:1px solid #e2e8f0; text-align:center; font-weight:600;">${escape(countStr)}</td>
              <td style="padding:12px 14px; border-top:1px solid #e2e8f0; text-align:center; font-weight:600; color:#dc2626;">${sumQty}</td>
            </tr></tbody>
          </table>
        </div>`
            let rowIdx = 0
            const storeRows = items.map((r) => {
              const style = tdStyle(rowIdx++)
              return `<tr><td style="${style}text-align:center;font-weight:500;">${escape(r.code)}</td><td style="${style}">${escape(r.name)}</td><td style="${style}text-align:center;color:#64748b;">${escape(r.spec)}</td><td style="${style}text-align:center;font-weight:600;">${r.qty}</td><td style="${style}text-align:center;min-width:52px;width:52px;">${checkBoxHtml}</td><td style="${style}text-align:center;white-space:nowrap;min-width:90px;">${escape(r.deliveryDate)}</td></tr>`
            })
            const totalRowHtml = `<tr style="background:#fef2f2;"><td colspan="3" style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">${escape(t("inv_total"))}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#dc2626;">${sumQty}</td><td colspan="2" style="padding:10px 12px;border:1px solid #e2e8f0;"></td></tr>`
            const tableHtml = `<div style="margin-bottom:20px;">
            <h4 style="margin:0 0 8px 0; font-size:1rem; font-weight:600; color:#334155;">${whLabel}: ${escape(whDisplay)} — ${escape(label)}</h4>
            <table style="${tableStyle}">
              <thead><tr><th style="${thStyle}">${colCode}</th><th style="${thStyle}">${colItem}</th><th style="${thStyle}">${colSpec}</th><th style="${thStyle}">${colQty}</th><th style="${thStyle} min-width:52px; width:52px; white-space:nowrap;">${colCheck}</th><th style="${thStyle} min-width:90px; white-space:nowrap;">${colDeliveryDate}</th></tr></thead>
              <tbody>${storeRows.join("")}${totalRowHtml}</tbody>
            </table>
          </div>`
            const pageLabel = t("outWhPrintPageOf")
              .replace("%1", String(pageNum))
              .replace("%2", String(totalPageCount))
            const pageFooterHtml = totalPageCount > 0
              ? `<div class="wh-print-page-footer" style="margin-top:20px; padding-top:12px; border-top:1px solid #e2e8f0; text-align:center; font-size:11px; color:#64748b;">${escape(pageLabel)}</div>`
              : ""
            sections.push(`
        <div class="wh-print-section wh-print-store-page" style="margin-bottom:32px;${pageBreakBefore}">
          ${storeHeaderHtml}
          ${tableHtml}
          ${pageFooterHtml}
        </div>
      `)
          }
        }
      }
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"/><title>${escape(packingListTitle)}</title>
      <style>
        *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:'Inter','Pretendard','Noto Sans KR','Sukhumvit Set','Noto Sans Thai',Arial,sans-serif; padding:24px; font-size:12px; color:#0f172a; line-height:1.5; max-width:210mm; margin:0 auto;}
        .wh-print-section{margin-bottom:28px;}
        @media print{
          @page{margin:12mm;size:A4}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          body{padding:0;}
          .wh-print-store-page{page-break-inside:avoid;position:relative;min-height:273mm;padding:0 12px 48px 12px;box-sizing:border-box;}
          .wh-print-store-page:not(:first-of-type){page-break-before:always;}
          .wh-print-page-footer{position:absolute;bottom:0;left:0;right:0;}
        }
      </style>
      </head><body>
        ${sections.join("")}
      </body></html>`)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  const handleWarehouseExcel = async () => {
    if (!whData || whOrderToUse.length === 0) {
      await appAlert(whFilteredData.order.length === 0 ? t("outWhNoDataHint") : t("outSelectWarehouseForExcel"))
      return
    }
    const escapeCsv = (s: string) => {
      const t = String(s ?? "")
      if (t.includes(",") || t.includes('"') || t.includes("\n") || t.includes("\r"))
        return '"' + t.replace(/"/g, '""') + '"'
      return t
    }
    const rows: string[][] = [
      [t("outTabByWarehouse")],
      [`${t("outWhFilterBy")}: ${whData.filterBy === "delivery" ? t("outWhFilterDelivery") : t("outWhFilterOrder")}, ${t("outFilterPeriod")}: ${whData.period.start} ~ ${whData.period.end}`],
      [],
      [t("outWhWarehouseCol"), t("outColStore"), t("outColCode"), t("outColItem"), t("spec"), t("outColQty"), t("orderColDeliveryDate")],
    ]
    whOrderToUse.forEach((wn) => {
      ;(whFilteredData.byWarehouse[wn] || []).forEach((r) => {
        rows.push([wn, r.store, r.code, r.name, r.spec, String(r.qty), r.deliveryDate])
      })
    })
    const csv = "\uFEFF" + rows.map((r) => r.map(escapeCsv).join(",")).join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `warehouse_outbound_${whData.period.start}_${whData.period.end}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const fetchHistory = React.useCallback(async () => {

    let s = histStart
    let e = histEnd
    if (histMonth) {
      const { startStr, endStr } = getBangkokMonthRange(histMonth)
      s = startStr
      e = endStr
    }
    if (!s || !e) return
    setHistoryLoading(true)
    setSelectedForPrint(new Set())
    try {
      if (isOffice) {
        const list = await getCombinedOutboundHistory({
          startStr: s,
          endStr: e,
          vendorFilter: histStore || undefined,
          typeFilter: histType || undefined,
          itemSearch: itemSearch.trim() || undefined,
        })
        setHistoryList(Array.isArray(list) ? list : [])
        setUsageList([])
      } else {
        const list = await getCombinedOutboundHistory({
          startStr: s,
          endStr: e,
          vendorFilter: auth?.store || undefined,
          typeFilter: histType || undefined,
          itemSearch: itemSearch.trim() || undefined,
        })
        setHistoryList(Array.isArray(list) ? list : [])
        const usageListRes = await getMyUsageHistory({
          store: auth?.store || "",
          startStr: s,
          endStr: e,
        })
        setUsageList(Array.isArray(usageListRes) ? usageListRes : [])
      }
    } catch {
      setHistoryList([])
      setUsageList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [histStart, histEnd, histMonth, histStore, histType, itemSearch, isOffice, auth?.store])

  const handleStoreMonthDrill = React.useCallback(
    (params: { store: string; yearMonth: string }) => {
      setHistTargetType("store")
      setHistStore(params.store)
      handleHistMonthChange(params.yearMonth)
      setTabValue("hist")
      plDrillAutoFetchRef.current = false
      void fetchHistory()
    },
    [handleHistMonthChange, fetchHistory]
  )

  React.useEffect(() => {
    if (!plDrillNavAppliedRef.current || plDrillAutoFetchRef.current) return
    if (!histStart || !histEnd) return
    plDrillAutoFetchRef.current = true
    void fetchHistory()
  }, [histStart, histEnd, fetchHistory])

  const fetchSummaryHistory = React.useCallback(async () => {
    let s = histStart
    let e = histEnd
    if (histMonth) {
      const { startStr, endStr } = getBangkokMonthRange(histMonth)
      s = startStr
      e = endStr
    }
    if (!s || !e) return
    setHistoryLoading(true)
    try {
      const list = await getCombinedOutboundHistory({
        startStr: s,
        endStr: e,
        // 집계 탭은 내역조회의 숨은 조건(histStore, histType)을 타지 않게 분리
        vendorFilter: isOffice ? undefined : auth?.store || undefined,
        itemSearch: summaryMenuSearch.trim() || undefined,
      })
      setHistoryList(Array.isArray(list) ? list : [])
      if (!isOffice) {
        const usageListRes = await getMyUsageHistory({
          store: auth?.store || "",
          startStr: s,
          endStr: e,
        })
        setUsageList(Array.isArray(usageListRes) ? usageListRes : [])
      } else {
        setUsageList([])
      }
    } catch {
      setHistoryList([])
      setUsageList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [histStart, histEnd, histMonth, summaryMenuSearch, isOffice, auth?.store])

  React.useEffect(() => {
    if (tabValue === "summary" && historyList.length === 0 && !historyLoading) {
      fetchSummaryHistory()
    }
  }, [tabValue, historyList.length, historyLoading, fetchSummaryHistory])

  /** 출고처 드롭다운: 마스터 목록 + 조회 결과에 나온 매출처 병합 */
  const outboundTargetsForFilter = React.useMemo(() => {
    const fromHist = [...new Set(historyList.map((i) => i.target).filter(Boolean))]
    return [...new Set([...outboundTargets, ...fromHist])]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  }, [outboundTargets, historyList])

  const normalizedDeliveryStatus = (s: string) => {
    const v = String(s || "").trim()
    if (v.includes("일부") || v.includes("Partial")) return "일부배송완료"
    if (v.includes("배송완료") || v.includes("Delivered") || v.includes("수령완료") || v.includes("수령")) return "배송완료"
    if (v.includes("배송중") || v.includes("Transit")) return "배송중"
    return v || ""
  }

  const groupedHistory = React.useMemo(() => {
    const g: Record<string, {
      date: string
      target: string
      type: string
      totalQty: number
      totalAmt: number
      items: OutboundHistoryItem[]
      invoiceNo?: string
      receiveImageUrl?: string
      receiveImageUrls?: string[]
    }> = {}
    for (const i of historyList) {
      const target = String(i.target || "").trim()
      const type = String(i.type || "")
      const orderRowId = String(i.orderRowId || "").trim()
      const invoiceNo = String(i.invoiceNo || "").trim()
      // 주문 출고: IV 번호가 같으면 한 행으로 합침 (출고처 표기 차이·창고별 분할로 같은 IV가 여러 줄이 되던 문제)
      const k =
        orderRowId && invoiceNo
          ? `${invoiceNo}_${type}_${orderRowId}`
          : i.stockLogId
            ? `force_${i.stockLogId}_${target}_${type}`
            : `${i.date}_${target}_${type}_${orderRowId}`
      if (!g[k]) {
        g[k] = {
          date: i.date,
          target,
          type,
          totalQty: 0,
          totalAmt: 0,
          items: [],
        }
      }
      g[k].items.push(i)
      g[k].totalQty += i.qty
      g[k].totalAmt += (i.amount || 0)
      if (i.date && i.date < g[k].date) g[k].date = i.date
      if (i.invoiceNo) g[k].invoiceNo = i.invoiceNo
      if (i.receiveImageUrls?.length) g[k].receiveImageUrls = i.receiveImageUrls
      else if (i.receiveImageUrl) g[k].receiveImageUrl = i.receiveImageUrl
    }
    return Object.values(g).sort((a, b) => (b.date + b.target).localeCompare(a.date + a.target))
  }, [historyList])

  const filteredGroupedHistory = React.useMemo(() => {
    if (!isOffice) return groupedHistory
    let result = groupedHistory
    if (histTargetType && !histStore) {
      if (histTargetType === "store") {
        result = result.filter((g) => storeTargets.includes(g.target))
      } else if (histTargetType === "sales") {
        result = result.filter((g) => salesTargets.includes(g.target))
      }
    }
    if (histDeliveryStatus) {
      result = result.filter((g) => {
        const first = g.items[0]
        const ds = normalizedDeliveryStatus(first?.deliveryStatus || "")
        if (histDeliveryStatus === "배송완료") return ds === "배송완료"
        if (histDeliveryStatus === "일부배송완료") return ds === "일부배송완료"
        if (histDeliveryStatus === "배송중") return ds === "배송중"
        return true
      })
    }
    if (invoiceSearch.trim()) {
      const qInv = invoiceSearch.trim().toLowerCase()
      result = result.filter((g) => (g.invoiceNo || "").toLowerCase().includes(qInv))
    }
    if (itemSearch.trim()) {
      const qItem = itemSearch.trim().toLowerCase()
      result = result.filter((g) =>
        g.items.some(
          (it) =>
            (it.name || "").toLowerCase().includes(qItem) ||
            (it.code || "").toLowerCase().includes(qItem) ||
            (it.spec || "").toLowerCase().includes(qItem)
        )
      )
    }
    return result
  }, [groupedHistory, histTargetType, histStore, storeTargets, salesTargets, histDeliveryStatus, invoiceSearch, itemSearch, isOffice])

  const displayGroupedHistory = React.useMemo(() => {
    const normalizeOutboundSort = (s: string) => {
      const v = normalizedDeliveryStatus(s || "")
      if (v === "배송완료") return "3"
      if (v === "일부배송완료") return "2"
      if (v === "배송중") return "1"
      return "0"
    }
    const direction = historySortDir === "asc" ? 1 : -1
    const rows = [...filteredGroupedHistory]
    rows.sort((a, b) => {
      const aFirst = a.items[0]
      const bFirst = b.items[0]
      const aOrderDate = String(aFirst?.orderDate || a.date || "").slice(0, 10)
      const bOrderDate = String(bFirst?.orderDate || b.date || "").slice(0, 10)
      const aDeliveryDate = String(aFirst?.deliveryDate || "").slice(0, 10)
      const bDeliveryDate = String(bFirst?.deliveryDate || "").slice(0, 10)
      const aInv = String(a.invoiceNo || "")
      const bInv = String(b.invoiceNo || "")
      const aOrderType = String(a.type || "")
      const bOrderType = String(b.type || "")
      const aOutboundType = normalizeOutboundSort(String(aFirst?.deliveryStatus || ""))
      const bOutboundType = normalizeOutboundSort(String(bFirst?.deliveryStatus || ""))
      const aPhoto = aFirst?.orderRowId ? 1 : 0
      const bPhoto = bFirst?.orderRowId ? 1 : 0
      const aTarget = String(a.target || "")
      const bTarget = String(b.target || "")
      const aItem = a.items.length > 0 ? String(a.items[0]?.name || "") : ""
      const bItem = b.items.length > 0 ? String(b.items[0]?.name || "") : ""
      const aQty = Number(a.totalQty || 0)
      const bQty = Number(b.totalQty || 0)
      const aAmount = Number(a.totalAmt || 0)
      const bAmount = Number(b.totalAmt || 0)

      const compareString = (x: string, y: string) => x.localeCompare(y, "ko", { sensitivity: "base" })
      const compareNumber = (x: number, y: number) => x - y

      let primary = 0
      switch (historySortKey) {
        case "orderDate":
          primary = compareString(aOrderDate, bOrderDate)
          break
        case "deliveryDate":
          primary = compareString(aDeliveryDate, bDeliveryDate)
          break
        case "invoiceNo":
          primary = compareString(aInv, bInv)
          break
        case "orderType":
          primary = compareString(aOrderType, bOrderType)
          break
        case "outboundType":
          primary = compareString(aOutboundType, bOutboundType)
          break
        case "photo":
          primary = compareNumber(aPhoto, bPhoto)
          break
        case "target":
          primary = compareString(aTarget, bTarget)
          break
        case "item":
          primary = compareString(aItem, bItem)
          break
        case "qty":
          primary = compareNumber(aQty, bQty)
          break
        case "amount":
          primary = compareNumber(aAmount, bAmount)
          break
      }
      if (primary !== 0) return primary * direction

      const fallback = compareString(aOrderDate + aTarget + aInv, bOrderDate + bTarget + bInv)
      return fallback * -1
    })
    return rows
  }, [filteredGroupedHistory, historySortDir, historySortKey])

  const shipmentTableRows = React.useMemo((): ShipmentTableRow[] => {
    return displayGroupedHistory.map((g, i) => {
      const first = g.items[0]
      const orderDate = first?.orderDate || g.date?.slice(0, 10) || ""
      const deliveryDateYmds = [
        ...new Set(
          g.items
            .map((it) => (it.deliveryDate || "").slice(0, 10))
            .filter((d) => d && d !== "-")
        ),
      ].sort()
      const deliveryDate =
        deliveryDateYmds.length === 0
          ? first?.deliveryDate || ""
          : deliveryDateYmds.length === 1
            ? deliveryDateYmds[0]
            : `${deliveryDateYmds[0]}~${deliveryDateYmds[deliveryDateYmds.length - 1]}`
      const deliveryStatus = first?.deliveryStatus
      const itemsSummary =
        g.items.length === 1
          ? `${first?.name || ""}${first?.spec ? ` (${first.spec})` : ""}`
          : `${g.items[0]?.name || ""} ${t("inEtcCount")} ${g.items.length - 1}`
        return {
        id: `g-${i}-${g.date}-${g.target}`,
        orderDate,
        deliveryDate: deliveryDate.slice(0, 10) || deliveryDate || "-",
        invoiceNo: g.invoiceNo || "-",
        target: g.target || "-",
        type: g.type || "Force",
        deliveryStatus,
        orderRowId: first?.orderRowId,
        items: g.items.map((it) => ({
          name: it.name || "",
          code: it.code || "",
          spec: it.spec || "",
          qty: it.qty || 0,
          amount: it.amount || 0,
          originalOrderQty: it.originalOrderQty,
          qtyStages: it.qtyStages,
          outboundLocation: it.outboundLocation || "(미지정)",
          deliveryDate: it.deliveryDate ? it.deliveryDate.slice(0, 10) : undefined,
          isUnreceived: it.isUnreceived,
          stockLogId: it.stockLogId,
        })),
        itemsSummary,
        totalQty: g.totalQty,
        totalAmt: g.totalAmt,
        receiveImageUrl: g.receiveImageUrls?.[0] ?? g.receiveImageUrl,
        receiveImageUrls: g.receiveImageUrls ?? (g.receiveImageUrl ? [g.receiveImageUrl] : undefined),
      }
    })
  }, [displayGroupedHistory, isOffice, t])

  const handleDeleteSelectedOutbounds = React.useCallback(async () => {
    if (!isOffice) return
    if (deletingOutbound) return
    const sortedIdx = Array.from(selectedForPrint).sort((a, b) => a - b)
    if (sortedIdx.length === 0) {
      await appAlert(t("outSelectForDelete"))
      return
    }
    const selectedRows = sortedIdx.map((i) => shipmentTableRows[i]).filter(Boolean)
    if (selectedRows.length === 0) {
      await appAlert(t("outSelectForDelete"))
      return
    }
    const jobs: OutboundDeleteJob[] = []
    for (const row of selectedRows) {
      const j = deleteJobFromShipmentRow(row)
      if (j) jobs.push(j)
    }
    if (jobs.length === 0) {
      await appAlert(
        t("outDeleteNoneApplicable") ||
          "체크한 항목은 출고 삭제 대상이 아닙니다. (주문 출고: 주문 식별 필요, 강제출고: 출고 로그 필요)"
      )
      return
    }
    if (jobs.length < selectedRows.length) {
      const ok = await appConfirm(
        t("outDeletePartialConfirm") ||
          `체크 ${selectedRows.length}건 중 ${jobs.length}건만 삭제할 수 있습니다. 계속할까요?`
      )
      if (!ok) return
    }
    setDeletingOutbound(true)
    try {
      const allConflicts: string[] = []
      const receivableMerge: Record<string, number> = {}
      let totalLogCount = 0
      let anyOrderCancelOnly = false
      for (const j of jobs) {
        const preview = await previewDeleteOutbound({
          mode: j.mode,
          ...(j.mode === "order" && j.orderId ? { orderId: j.orderId } : {}),
          ...(j.mode === "force" && j.stockLogIds?.length ? { stockLogIds: j.stockLogIds } : {}),
        })
        if (!preview?.success) {
          await appAlert(translateApiMessage(preview?.message, t) || preview?.message || t("outDeletePreviewFailed"))
          return
        }
        if (preview.orderCancelWithoutOutboundLogs) anyOrderCancelOnly = true
        totalLogCount += Number(preview.targetCount || 0)
        for (const c of preview.conflicts || []) {
          allConflicts.push(`- ${c.message}`)
        }
        for (const [store, amount] of Object.entries(preview.receivableDeleteByStore || {})) {
          receivableMerge[store] = (receivableMerge[store] || 0) + Number(amount || 0)
        }
      }
      const receivableImpactLines = Object.entries(receivableMerge)
        .map(([store, amount]) => `- ${store}: ${Number(amount || 0).toLocaleString()}`)
        .slice(0, 12)
      const detailLines: string[] = jobs.slice(0, 5).map((j) => {
        const typeLabel = j.mode === "order" ? t("outTypeOrder") : t("outTypeForce")
        return `- ${j.target} / ${typeLabel} / ${j.orderDate || "-"}`
      })
      if (jobs.length > 5) {
        detailLines.push(`- … ${t("inEtcCount")} ${jobs.length - 5}`)
      }
      const summaryLines =
        anyOrderCancelOnly && totalLogCount === 0
          ? [
              "승인만 된 주문(출고 로그 없음) → 주문 취소(반려) 처리됩니다.",
              `대상: ${jobs.length.toLocaleString()}건`,
              ...detailLines,
              "",
            ]
          : [
              `대상 그룹: ${jobs.length.toLocaleString()}건, 출고 로그(항목) 합계: ${totalLogCount.toLocaleString()}건`,
              ...detailLines,
              "",
            ]
      if (receivableImpactLines.length > 0) {
        summaryLines.push("삭제 시 미수금 감소 예상:", ...receivableImpactLines)
      }
      if (allConflicts.length > 0) {
        summaryLines.push("", "삭제 충돌:", ...allConflicts)
        if (allConflicts.some((c) => c.includes("store_purchase") || c.includes("회계 분개"))) {
          summaryLines.push(
            "",
            t("outDeleteJournalConflictHint") ||
              "회계팀: 미수금 관리 → 해당 주문 행의 「분개」에서 store_purchase 분개를 삭제한 뒤 다시 시도하세요."
          )
        }
        await appAlert(summaryLines.join("\n"))
        return
      }
      const reason = (await appPrompt(`${summaryLines.join("\n")}\n\n삭제 사유를 입력해 주세요.`))?.trim()
      if (!reason) return
      const ok2 = await appConfirm(
        anyOrderCancelOnly && totalLogCount === 0
          ? `승인 주문을 취소(반려)할까요?\n\n사유: ${reason}\n대상: ${jobs.length.toLocaleString()}건 (출고 전)`
          : `출고 소프트 삭제를 진행할까요?\n\n사유: ${reason}\n대상 그룹: ${jobs.length.toLocaleString()}건, 출고 항목: ${totalLogCount.toLocaleString()}건`
      )
      if (!ok2) return

      const allWarnings: string[] = []
      let didOrderCancelOnly = false
      for (const j of jobs) {
        const idempotencyKey =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `delete-outbound-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const result = await deleteOutbound({
          mode: j.mode,
          reason,
          ...(j.mode === "order" && j.orderId ? { orderId: j.orderId } : {}),
          ...(j.mode === "force" && j.stockLogIds?.length ? { stockLogIds: j.stockLogIds } : {}),
          idempotencyKey,
        })
        if (result.orderCancelWithoutOutboundLogs) didOrderCancelOnly = true
        if (!result.success) {
          const conflictMsg = (result.conflicts || []).map((c) => `- ${c.message}`).join("\n")
          await appAlert(
            [
              translateApiMessage(result.message, t) || result.message || t("outDeleteFailed"),
              `${j.target} / ${j.mode === "order" ? t("outTypeOrder") : t("outTypeForce")}`,
              conflictMsg,
            ]
              .filter(Boolean)
              .join("\n\n")
          )
          await fetchHistory()
          return
        }
        for (const w of result.warnings || []) {
          if (w) allWarnings.push(String(w))
        }
      }
      const warnText = allWarnings.slice(0, 12).join("\n")
      await appAlert(
        [
          didOrderCancelOnly && totalLogCount === 0
            ? `선택 ${jobs.length.toLocaleString()}건 주문이 취소(반려)되었습니다.`
            : `선택 ${jobs.length.toLocaleString()}개 그룹이 삭제되었습니다.`,
          warnText ? `후속 점검 메시지:\n${warnText}` : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      )
      setSelectedForPrint(new Set())
      await fetchHistory()
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setDeletingOutbound(false)
    }
  }, [isOffice, deletingOutbound, selectedForPrint, shipmentTableRows, t, fetchHistory])

  const usageTableRows = React.useMemo(
    () =>
      usageList.map((u) => ({
        date: u.date,
        item: u.item,
        qty: u.qty,
        amount: u.amount || 0,
      })),
    [usageList]
  )

  const summaryCategoryOptions = React.useMemo(() => {
    return [...new Set(items.map((item) => String(item.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [items])

  const itemVendorMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      const code = String(item.code || "").trim()
      const vendor = String(item.vendor || "").trim()
      if (code && vendor && !map.has(code)) map.set(code, vendor)
    }
    return map
  }, [items])

  const summaryVendorOptions = React.useMemo(() => {
    return [...new Set(items.map((item) => String(item.vendor || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [items])

  const itemCategoryMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      const code = String(item.code || "").trim()
      const category = String(item.category || "").trim()
      if (code && category && !map.has(code)) map.set(code, category)
    }
    return map
  }, [items])

  const summarySourceRows = React.useMemo(() => {
    let rows = historyList
    if (summaryStoreFilter) {
      rows = rows.filter((row) => String(row.target || "").trim() === summaryStoreFilter)
    }
    if (summaryVendorFilter) {
      rows = rows.filter((row) => {
        const vendor = itemVendorMap.get(String(row.code || "").trim()) || ""
        return vendor === summaryVendorFilter
      })
    }
    if (summaryCategoryFilter) {
      rows = rows.filter((row) => {
        const category = itemCategoryMap.get(String(row.code || "").trim()) || ""
        return category === summaryCategoryFilter
      })
    }
    if (summaryMenuSearch.trim()) {
      const q = summaryMenuSearch.trim().toLowerCase()
      rows = rows.filter((row) =>
        (row.name || "").toLowerCase().includes(q) ||
        (row.code || "").toLowerCase().includes(q) ||
        (row.spec || "").toLowerCase().includes(q)
      )
    }
    return rows
  }, [historyList, summaryStoreFilter, summaryVendorFilter, summaryCategoryFilter, summaryMenuSearch, itemCategoryMap, itemVendorMap])

  const summaryByTarget = React.useMemo(() => {
    const map = new Map<string, { vendor: string; qty: number; amount: number }>()
    for (const row of summarySourceRows) {
      const vendor = itemVendorMap.get(String(row.code || "").trim()) || "-"
      const current = map.get(vendor)
      if (current) {
        current.qty += Number(row.qty || 0)
        current.amount += Number(row.amount || 0)
      } else {
        map.set(vendor, {
          vendor,
          qty: Number(row.qty || 0),
          amount: Number(row.amount || 0),
        })
      }
    }
    const rows = Array.from(map.values())
    rows.sort((a, b) => {
      const primary = summaryVendorSortBy === "qty" ? a.qty - b.qty : a.amount - b.amount
      if (primary !== 0) return summaryVendorSortDir === "asc" ? primary : -primary
      const secondary = summaryVendorSortBy === "qty" ? a.amount - b.amount : a.qty - b.qty
      if (secondary !== 0) return summaryVendorSortDir === "asc" ? secondary : -secondary
      return a.vendor.localeCompare(b.vendor)
    })
    return rows
  }, [summarySourceRows, itemVendorMap, summaryVendorSortBy, summaryVendorSortDir])

  const summaryByMenu = React.useMemo(() => {
    const map = new Map<string, { code: string; name: string; spec: string; qty: number; amount: number }>()
    for (const row of summarySourceRows) {
      const code = String(row.code || "").trim()
      const name = String(row.name || "").trim()
      const spec = String(row.spec || "").trim()
      const key = `${code}__${name}__${spec}`
      const current = map.get(key)
      if (current) {
        current.qty += Number(row.qty || 0)
        current.amount += Number(row.amount || 0)
      } else {
        map.set(key, {
          code,
          name,
          spec,
          qty: Number(row.qty || 0),
          amount: Number(row.amount || 0),
        })
      }
    }
    const rows = Array.from(map.values())
    rows.sort((a, b) => {
      const primary = summaryMenuSortBy === "qty" ? a.qty - b.qty : a.amount - b.amount
      if (primary !== 0) return summaryMenuSortDir === "asc" ? primary : -primary
      const secondary = summaryMenuSortBy === "qty" ? a.amount - b.amount : a.qty - b.qty
      if (secondary !== 0) return summaryMenuSortDir === "asc" ? secondary : -secondary
      return a.code.localeCompare(b.code) || a.name.localeCompare(b.name)
    })
    return rows
  }, [summarySourceRows, summaryMenuSortBy, summaryMenuSortDir])

  const summaryTargetTotals = React.useMemo(() => {
    const base = summaryByTarget.reduce(
      (acc, row) => ({
        qty: acc.qty + row.qty,
        amount: acc.amount + row.amount,
      }),
      { qty: 0, amount: 0 }
    )
    const tax = thaiInvoiceTotalsFromRawSubtotal(base.amount)
    return {
      ...base,
      vat: tax.vatRounded,
      total: tax.grandTotal,
    }
  }, [summaryByTarget])

  const summaryMenuTotals = React.useMemo(() => {
    const base = summaryByMenu.reduce(
      (acc, row) => ({
        qty: acc.qty + row.qty,
        amount: acc.amount + row.amount,
      }),
      { qty: 0, amount: 0 }
    )
    const tax = thaiInvoiceTotalsFromRawSubtotal(base.amount)
    return {
      ...base,
      vat: tax.vatRounded,
      total: tax.grandTotal,
    }
  }, [summaryByMenu])

  const toggleVendorSort = (field: "qty" | "amount") => {
    if (summaryVendorSortBy === field) {
      setSummaryVendorSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
      return
    }
    setSummaryVendorSortBy(field)
    setSummaryVendorSortDir("desc")
  }

  const toggleMenuSort = (field: "qty" | "amount") => {
    if (summaryMenuSortBy === field) {
      setSummaryMenuSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
      return
    }
    setSummaryMenuSortBy(field)
    setSummaryMenuSortDir("desc")
  }

  const sortMark = (active: boolean, dir: "asc" | "desc") => {
    if (!active) return ""
    return dir === "desc" ? " ▼" : " ▲"
  }

  React.useEffect(() => {
    setSelectedForPrint(new Set())
  }, [invoiceSearch, itemSearch, histDeliveryStatus])

  React.useEffect(() => {
    setSelectedForPrint(new Set())
  }, [historySortKey, historySortDir])

  const togglePrintSelect = (idx: number) => {
    setSelectedForPrint((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const togglePrintSelectAll = () => {
    if (displayGroupedHistory.length === 0) return
    if (selectedForPrint.size >= displayGroupedHistory.length) {
      setSelectedForPrint(new Set())
    } else {
      setSelectedForPrint(new Set(displayGroupedHistory.map((_, i) => i)))
    }
  }

  const handleEtaxXmlDownload = async () => {
    const checked = Array.from(selectedForPrint).sort((a, b) => a - b).map((i) => displayGroupedHistory[i]).filter(Boolean)
    if (checked.length === 0) {
      await appAlert(t("outSelectForPrint"))
      return
    }
    try {
      const groups = checked.map((g) => ({
        date: g.date,
        target: g.target,
        type: g.type || "Force",
        orderRowId: g.items[0]?.orderRowId,
        invoiceNo: g.invoiceNo,
        items: g.items.map((it) => ({
          name: it.name || "-",
          code: it.code,
          spec: it.spec,
          qty: it.qty ?? 0,
          amount: it.amount ?? 0,
        })),
        totalAmt: g.totalAmt ?? 0,
      }))
      const res = await generateEtaxXmlApi(groups, true)
      if (!res.success || res.error) {
        await appAlert(res.error || t("invLoadFailed"))
        return
      }
      if (res.xmls && res.xmls.length > 0) {
        if (res.xmls.length === 1) {
          const blob = new Blob([res.xmls[0].xml], { type: "application/xml;charset=utf-8" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `etax_${res.xmls[0].invoiceNo}.xml`
          a.click()
          URL.revokeObjectURL(url)
        } else {
          for (let i = 0; i < res.xmls.length; i++) {
            const x = res.xmls[i]
            const blob = new Blob([x.xml], { type: "application/xml;charset=utf-8" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `etax_${x.invoiceNo || i + 1}.xml`
            a.click()
            URL.revokeObjectURL(url)
          }
        }
      }
    } catch (e) {
      console.error(e)
      await appAlert(t("invLoadFailed"))
    }
  }

  const downloadSummaryExcel = React.useCallback(
    (headers: string[], dataRows: string[][], summaryRow: string[], filenamePrefix: string) => {
      const escapeXml = (s: string) =>
        String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      const minW = 55
      const pxPerChar = 8
      const colWidths = headers.map((h, c) => {
        let maxLen = String(h).length
        for (const row of dataRows) {
          const len = String(row[c] ?? "").length
          if (len > maxLen) maxLen = len
        }
        const sumLen = String(summaryRow[c] ?? "").length
        if (sumLen > maxLen) maxLen = sumLen
        return Math.max(minW, Math.min(maxLen * pxPerChar + 16, 400))
      })
      const tableBody = `<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
<tr class="head">${headers.map((h) => `<td>${escapeXml(h)}</td>`).join("")}</tr>
${dataRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeXml(cell)}</td>`).join("")}</tr>`).join("")}
<tr class="head">${summaryRow.map((cell) => `<td>${escapeXml(cell)}</td>`).join("")}</tr>
</table>`
      const html = buildErpExcelHtmlDocument(tableBody, erpExcelSimpleTableStyle({ withHead: true }))
      triggerErpExcelHtmlDownload(html, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xls`)
    },
    []
  )

  const handleSummaryVendorExcelDownload = React.useCallback(async () => {
    if (summaryByTarget.length === 0) {
      await appAlert(t("outNoData"))
      return
    }
    const headers = [t("vendor"), t("outColQty"), t("inColAmount"), t("inv_vat7"), t("inv_total")]
    const rows = summaryByTarget.map((row) => {
      const vat = thaiInvoiceTotalsFromRawSubtotal(row.amount)
      return [
        row.vendor,
        String(row.qty),
        String(row.amount),
        String(vat.vatRounded),
        String(vat.grandTotal),
      ]
    })
    const summaryRow = [t("inv_total"), String(summaryTargetTotals.qty), String(summaryTargetTotals.amount), String(summaryTargetTotals.vat), String(summaryTargetTotals.total)]
    downloadSummaryExcel(headers, rows, summaryRow, "outbound_summary_vendor")
  }, [summaryByTarget, summaryTargetTotals, downloadSummaryExcel, t])

  const handleSummaryMenuExcelDownload = React.useCallback(async () => {
    if (summaryByMenu.length === 0) {
      await appAlert(t("outNoData"))
      return
    }
    const headers = [t("outSummaryMenuCol"), t("outColQty"), t("inColAmount"), t("inv_vat7"), t("inv_total")]
    const rows = summaryByMenu.map((row) => {
      const vat = thaiInvoiceTotalsFromRawSubtotal(row.amount)
      return [
        `${row.code ? `[${row.code}] ` : ""}${row.name || "-"}${row.spec ? ` (${row.spec})` : ""}`,
        String(row.qty),
        String(row.amount),
        String(vat.vatRounded),
        String(vat.grandTotal),
      ]
    })
    const summaryRow = [t("inv_total"), String(summaryMenuTotals.qty), String(summaryMenuTotals.amount), String(summaryMenuTotals.vat), String(summaryMenuTotals.total)]
    downloadSummaryExcel(headers, rows, summaryRow, "outbound_summary_menu")
  }, [summaryByMenu, summaryMenuTotals, downloadSummaryExcel, t])

  const handleExcelDownload = async () => {
    const checked = Array.from(selectedForPrint).sort((a, b) => a - b).map((i) => displayGroupedHistory[i]).filter(Boolean)
    if (checked.length === 0) {
      await appAlert(t("outSelectForExcel"))
      return
    }
    const headers = [
      t("orderColDate"),
      t("orderColDeliveryDate"),
      t("outColInvNo"),
      t("outColOrderType"),
      t("outColOutboundType"),
      t("outColStore"),
      t("outColItem"),
      t("spec"),
      t("outColQty"),
      t("inColAmount"),
      t("inv_vat7"),
      t("inv_total"),
    ]
    const dataRows: string[][] = []
    let sumAmount = 0
    let sumVat = 0
    let sumGrand = 0
    for (const g of checked) {
      const orderDate = g.date?.slice(0, 10) || ""
      const deliveryDate = (g.items[0]?.deliveryDate || "").slice(0, 10) || "-"
      const type = g.type || "Force"
      const target = g.target || "-"
      const orderTypeLabel = type === "Force" ? t("outTypeForce") : t("outTypeOrder")
      const deliveryStatus = g.items[0]?.deliveryStatus || ""
      const normDs = (s: string) => {
        const v = String(s || "").trim()
        if (v.includes("일부") || v.includes("Partial")) return t("outDeliveryPartial")
        if (v.includes("배송완료") || v.includes("Delivered")) return t("outDeliveryDelivered")
        if (v.includes("배송중") || v.includes("Transit")) return t("outDeliveryTransit")
        return "-"
      }
      const outboundTypeLabel = type === "Order" ? normDs(deliveryStatus) : "-"
      for (const it of g.items) {
        const name = it.name || "-"
        const spec = it.spec || "-"
        const amount = Number(it.amount ?? 0)
        const vatTotals = thaiInvoiceTotalsFromRawSubtotal(amount)
        sumAmount += amount
        sumVat += vatTotals.vatRounded
        sumGrand += vatTotals.grandTotal
        dataRows.push([
          orderDate,
          deliveryDate,
          g.invoiceNo || "-",
          orderTypeLabel,
          outboundTypeLabel,
          target,
          name,
          spec,
          String(it.qty ?? ""),
          String(amount),
          String(vatTotals.vatRounded),
          String(vatTotals.grandTotal),
        ])
      }
    }
    const summaryLabel = t("inv_total")
    const summaryRow = headers.map(() => "")
    summaryRow[0] = summaryLabel
    summaryRow[9] = String(sumAmount)
    summaryRow[10] = String(sumVat)
    summaryRow[11] = String(sumGrand)
    downloadSummaryExcel(headers, dataRows, summaryRow, "outbound")
  }

  const buildInvoiceData = (
    group: (typeof displayGroupedHistory)[0],
    company: InvoiceDataCompany | null,
    client: InvoiceDataClient | { companyName: string },
    invSettings: Record<string, string>
  ): InvoiceData => {
    const docNo = (group.invoiceNo || `IV-${(group.date || "").replace(/\D/g, "")}`).trim()
    const dateStr = (group.date || "").split(" ")[0] || new Date().toISOString().slice(0, 10)
    const maybeOrderId = Number((group.items || [])[0]?.orderRowId || 0)
    return buildThaiSalesInvoiceData({
      documentType: "Invoice",
      documentNo: docNo,
      issueDate: dateStr,
      dueDate: dateStr,
      referenceNo: group.invoiceNo || "-",
      company,
      client,
      invSettings,
      sourceRefType: Number.isFinite(maybeOrderId) && maybeOrderId > 0 ? "Order" : undefined,
      sourceRefId: Number.isFinite(maybeOrderId) && maybeOrderId > 0 ? maybeOrderId : undefined,
      lines: (group.items || []).map((it) => ({
        code: it.code,
        name: it.name,
        spec: it.spec,
        lineRemarks: it.lineRemarks?.trim() || undefined,
        qty: Math.abs(it.qty || 0),
        amount: Math.abs(it.amount || 0),
      })),
      orderInvoiceTotals: thaiInvoiceTotalsFromRawSubtotal(group.totalAmt || 0),
    })
  }

  const handlePrintInvoice = async () => {
    const checked = Array.from(selectedForPrint).sort((a, b) => a - b).map((i) => displayGroupedHistory[i]).filter(Boolean)
    if (checked.length === 0) {
      await appAlert(t("outSelectForPrint"))
      return
    }
    try {
      const [invoiceDataRes, invSettings] = await Promise.all([getInvoiceData(), getInvoiceSettings()])
      const { company, clients } = invoiceDataRes
      const settings = typeof invSettings === "object" && invSettings !== null ? invSettings : {}
      const orderIdsForBillTo = [
        ...new Set(
          checked
            .map((g) => Math.floor(Number((g.items || [])[0]?.orderRowId || 0)))
            .filter((n) => Number.isFinite(n) && n > 0)
        ),
      ]
      const billToCandRes =
        orderIdsForBillTo.length > 0
          ? await getInvoiceOrderBillToCandidates(orderIdsForBillTo)
          : { map: {}, taxInvoiceClientMap: {} }
      const billToMap = billToCandRes?.map && typeof billToCandRes.map === "object" ? billToCandRes.map : {}
      const taxInvoiceClientMap =
        billToCandRes?.taxInvoiceClientMap && typeof billToCandRes.taxInvoiceClientMap === "object"
          ? billToCandRes.taxInvoiceClientMap
          : {}
      const invoiceDatas: InvoiceData[] = checked.map((g) => {
        const oid = Math.floor(Number((g.items || [])[0]?.orderRowId || 0))
        const memoClient =
          Number.isFinite(oid) && oid > 0 ? taxInvoiceClientMap[String(oid)] : undefined
        const fromOrder = Number.isFinite(oid) && oid > 0 ? billToMap[String(oid)] : undefined
        const candidates =
          Array.isArray(fromOrder) && fromOrder.length > 0
            ? fromOrder
            : [String(g.target || "").trim()].filter(Boolean)
        const resolvedClient =
          candidates.length > 0
            ? resolveInvoiceClientFromBillToCandidates(candidates, company, clients)
            : resolveInvoiceClientForTarget(g.target || "", company, clients)
        const hasResolvedMasterInfo =
          typeof (resolvedClient as { address?: string }).address === "string" &&
          String((resolvedClient as { address?: string }).address || "").trim() !== "-" &&
          String((resolvedClient as { address?: string }).address || "").trim().length > 0
        const targetLabel = String(g.target || "").trim()
        const strictStoreTarget = !/본사|office|hq|head office/i.test(targetLabel)
        const client = strictStoreTarget
          ? resolvedClient
          : (hasResolvedMasterInfo ? resolvedClient : (memoClient ?? resolvedClient))
        return buildInvoiceData(g, company, client, settings)
      })
      sessionStorage.setItem("invoice-print-data", JSON.stringify(invoiceDatas))
      const printWindow = window.open("/admin/invoice-print", "_blank")
      if (!printWindow) {
        await appAlert(t("invLoadFailed") + "\n\n" + t("outPrintPopoverBlocked"))
        return
      }
      printWindow.focus()
    } catch (e) {
      console.error(e)
      await appAlert(t("invLoadFailed"))
    }
  }

  /** 기간 총액: 실제 stock_logs 출고만(미수령 발주 가상 줄 제외) — 손익 본사 출고 매입과 맞춤 */
  const periodTotal = React.useMemo(() => {
    const sumOutboundLogs = (rows: typeof historyList) =>
      rows
        .filter((i) => i.stockLogId != null && i.stockLogId > 0)
        .reduce((sum, i) => sum + (i.amount || 0), 0)
    if (isOffice) return sumOutboundLogs(historyList)
    return usageList.reduce((sum, i) => sum + (i.amount || 0), 0)
  }, [historyList, usageList, isOffice])
  const periodTotalsWithVat = React.useMemo(() => thaiInvoiceTotalsFromRawSubtotal(periodTotal), [periodTotal])

  React.useEffect(() => {
    setTabValue(isOffice ? "new" : "hist")
  }, [isOffice])


  if (loading) {
    return (
      <div className="flex-1 overflow-auto flex items-center justify-center min-h-[200px]">
        <span className="text-muted-foreground">{t("loading")}</span>
      </div>
    )
  }

  const periodTotalFormatted = `${periodTotal.toLocaleString()}${lang === "th" ? " THB" : ""}`
  const periodVatFormatted = `${periodTotalsWithVat.vatRounded.toLocaleString()}${lang === "th" ? " THB" : ""}`
  const periodGrandTotalFormatted = `${periodTotalsWithVat.grandTotal.toLocaleString()}${lang === "th" ? " THB" : ""}`

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ArrowUpFromLine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminOutbound")}</h1>
            <p className="text-xs text-muted-foreground">{t("outPageSub")}</p>
          </div>
        </div>
        <Tabs
          value={tabValue}
          onValueChange={(v) =>
            setTabValue(v as "new" | "hist" | "warehouse" | "invoice" | "summary" | "storeMonth")
          }
          className={adminTabsRootCn}
        >
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                {isOffice && (
                  <TabsTrigger value="new" className={adminTabsTriggerCn}>
                    {t("outTabNew")}
                  </TabsTrigger>
                )}
                <TabsTrigger value="hist" className={adminTabsTriggerCn}>
                  {t("outTabHist")}
                </TabsTrigger>
                {isOffice && (
                  <TabsTrigger value="warehouse" className={adminTabsTriggerCn}>
                    {t("outTabByWarehouse")}
                  </TabsTrigger>
                )}
                {isOffice && (
                  <TabsTrigger value="invoice" className={adminTabsTriggerCn}>
                    {t("outTabInvoice")}
                  </TabsTrigger>
                )}
                {isOffice && (
                  <TabsTrigger value="storeMonth" className={adminTabsTriggerCn}>
                    {t("outTabStoreMonth")}
                  </TabsTrigger>
                )}
                <TabsTrigger value="summary" className={adminTabsTriggerCn}>
                  {t("outTabSummary")}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>

          {isOffice && (
            <TabsContent value="new" className={adminTabsContentCn}>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-2 space-y-4">
                  <div className="rounded-xl border bg-card p-5">
                    <h3 className="text-sm font-bold mb-4">{t("outTabNew")}</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold">{t("outOrderDate")}</label>
                        <Input
                          type="date"
                          value={outDate}
                          onChange={(e) => setOutDate(e.target.value)}
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("outDeliveryDate")}</label>
                        <Input
                          type="date"
                          value={deliveryDate}
                          onChange={(e) => setDeliveryDate(e.target.value)}
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("outReferenceNoLabel")}</label>
                        <Input
                          value={outReferenceNo}
                          onChange={(e) => setOutReferenceNo(e.target.value)}
                          className="mt-1 h-9"
                          autoComplete="off"
                          maxLength={200}
                        />
                        <p className="text-xs text-muted-foreground mt-1">{t("outReferenceNoHint")}</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("outStore")}</label>
                        <Select value={outStore || "__none__"} onValueChange={(v) => setOutStore(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue placeholder={t("outStorePlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{t("outStorePlaceholder")}</SelectItem>
                            {outboundTargets.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("outItem")}</label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            readOnly
                            value={selectedItem ? `${selectedItem.code} ${selectedItem.name}` : ""}
                            placeholder={t("inFindItem")}
                            className="h-9"
                          />
                          <Button size="sm" className="h-9" onClick={() => setPickerOpen(true)}>
                            🔍
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("outQty")}</label>
                        <Input
                          type="number"
                          value={outQty}
                          onChange={(e) => setOutQty(e.target.value)}
                          placeholder={t("outQty")}
                          className="mt-1 h-9"
                          onKeyDown={(e) => e.key === "Enter" && handleAddToList()}
                        />
                      </div>
                      <Button className="w-full" variant="secondary" onClick={handleAddToList}>
                        {t("outAddList")}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold">
                        {t("outWaitList")} <span className="badge bg-muted px-2 py-0.5 rounded text-xs">{cart.length}</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">{t("outColStore")}</th>
                            <th className="text-left py-2 px-2">{t("outColItem")}</th>
                            <th className="text-right py-2 px-2 w-20">{t("outColQty")}</th>
                            <th className="w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">
                                {t("outEmptyList")}
                              </td>
                            </tr>
                          ) : (
                            cart.map((c, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="py-2 px-2">{c.store}</td>
                                <td className="py-2 px-2">{c.name} {c.spec ? `(${c.spec})` : ""}</td>
                                <td className="py-2 px-2 text-right font-medium">{c.qty}</td>
                                <td className="py-2 px-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className={`${ADMIN_BTN_XS_CN} text-destructive hover:text-destructive`}
                                    onClick={() => handleRemoveFromCart(idx)}
                                  >
                                    {t("delete")}
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      className="w-full mt-4"
                      onClick={handleSave}
                      disabled={saving || !cart.length}
                    >
                      {saving ? t("loading") : t("outConfirm")}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          {isOffice && (
            <TabsContent value="warehouse" className={cn(adminTabsContentCn, "space-y-4")}>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground mb-4">{t("outWhHint")}</p>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("outWhFilterBy")}</span>
                    <Select value={whFilterBy} onValueChange={(v) => setWhFilterBy(v as "order" | "delivery")}>
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="delivery">{t("outWhFilterDelivery")}</SelectItem>
                        <SelectItem value="order">{t("outWhFilterOrder")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("outFilterPeriod")}</span>
                    <Input
                      type="date"
                      value={whStart}
                      onChange={(e) => setWhStart(e.target.value)}
                      className="w-[140px] h-9"
                    />
                    <Input
                      type="date"
                      value={whEnd}
                      onChange={(e) => setWhEnd(e.target.value)}
                      className="w-[140px] h-9"
                    />
                  </div>
                  <Button size="sm" onClick={fetchWarehouseOutbound} disabled={whLoading}>
                    {whLoading ? t("loading") : t("btn_query")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleWarehousePrint} disabled={!whData || whOrderToUse.length === 0}>
                    🖨️ {t("outWhPrintPo")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleWarehouseExcel} disabled={!whData || whOrderToUse.length === 0}>
                    📥 {t("outExcelDownload")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{t("outWhWarehouseLabel")}</span>
                    <Select value={whWarehouseFilter || "__all__"} onValueChange={(v) => setWhWarehouseFilter(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder={t("outWhWarehousePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("outWhWarehouseAll")}</SelectItem>
                        {whWarehouseSelectOptions.map((wn) => (
                          <SelectItem key={wn} value={wn}>
                            {(wn === "(미지정)" || !wn) ? t("outWhUnspecified") : wn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{t("outColStore")}</span>
                    <Select value={whStoreFilter || "__all__"} onValueChange={(v) => setWhStoreFilter(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder={t("outStorePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("outWhWarehouseAll")}</SelectItem>
                        {whStoreSelectOptions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{t("outColItem")}</span>
                    <Input
                      placeholder={t("outItemSearchPh")}
                      value={whItemFilter}
                      onChange={(e) => setWhItemFilter(e.target.value)}
                      className="w-[140px] h-9"
                    />
                  </div>
                </div>
                {whLoading ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">{t("loading")}</div>
                ) : whData && (whData.warehouseOrder.length > 0 || Object.keys(whData.byWarehouse).length > 0) ? (
                  <div className="space-y-0">
                    <div className="overflow-x-auto mb-2">
                      <table className="w-full text-sm border-collapse table-fixed" style={{ minWidth: 680 }}>
                        <colgroup>
                          <col style={{ width: 40 }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "22%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "12%" }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b bg-muted/50 sticky top-0 z-10">
                            <th className="py-2 px-2 text-center" style={{ width: 40 }}>
                              <Checkbox
                                checked={whFilteredData.order.length > 0 && whSelectedWarehouses.size >= whFilteredData.order.length}
                                onCheckedChange={toggleWhSelectAll}
                                aria-label={t("outWhSelectAll")}
                              />
                            </th>
                            <th className="py-2 px-2 text-center font-semibold">{t("outWhWarehouseCol")}</th>
                            <th className="py-2 px-2 text-center font-semibold">{t("outColStore")}</th>
                            <th className="py-2 px-2 text-center font-semibold">{t("outColCode")}</th>
                            <th className="py-2 px-2 text-center font-semibold">{t("outColItem")}</th>
                            <th className="py-2 px-2 text-center font-semibold">{t("spec")}</th>
                            <th className="py-2 px-2 text-center font-semibold">{t("outColQty")}</th>
                            <th className="py-2 px-2 text-center font-semibold">{t("orderColDeliveryDate")}</th>
                          </tr>
                        </thead>
                      </table>
                    </div>
                    <Accordion type="multiple" className="w-full">
                      {whFilteredData.order.map((wn) => {
                        const items = whFilteredData.byWarehouse[wn] || []
                        if (items.length === 0) return null
                        const isChecked = whSelectedWarehouses.has(wn)
                        const whDisplay = (wn === "(미지정)" || !wn) ? t("outWhUnspecified") : wn
                        return (
                          <AccordionItem key={wn} value={wn} className="border-b border-border/60 last:border-0">
                            <AccordionTrigger className="px-4 py-3.5 text-sm hover:no-underline [&>svg]:shrink-0">
                              <div className="flex w-full items-center gap-3 text-left">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={() => toggleWhSelect(wn)}
                                    aria-label={wn}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <span className="text-base font-semibold tracking-tight text-foreground">{whDisplay}</span>
                                <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium tabular-nums text-primary-foreground">
                                  {items.length}{t("outWhCountSuffix")}
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 pt-0">
                              <div className="overflow-x-auto rounded-lg border border-border/70 bg-muted/25">
                                <table className="w-full border-collapse text-sm table-fixed leading-relaxed" style={{ minWidth: 680 }}>
                                  <colgroup>
                                    <col style={{ width: 40 }} />
                                    <col style={{ width: "12%" }} />
                                    <col style={{ width: "12%" }} />
                                    <col style={{ width: "10%" }} />
                                    <col style={{ width: "22%" }} />
                                    <col style={{ width: "12%" }} />
                                    <col style={{ width: "8%" }} />
                                    <col style={{ width: "12%" }} />
                                  </colgroup>
                                  <tbody className="divide-y divide-border/60">
                                    {items.map((r, idx) => (
                                      <tr
                                        key={`${wn}-${idx}`}
                                        className="transition-colors odd:bg-background/50 even:bg-muted/30 hover:bg-primary/[0.04]"
                                      >
                                        <td className="py-3 px-2" style={{ width: 40 }} aria-hidden />
                                        <td className="py-3 px-3 text-center text-xs text-muted-foreground">{whDisplay}</td>
                                        <td className="py-3 px-3 text-center font-medium text-card-foreground">{r.store}</td>
                                        <td className="py-3 px-3 text-center font-mono text-xs text-card-foreground">{r.code}</td>
                                        <td className="py-3 px-3 text-left text-sm font-medium leading-snug text-card-foreground">{r.name}</td>
                                        <td className="py-3 px-3 text-left text-xs text-muted-foreground">{r.spec}</td>
                                        <td className="py-3 px-3 text-center text-sm font-semibold tabular-nums text-card-foreground">{r.qty}</td>
                                        <td className="py-3 px-3 text-center text-xs tabular-nums text-muted-foreground">{r.deliveryDate}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )
                      })}
                    </Accordion>
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">{t("outWhNoDataHint")}</div>
                )}
              </div>
            </TabsContent>
          )}

          {isOffice && (
            <TabsContent value="invoice" className={cn(adminTabsContentCn, "space-y-4")}>
              <div className="rounded-xl border bg-card p-5 max-w-2xl">
                <h3 className="text-sm font-bold mb-4">{t("outTabInvoice")}</h3>
                {invSettingsLoading ? (
                  <div className="py-8 text-center text-muted-foreground text-sm">{t("loading")}</div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold">{t("inv_payment_terms")}</label>
                      <Input
                        value={invSettings.payment_terms ?? ""}
                        onChange={(e) => setInvSettings((p) => ({ ...p, payment_terms: e.target.value }))}
                        placeholder="Net 30 Days"
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("inv_shipping_method")}</label>
                      <Input
                        value={invSettings.shipping_method ?? ""}
                        onChange={(e) => setInvSettings((p) => ({ ...p, shipping_method: e.target.value }))}
                        placeholder="Company Delivery"
                        className="mt-1 h-9"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold">{t("inv_bank_name")}</label>
                        <Input
                          value={invSettings.bank_name ?? ""}
                          onChange={(e) => setInvSettings((p) => ({ ...p, bank_name: e.target.value }))}
                          placeholder="Kasikorn Bank (KBank)"
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inv_account_no")}</label>
                        <Input
                          value={invSettings.account_no ?? ""}
                          onChange={(e) => setInvSettings((p) => ({ ...p, account_no: e.target.value }))}
                          placeholder="166-2-97079-0"
                          className="mt-1 h-9"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold">{t("inv_account_name")}</label>
                        <Input
                          value={invSettings.account_name ?? ""}
                          onChange={(e) => setInvSettings((p) => ({ ...p, account_name: e.target.value }))}
                          placeholder="S&J Global Co., Ltd."
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inv_swift_code")}</label>
                        <Input
                          value={invSettings.swift_code ?? ""}
                          onChange={(e) => setInvSettings((p) => ({ ...p, swift_code: e.target.value }))}
                          placeholder="KASITHBK"
                          className="mt-1 h-9"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("inv_seller_email")}</label>
                      <Input
                        type="email"
                        value={invSettings.seller_email ?? ""}
                        onChange={(e) => setInvSettings((p) => ({ ...p, seller_email: e.target.value }))}
                        placeholder="info@example.com"
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("inv_seller_website")}</label>
                      <Input
                        value={invSettings.seller_website ?? ""}
                        onChange={(e) => setInvSettings((p) => ({ ...p, seller_website: e.target.value }))}
                        placeholder="https://"
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("inv_terms_conditions")}</label>
                      <textarea
                        value={
                          (() => {
                            const raw = invSettings.terms_and_conditions ?? ""
                            try {
                              const arr = JSON.parse(raw || "[]")
                              return Array.isArray(arr) ? arr.join("\n") : raw
                            } catch {
                              return raw
                            }
                          })()
                        }
                        onChange={(e) => {
                          const lines = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean)
                          setInvSettings((p) => ({ ...p, terms_and_conditions: JSON.stringify(lines) }))
                        }}
                        placeholder="Goods once sold cannot be returned..."
                        className="mt-1 w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold">{t("inv_remarks")}</label>
                      <Input
                        value={invSettings.remarks ?? ""}
                        onChange={(e) => setInvSettings((p) => ({ ...p, remarks: e.target.value }))}
                        placeholder="Please transfer payment to the bank account shown above."
                        className="mt-1 h-9"
                      />
                    </div>
                    <Button onClick={handleSaveInvSettings} disabled={invSettingsSaving}>
                      {invSettingsSaving ? t("loading") : t("inv_settings_save")}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          <TabsContent value="summary" className={cn(adminTabsContentCn, "space-y-4")}>
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={histStart}
                    onChange={(e) => handleHistStartChange(e.target.value)}
                    className="w-[140px] h-9"
                  />
                  <Input
                    type="date"
                    value={histEnd}
                    onChange={(e) => handleHistEndChange(e.target.value)}
                    className="w-[140px] h-9"
                  />
                  <Button
                    type="button"
                    variant={histMonth ? "default" : "outline"}
                    className="h-9"
                    onClick={openSummaryMonthDialog}
                  >
                    {t("outFilterMonth")}
                    {histMonth ? ` (${histMonth})` : ""}
                  </Button>
                  <Button size="sm" onClick={fetchSummaryHistory} disabled={historyLoading}>
                    {historyLoading ? t("loading") : t("btn_query")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={summaryVendorFilter || "__all__"} onValueChange={(v) => setSummaryVendorFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="w-[220px] h-9">
                      <SelectValue placeholder={t("vendor")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      {summaryVendorOptions.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={summaryCategoryFilter || "__all__"} onValueChange={(v) => setSummaryCategoryFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="w-[220px] h-9">
                      <SelectValue placeholder={t("itemsCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("all")}</SelectItem>
                      {summaryCategoryOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={summaryMenuSearch}
                    onChange={(e) => setSummaryMenuSearch(e.target.value)}
                    placeholder={t("outItemSearchPh")}
                    className="w-[220px] h-9"
                  />
                  <Select value={summaryStoreFilter || "__all__"} onValueChange={(v) => setSummaryStoreFilter(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="w-[180px] h-9">
                      <SelectValue placeholder={t("orderColStore")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("orderFilterStoreAll")}</SelectItem>
                      {storeTargets.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">{t("outSummaryHint")}</p>
              </div>

              <Dialog open={summaryMonthDialogOpen} onOpenChange={setSummaryMonthDialogOpen}>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>{t("outFilterMonth")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">{t("inMonthHint")}</label>
                    <Input
                      type="month"
                      value={summaryMonthDraft}
                      onChange={(e) => setSummaryMonthDraft(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" onClick={pickCurrentSummaryMonth}>
                        {t("thisMonth")}
                      </Button>
                      <Button type="button" variant="outline" onClick={clearSummaryMonth}>
                        {t("all")}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => setSummaryMonthDialogOpen(false)}>
                        {t("cancel")}
                      </Button>
                      <Button type="button" onClick={applySummaryMonth}>
                        {t("btn_query")}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">{t("vendor")}</h3>
                    <Button type="button" size="sm" variant="outline" onClick={handleSummaryVendorExcelDownload}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      {t("outExcelDownload")}
                    </Button>
                  </div>
                  <div className="overflow-x-auto max-h-[480px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr className="border-b">
                          <th className="py-2 px-2 text-left">{t("vendor")}</th>
                          <th className="py-2 px-2 text-right">
                            <button
                              type="button"
                              className="font-semibold hover:text-primary"
                              onClick={() => toggleVendorSort("qty")}
                            >
                              {t("outColQty")}
                              {sortMark(summaryVendorSortBy === "qty", summaryVendorSortDir)}
                            </button>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <button
                              type="button"
                              className="font-semibold hover:text-primary"
                              onClick={() => toggleVendorSort("amount")}
                            >
                              {t("inColAmount")}
                              {sortMark(summaryVendorSortBy === "amount", summaryVendorSortDir)}
                            </button>
                          </th>
                          <th className="py-2 px-2 text-right">{t("inv_vat7")}</th>
                          <th className="py-2 px-2 text-right">{t("inv_total")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryByTarget.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">
                              {t("outNoData")}
                            </td>
                          </tr>
                        ) : (
                          summaryByTarget.map((row) => (
                            <tr key={row.vendor} className="border-b">
                              <td className="py-2 px-2">{row.vendor}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.qty.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.amount.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right tabular-nums">
                                {thaiInvoiceTotalsFromRawSubtotal(row.amount).vatRounded.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-right tabular-nums">
                                {thaiInvoiceTotalsFromRawSubtotal(row.amount).grandTotal.toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                        {summaryByTarget.length > 0 && (
                          <tr className="sticky bottom-0 bg-muted/90 border-t-2">
                            <td className="py-2 px-2 font-semibold">{t("inv_total")}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryTargetTotals.qty.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryTargetTotals.amount.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryTargetTotals.vat.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryTargetTotals.total.toLocaleString()}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">{t("outSummaryByMenu")}</h3>
                    <Button type="button" size="sm" variant="outline" onClick={handleSummaryMenuExcelDownload}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      {t("outExcelDownload")}
                    </Button>
                  </div>
                  <div className="overflow-x-auto max-h-[480px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr className="border-b">
                          <th className="py-2 px-2 text-left">{t("outSummaryMenuCol")}</th>
                          <th className="py-2 px-2 text-right">
                            <button
                              type="button"
                              className="font-semibold hover:text-primary"
                              onClick={() => toggleMenuSort("qty")}
                            >
                              {t("outColQty")}
                              {sortMark(summaryMenuSortBy === "qty", summaryMenuSortDir)}
                            </button>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <button
                              type="button"
                              className="font-semibold hover:text-primary"
                              onClick={() => toggleMenuSort("amount")}
                            >
                              {t("inColAmount")}
                              {sortMark(summaryMenuSortBy === "amount", summaryMenuSortDir)}
                            </button>
                          </th>
                          <th className="py-2 px-2 text-right">{t("inv_vat7")}</th>
                          <th className="py-2 px-2 text-right">{t("inv_total")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryByMenu.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">
                              {t("outNoData")}
                            </td>
                          </tr>
                        ) : (
                          summaryByMenu.map((row) => (
                            <tr key={`${row.code}-${row.name}-${row.spec}`} className="border-b">
                              <td className="py-2 px-2">
                                {row.code ? `[${row.code}] ` : ""}
                                {row.name || "-"}
                                {row.spec ? ` (${row.spec})` : ""}
                              </td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.qty.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.amount.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right tabular-nums">
                                {thaiInvoiceTotalsFromRawSubtotal(row.amount).vatRounded.toLocaleString()}
                              </td>
                              <td className="py-2 px-2 text-right tabular-nums">
                                {thaiInvoiceTotalsFromRawSubtotal(row.amount).grandTotal.toLocaleString()}
                              </td>
                            </tr>
                          ))
                        )}
                        {summaryByMenu.length > 0 && (
                          <tr className="sticky bottom-0 bg-muted/90 border-t-2">
                            <td className="py-2 px-2 font-semibold">{t("inv_total")}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryMenuTotals.qty.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryMenuTotals.amount.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryMenuTotals.vat.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryMenuTotals.total.toLocaleString()}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </TabsContent>

          {isOffice && (
            <TabsContent value="storeMonth" className={adminTabsContentCn}>
              <OutboundStoreMonthMatrixPanel
                storeTargets={storeTargets}
                onDrillToHistory={handleStoreMonthDrill}
              />
            </TabsContent>
          )}

          <TabsContent value="hist" className={adminTabsContentCn}>
            <ShipmentFilterBar
              totalAmount={periodTotalFormatted}
              totalVatAmount={periodVatFormatted}
              totalWithVatAmount={periodGrandTotalFormatted}
              isOffice={isOffice}
              histStart={histStart}
              histEnd={histEnd}
              histMonth={histMonth}
              onHistStartChange={handleHistStartChange}
              onHistEndChange={handleHistEndChange}
              onHistMonthChange={handleHistMonthChange}
              histType={histType}
              histDeliveryStatus={histDeliveryStatus}
              histTargetType={histTargetType}
              histStore={histStore}
              outboundTargets={outboundTargetsForFilter}
              storeTargets={storeTargets}
              salesTargets={salesTargets}
              onHistTargetTypeChange={setHistTargetType}
              onHistTypeChange={setHistType}
              onHistDeliveryStatusChange={setHistDeliveryStatus}
              onHistStoreChange={setHistStore}
              invoiceSearch={invoiceSearch}
              onInvoiceSearchChange={setInvoiceSearch}
              itemSearch={itemSearch}
              onItemSearchChange={setItemSearch}
                onSearch={fetchHistory}
              onPrintInvoice={handlePrintInvoice}
              onExcelDownload={isOffice ? handleExcelDownload : undefined}
              onEtaxXmlDownload={isOffice ? handleEtaxXmlDownload : undefined}
              onDeleteSelected={isOffice ? handleDeleteSelectedOutbounds : undefined}
              deleteBusy={deletingOutbound}
              selectedCount={selectedForPrint.size}
            />
            <div className="overflow-x-auto max-h-[500px]">
              <ShipmentTable
                isOffice={isOffice}
                canEditLogUnitPrice={canEditOutboundLogUnitPrice}
                rows={shipmentTableRows}
                loading={historyLoading}
                selectedIndices={selectedForPrint}
                onToggleSelect={togglePrintSelect}
                onToggleSelectAll={togglePrintSelectAll}
                sortKey={historySortKey}
                sortDir={historySortDir}
                onSortChange={handleHistorySortChange}
                storeTargets={storeTargets}
                onPhotoClick={async (orderId) => {
                  setPhotoModalOpen(true)
                  setPhotoModalLoading(true)
                  setPhotoModalUrls([])
                  try {
                    const { urls } = await getOrderReceivePhoto(orderId)
                    setPhotoModalUrls(urls)
                  } catch {
                    setPhotoModalUrls([])
                  } finally {
                    setPhotoModalLoading(false)
                  }
                }}
                onForceReceived={async (date, target) => {
                  if (!await appConfirm(t("outForceReceivedConfirm"))) return
                  try {
                    const res = await updateForceOutboundReceived({ date, vendorTarget: target })
                    if (res.success) {
                      await appAlert(translateApiMessage(res.message, t) || t("outSaveSuccess"))
                      fetchHistory()
                    } else {
                      await appAlert(translateApiMessage(res.message, t) || t("outSaveFailed"))
                    }
                  } catch (e) {
                    await appAlert(String(e))
                  }
                }}
                onReloadHistory={canEditOutboundLogUnitPrice ? fetchHistory : undefined}
                usageRows={usageTableRows}
              />
            </div>
          </TabsContent>
        </Tabs>

        <ItemPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          items={items}
          onSelect={handleItemSelect}
        />

        {photoModalOpen && (
          <Dialog open onOpenChange={(o) => !o && setPhotoModalOpen(false)}>
            <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>{t("outPhotoView")}</DialogTitle>
              </DialogHeader>
              {photoModalLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">{t("loading")}</div>
              ) : photoModalUrls.length > 0 ? (
                <ReceivePhotoGallery urls={photoModalUrls} t={t} />
              ) : (
                <div className="flex items-center justify-center py-16 text-muted-foreground">{t("noImage")}</div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}
