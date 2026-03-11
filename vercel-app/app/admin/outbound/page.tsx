"use client"

import * as React from "react"
import { ArrowUpFromLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  getAdminItems,
  getAdminVendors,
  getStockStores,
  forceOutboundBatch,
  getCombinedOutboundHistory,
  getOrderReceivePhoto,
  updateForceOutboundReceived,
  getMyUsageHistory,
  getInvoiceData,
  getInvoiceSettings,
  updateInvoiceSettings,
  getOutboundByWarehouse,
  getWarehouseLocations,
  generateEtaxXmlApi,
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

const OFFICE_STORES = ["본사", "Office", "오피스", "본점", "Head Office", "HQ", "Head office", "head office"]

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
          rotateLeftLabel={t("imageRotateLeft") || "반시계"}
          rotateRightLabel={t("imageRotateRight") || "시계"}
          zoomInLabel={t("att_zoom_in") || "확대"}
          zoomOutLabel={t("att_zoom_out") || "축소"}
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
  const [outStore, setOutStore] = React.useState("")
  const [outQty, setOutQty] = React.useState("")
  const [cart, setCart] = React.useState<OutboundCartItem[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<AdminItem | null>(null)
  const [saving, setSaving] = React.useState(false)

  const [histStart, setHistStart] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [histEnd, setHistEnd] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [histMonth, setHistMonth] = React.useState("")
  const [histStore, setHistStore] = React.useState("")
  const [histTargetType, setHistTargetType] = React.useState<"" | "store" | "sales">("")
  const [histType, setHistType] = React.useState("")
  const [histDeliveryStatus, setHistDeliveryStatus] = React.useState("")
  const [invoiceSearch, setInvoiceSearch] = React.useState("")
  const [itemSearch, setItemSearch] = React.useState("")
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

  const [tabValue, setTabValue] = React.useState<"new" | "hist" | "warehouse" | "invoice">("hist")

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setOutDate(today)
  }, [])

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setHistStart(today)
    setHistEnd(today)
  }, [])

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setWhStart((p) => p || today)
    setWhEnd((p) => p || today)
  }, [])

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
        const merged = [...new Set([...storeArr, ...salesArr])].filter(Boolean).sort()
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
  }, [])

  const handleItemSelect = (item: AdminItem) => {
    setSelectedItem(item)
    setOutQty("")
  }

  const handleAddToList = () => {
    if (!selectedItem) {
      alert(t("inAlertSelectItem"))
      return
    }
    if (!outQty.trim()) {
      alert(t("inAlertEnterQty"))
      return
    }
    if (!outStore) {
      alert(t("outStorePlaceholder"))
      return
    }
    const q = parseFloat(outQty.replace(/,/g, ""))
    if (isNaN(q) || q <= 0) {
      alert(t("inAlertEnterQty"))
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
      alert(t("outEmptyList"))
      return
    }
    if (!confirm(t("outConfirmMsg"))) return
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
      const res = await forceOutboundBatch(list, { processorName: auth?.user })
      if (res.success) {
        alert(translateApiMessage(res.message, t) || t("outSaveSuccess"))
        setCart([])
      } else {
        alert(translateApiMessage(res.message, t) || t("outSaveFailed"))
      }
    } catch {
      alert(t("outProcessFail"))
    } finally {
      setSaving(false)
    }
  }

  const fetchWarehouseOutbound = React.useCallback(async () => {
    if (!whStart || !whEnd) {
      alert(t("visit_stats_date_hint") || "시작일과 종료일을 선택해 주세요.")
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
      alert(t("orderNoData") + "\n\n" + t("msg_error_prefix") + msg)
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
        alert(t("inv_settings_saved"))
      } else {
        alert(res.message || t("outSaveFailed"))
      }
    } catch (e) {
      alert(String(e))
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
      if (rows.length > 0) filteredByWh[wn] = rows
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

  const handleWarehousePrint = () => {
    if (!whData || whOrderToUse.length === 0) {
      alert(whFilteredData.order.length === 0 ? t("outWhNoDataHint") : t("outSelectWarehouseForPrint"))
      return
    }
    const filterLabel = whData.filterBy === "delivery" ? t("outWhFilterDelivery") : t("outWhFilterOrder")
    const title = `${t("outTabByWarehouse")} [${filterLabel}] (${whData.period.start} ~ ${whData.period.end})`
    const colCheck = t("store_check")
    const colCode = t("outColCode")
    const colItem = t("outColItem")
    const colSpec = t("spec")
    const colQty = t("outColQty")
    const colDeliveryDate = t("orderColDeliveryDate")
    const colStore = t("outColStore")
    const whLabel = t("outWhWarehouseCol")
    const packingListTitle = t("outWhPackingList")
    const periodLabel = t("outWhPeriod")
    const outboundColLabel = t("outWhOutboundCol")
    const countLabel = t("outWhWarehouseCount")
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
            const storeHeaderHtml = `<div style="margin-bottom:20px;">
          <h2 style="margin:0 0 12px 0; font-size:1.35rem; font-weight:700; color:#0f172a;">${escape(packingListTitle)} - ${escape(storeName)}</h2>
          <table style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden;">
            <thead><tr style="background:linear-gradient(180deg, #1e40af 0%, #1e3a8a 100%); color:#fff;">
              <th style="padding:10px 14px; text-align:center; font-weight:600;">${escape(periodLabel)}</th>
              <th style="padding:10px 14px; text-align:center; font-weight:600;">${escape(outboundColLabel)}</th>
              <th style="padding:10px 14px; text-align:center; font-weight:600;">${escape(countLabel)}</th>
            </tr></thead>
            <tbody><tr>
              <td style="padding:12px 14px; border-top:1px solid #e2e8f0; background:#f8fafc; text-align:center; font-weight:600;">${escape(date)}</td>
              <td style="padding:12px 14px; border-top:1px solid #e2e8f0; text-align:center; font-weight:600;">${escape(whDisplayForHeader)}</td>
              <td style="padding:12px 14px; border-top:1px solid #e2e8f0; text-align:center; font-weight:600;">${escape(countStr)}</td>
            </tr></tbody>
          </table>
        </div>`
            let rowIdx = 0
            const storeRows = items.map((r) => {
              const style = tdStyle(rowIdx++)
              return `<tr><td style="${style}text-align:center;font-weight:500;">${escape(r.code)}</td><td style="${style}">${escape(r.name)}</td><td style="${style}text-align:center;color:#64748b;">${escape(r.spec)}</td><td style="${style}text-align:center;font-weight:600;">${r.qty}</td><td style="${style}text-align:center;min-width:52px;width:52px;">${checkBoxHtml}</td><td style="${style}text-align:center;white-space:nowrap;min-width:90px;">${escape(r.deliveryDate)}</td></tr>`
            })
            const tableHtml = `<div style="margin-bottom:20px;">
            <h4 style="margin:0 0 8px 0; font-size:1rem; font-weight:600; color:#334155;">${whLabel}: ${escape(whDisplay)} — ${escape(label)}</h4>
            <table style="${tableStyle}">
              <thead><tr><th style="${thStyle}">${colCode}</th><th style="${thStyle}">${colItem}</th><th style="${thStyle}">${colSpec}</th><th style="${thStyle}">${colQty}</th><th style="${thStyle} min-width:52px; width:52px; white-space:nowrap;">${colCheck}</th><th style="${thStyle} min-width:90px; white-space:nowrap;">${colDeliveryDate}</th></tr></thead>
              <tbody>${storeRows.join("")}</tbody>
            </table>
          </div>`
            const pageLabel = (t("outWhPrintPageOf") || "페이지 %1/%2")
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
        body{font-family:'Noto Sans KR','Noto Sans Thai',Arial,sans-serif; padding:24px; font-size:12px; color:#0f172a; line-height:1.5; max-width:210mm; margin:0 auto;}
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

  const handleWarehouseExcel = () => {
    if (!whData || whOrderToUse.length === 0) {
      alert(whFilteredData.order.length === 0 ? t("outWhNoDataHint") : t("outSelectWarehouseForExcel"))
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
      const [y, m] = histMonth.split("-").map(Number)
      const first = new Date(y, m - 1, 1).toISOString().slice(0, 10)
      const last = new Date(y, m, 0).toISOString().slice(0, 10)
      s = first
      e = last
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
        })
        setHistoryList(Array.isArray(list) ? list : [])
        setUsageList([])
      } else {
        const list = await getCombinedOutboundHistory({
          startStr: s,
          endStr: e,
          vendorFilter: auth?.store || undefined,
          typeFilter: histType || undefined,
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
  }, [histStart, histEnd, histMonth, histStore, histType, isOffice, auth?.store])

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
      const k = `${i.date}_${i.target}_${i.type}_${i.orderRowId || ""}`
      if (!g[k]) {
        g[k] = {
          date: i.date,
          target: i.target,
          type: i.type,
          totalQty: 0,
          totalAmt: 0,
          items: [],
        }
      }
      g[k].items.push(i)
      g[k].totalQty += i.qty
      g[k].totalAmt += (i.amount || 0)
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
            (it.code || "").toLowerCase().includes(qItem)
        )
      )
    }
    return result
  }, [groupedHistory, histTargetType, histStore, storeTargets, salesTargets, histDeliveryStatus, invoiceSearch, itemSearch, isOffice])

  const shipmentTableRows = React.useMemo((): ShipmentTableRow[] => {
    return filteredGroupedHistory.map((g, i) => {
      const first = g.items[0]
      const orderDate = first?.orderDate || g.date?.slice(0, 10) || ""
      const deliveryDate = first?.deliveryDate || ""
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
        })),
        itemsSummary,
        totalQty: g.totalQty,
        totalAmt: g.totalAmt,
        receiveImageUrl: g.receiveImageUrls?.[0] ?? g.receiveImageUrl,
        receiveImageUrls: g.receiveImageUrls ?? (g.receiveImageUrl ? [g.receiveImageUrl] : undefined),
      }
    })
  }, [filteredGroupedHistory, isOffice, t])

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

  React.useEffect(() => {
    setSelectedForPrint(new Set())
  }, [invoiceSearch, itemSearch, histDeliveryStatus])

  const togglePrintSelect = (idx: number) => {
    setSelectedForPrint((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const togglePrintSelectAll = () => {
    if (filteredGroupedHistory.length === 0) return
    if (selectedForPrint.size >= filteredGroupedHistory.length) {
      setSelectedForPrint(new Set())
    } else {
      setSelectedForPrint(new Set(filteredGroupedHistory.map((_, i) => i)))
    }
  }

  const handleEtaxXmlDownload = async () => {
    const checked = Array.from(selectedForPrint).sort((a, b) => a - b).map((i) => filteredGroupedHistory[i]).filter(Boolean)
    if (checked.length === 0) {
      alert(t("outSelectForPrint"))
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
        alert(res.error || t("invLoadFailed"))
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
      alert(t("invLoadFailed"))
    }
  }

  const handleExcelDownload = () => {
    const checked = Array.from(selectedForPrint).sort((a, b) => a - b).map((i) => filteredGroupedHistory[i]).filter(Boolean)
    if (checked.length === 0) {
      alert(t("outSelectForExcel"))
      return
    }
    const escapeXml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
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
    ]
    const dataRows: string[][] = []
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
        dataRows.push([orderDate, deliveryDate, g.invoiceNo || "-", orderTypeLabel, outboundTypeLabel, target, name, spec, String(it.qty ?? ""), String(it.amount ?? "")])
      }
    }
    const minW = 55
    const pxPerChar = 8
    const colWidths = headers.map((h, c) => {
      let maxLen = String(h).length
      for (const row of dataRows) {
        const len = String(row[c] ?? "").length
        if (len > maxLen) maxLen = len
      }
      return Math.max(minW, Math.min(maxLen * pxPerChar + 16, 400))
    })
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{width:100%;border-collapse:collapse}</style></head>
<body>
<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
<tr class="head">${headers.map((h) => `<td>${escapeXml(h)}</td>`).join("")}</tr>
${dataRows.map((row) => `<tr>${row.map((cell) => `<td>${escapeXml(cell)}</td>`).join("")}</tr>`).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `outbound_${new Date().toISOString().slice(0, 10)}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const buildInvoiceData = (
    group: (typeof filteredGroupedHistory)[0],
    company: InvoiceDataCompany | null,
    client: InvoiceDataClient | { companyName: string },
    invSettings: Record<string, string>
  ): InvoiceData => {
    const docNo = (group.invoiceNo || `IV-${(group.date || "").replace(/\D/g, "")}`).trim()
    const dateStr = (group.date || "").split(" ")[0] || new Date().toISOString().slice(0, 10)
    const subtotal = Math.round(Math.abs(group.totalAmt || 0))
    const vatRate = 7
    const vatAmount = Math.round(subtotal * 0.07)
    const grandTotal = subtotal + vatAmount
    const rawCompanyName = company?.companyName || "S&J Global Co., Ltd"
    const companyName = rawCompanyName.replace(/\.\.ltd\b/gi, "Ltd.").replace(/\.ltd\b/gi, "Ltd.")
    const termsRaw = invSettings.terms_and_conditions ?? "[]"
    let termsAndConditions: string[] = []
    try {
      const arr = JSON.parse(termsRaw)
      termsAndConditions = Array.isArray(arr) ? arr.map(String) : []
    } catch {
      termsAndConditions = []
    }
    const stampBase = typeof window !== "undefined" && window.location?.origin ? window.location.origin : ""
    return {
      documentType: "Delivery Note / Tax Invoice",
      documentNo: docNo,
      dueDate: dateStr,
      referenceNo: group.invoiceNo || "-",
      issueDate: dateStr,
      paymentTerms: invSettings.payment_terms || "Net 30 Days",
      shippingMethod: invSettings.shipping_method || "Company Delivery",
      seller: {
        name: companyName,
        address: company?.address || "-",
        taxId: company?.taxId || "-",
        phone: company?.phone || "-",
        email: invSettings.seller_email || undefined,
        website: invSettings.seller_website || undefined,
      },
      client: {
        name: (client as InvoiceDataClient)?.companyName || group.target || "-",
        address: (client as InvoiceDataClient)?.address || "-",
        taxId: (client as InvoiceDataClient)?.taxId || "-",
        phone: (client as InvoiceDataClient)?.phone || "-",
      },
      items: (group.items || []).map((it, idx) => {
        const amt = Math.round(Math.abs(it.amount || 0))
        const qty = Math.abs(it.qty || 0)
        const unitPrice = qty ? amt / qty : 0
        return {
          id: idx + 1,
          itemCode: it.code,
          description: (it.name || "-") + (it.spec ? ` ${it.spec}` : ""),
          quantity: qty,
          unitPrice,
          discount: 0,
          amount: amt,
        }
      }),
      subtotal,
      vatRate,
      vatAmount,
      grandTotal,
      bankInfo: {
        bankName: invSettings.bank_name || "Kasikorn Bank (KBank)",
        accountNo: invSettings.account_no || "",
        accountName: invSettings.account_name || companyName,
        swiftCode: invSettings.swift_code || undefined,
      },
      remarks: invSettings.remarks || "Please transfer payment to the bank account shown above.",
      termsAndConditions,
      stampImageUrl: stampBase ? `${stampBase}/company-stamp.png` : "/company-stamp.png",
    }
  }

  const handlePrintInvoice = async () => {
    const checked = Array.from(selectedForPrint).sort((a, b) => a - b).map((i) => filteredGroupedHistory[i]).filter(Boolean)
    if (checked.length === 0) {
      alert(t("outSelectForPrint"))
      return
    }
    try {
      const [invoiceDataRes, invSettings] = await Promise.all([getInvoiceData(), getInvoiceSettings()])
      const { company, clients } = invoiceDataRes
      const settings = typeof invSettings === "object" && invSettings !== null ? invSettings : {}
      const invoiceDatas: InvoiceData[] = checked.map((g) => {
        const targetNorm = (g.target || "").trim()
        const targetLower = targetNorm.toLowerCase()
        const foundClient = clients && (clients[g.target || ""] ?? clients[targetNorm] ?? clients[targetLower])
        let client: InvoiceDataClient | { companyName: string }
        if (foundClient) {
          client = foundClient
        } else {
          const isOfficeTarget = OFFICE_STORES.some((s) => (g.target || "").toLowerCase().includes(s.toLowerCase()))
          if (isOfficeTarget && company) {
            client = {
              companyName: company.companyName,
              address: company.address || "-",
              taxId: company.taxId || "-",
              phone: company.phone || "-",
            }
          } else {
            client = { companyName: g.target || "-" }
          }
        }
        return buildInvoiceData(g, company, client, settings)
      })
      sessionStorage.setItem("invoice-print-data", JSON.stringify(invoiceDatas))
      const printWindow = window.open("/admin/invoice-print", "_blank")
      if (!printWindow) {
        alert(t("invLoadFailed") + "\n\n" + (t("outPrintPopoverBlocked") || "팝업이 차단되었을 수 있습니다. 팝업 허용 후 다시 시도해 주세요."))
        return
      }
      printWindow.focus()
    } catch (e) {
      console.error(e)
      alert(t("invLoadFailed"))
    }
  }

  const periodTotal = React.useMemo(() => {
    if (isOffice) return historyList.reduce((sum, i) => sum + (i.amount || 0), 0)
    return usageList.reduce((sum, i) => sum + (i.amount || 0), 0)
  }, [historyList, usageList, isOffice])

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
        <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as "new" | "hist" | "warehouse" | "invoice")} className="space-y-4">
          <TabsList className={`grid w-full max-w-2xl mb-4 ${isOffice ? "grid-cols-4" : "grid-cols-1"}`}>
            {isOffice && <TabsTrigger value="new" className="text-sm font-medium">{t("outTabNew")}</TabsTrigger>}
            <TabsTrigger value="hist" className="text-sm font-medium">{t("outTabHist")}</TabsTrigger>
            {isOffice && <TabsTrigger value="warehouse" className="text-sm font-medium">{t("outTabByWarehouse")}</TabsTrigger>}
            {isOffice && <TabsTrigger value="invoice" className="text-sm font-medium">{t("outTabInvoice")}</TabsTrigger>}
          </TabsList>

          {isOffice && (
            <TabsContent value="new">
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
                                    className="h-7 text-destructive hover:text-destructive"
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
            <TabsContent value="warehouse" className="space-y-4">
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
                            <AccordionTrigger className="px-4 py-3 hover:no-underline [&>svg]:shrink-0">
                              <div className="flex items-center gap-3 w-full text-left">
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={() => toggleWhSelect(wn)}
                                    aria-label={wn}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </div>
                                <span className="font-semibold">{whDisplay}</span>
                                <span className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                                  {items.length}{t("outWhCountSuffix")}
                                </span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-3">
                              <div className="overflow-x-auto">
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
                                  <tbody>
                                    {items.map((r, idx) => (
                                      <tr key={`${wn}-${idx}`} className="border-b">
                                        <td className="py-2 px-2 text-center" style={{ width: 40 }}></td>
                                        <td className="py-2 px-2 text-center text-muted-foreground">{whDisplay}</td>
                                        <td className="py-2 px-2 text-center">{r.store}</td>
                                        <td className="py-2 px-2 text-center">{r.code}</td>
                                        <td className="py-2 px-2 text-center">{r.name}</td>
                                        <td className="py-2 px-2 text-center">{r.spec}</td>
                                        <td className="py-2 px-2 text-center font-medium">{r.qty}</td>
                                        <td className="py-2 px-2 text-center">{r.deliveryDate}</td>
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
            <TabsContent value="invoice" className="space-y-4">
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

          <TabsContent value="hist">
            <ShipmentFilterBar
              totalAmount={periodTotalFormatted}
              isOffice={isOffice}
              histStart={histStart}
              histEnd={histEnd}
              histMonth={histMonth}
              onHistStartChange={setHistStart}
              onHistEndChange={setHistEnd}
              onHistMonthChange={setHistMonth}
              onMonthClick={() => {
                const now = new Date()
                setHistMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
              }}
              histType={histType}
              histDeliveryStatus={histDeliveryStatus}
              histTargetType={histTargetType}
              histStore={histStore}
              outboundTargets={outboundTargets}
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
              selectedCount={selectedForPrint.size}
            />
            <div className="overflow-x-auto max-h-[500px]">
              <ShipmentTable
                isOffice={isOffice}
                rows={shipmentTableRows}
                loading={historyLoading}
                selectedIndices={selectedForPrint}
                onToggleSelect={togglePrintSelect}
                onToggleSelectAll={togglePrintSelectAll}
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
                  if (!confirm(t("outForceReceivedConfirm"))) return
                  try {
                    const res = await updateForceOutboundReceived({ date, vendorTarget: target })
                    if (res.success) {
                      alert(translateApiMessage(res.message, t) || t("outSaveSuccess"))
                      fetchHistory()
                    } else {
                      alert(translateApiMessage(res.message, t) || t("outSaveFailed"))
                    }
                  } catch (e) {
                    alert(String(e))
                  }
                }}
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
