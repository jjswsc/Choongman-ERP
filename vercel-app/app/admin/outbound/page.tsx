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
  getMyUsageHistory,
  getInvoiceData,
  getOutboundByWarehouse,
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

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

  const [histStart, setHistStart] = React.useState("")
  const [histEnd, setHistEnd] = React.useState("")
  const [histMonth, setHistMonth] = React.useState("")
  const [histStore, setHistStore] = React.useState("")
  const [histType, setHistType] = React.useState("")
  const [histDeliveryStatus, setHistDeliveryStatus] = React.useState("")
  const [invoiceSearch, setInvoiceSearch] = React.useState("")
  const [itemSearch, setItemSearch] = React.useState("")
  const [selectedForPrint, setSelectedForPrint] = React.useState<Set<number>>(new Set())
  const [photoModalUrl, setPhotoModalUrl] = React.useState<string | null>(null)

  const [whStart, setWhStart] = React.useState("")
  const [whEnd, setWhEnd] = React.useState("")
  const [whFilterBy, setWhFilterBy] = React.useState<"order" | "delivery">("delivery")
  const [whLoading, setWhLoading] = React.useState(false)
  const [whData, setWhData] = React.useState<GetOutboundByWarehouseResult | null>(null)
  const [whWarehouseFilter, setWhWarehouseFilter] = React.useState("")
  const [whStoreFilter, setWhStoreFilter] = React.useState("")
  const [whItemFilter, setWhItemFilter] = React.useState("")

  const isOffice = React.useMemo(() => {
    const store = (auth?.store || "").trim()
    return OFFICE_STORES.some((s) => store.toLowerCase().includes(s.toLowerCase()))
  }, [auth?.store])

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
    Promise.all([getAdminItems(), getAdminVendors(), getStockStores()])
      .then(([itemList, vendorList, storeList]) => {
        setItems(Array.isArray(itemList) ? itemList : [])
        const vendors = Array.isArray(vendorList) ? vendorList : []
        const salesNames = vendors
          .filter((v: AdminVendor) => v.type === "sales" || v.type === "both")
          .map((v: AdminVendor) => (v.gps_name?.trim() || v.name).trim())
        const stores = (Array.isArray(storeList) ? storeList : []).filter(
          (s: string) => !OFFICE_STORES.some((o) => s.toLowerCase().includes(o.toLowerCase()))
        )
        const merged = [...new Set([...salesNames, ...stores])].filter(Boolean).sort()
        setOutboundTargets(merged)
      })
      .catch(() => {
        setItems([])
        setOutboundTargets([])
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
      const res = await forceOutboundBatch(list)
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
      alert(t("orderNoData") + "\n\n오류: " + msg)
    } finally {
      setWhLoading(false)
    }
  }, [whStart, whEnd, whFilterBy, t])

  const whFilteredData = React.useMemo(() => {
    if (!whData || !whData.byWarehouse) return { order: [] as string[], byWarehouse: {} as Record<string, { store: string; code: string; name: string; spec: string; qty: number; deliveryDate: string; source: "Order" | "Force" }[]> }
    const whQ = whWarehouseFilter.trim().toLowerCase()
    const storeQ = whStoreFilter.trim().toLowerCase()
    const itemQ = whItemFilter.trim().toLowerCase()
    const filteredOrder = whQ ? whData.warehouseOrder.filter((wn) => (wn || "(미지정)").toLowerCase().includes(whQ)) : whData.warehouseOrder
    const filteredByWh: Record<string, { store: string; code: string; name: string; spec: string; qty: number; deliveryDate: string; source: "Order" | "Force" }[]> = {}
    for (const wn of filteredOrder) {
      let rows = whData.byWarehouse[wn] || []
      if (storeQ) rows = rows.filter((r) => (r.store || "").toLowerCase().includes(storeQ))
      if (itemQ) rows = rows.filter((r) => (r.name || "").toLowerCase().includes(itemQ) || (r.code || "").toLowerCase().includes(itemQ))
      if (rows.length > 0) filteredByWh[wn] = rows
    }
    return { order: Object.keys(filteredByWh).filter((wn) => (filteredByWh[wn] || []).length > 0), byWarehouse: filteredByWh }
  }, [whData, whWarehouseFilter, whStoreFilter, whItemFilter])

  const handleWarehousePrint = () => {
    if (!whData || whFilteredData.order.length === 0) {
      alert(t("orderNoData") || "조회 결과가 없습니다. 먼저 조회해 주세요.")
      return
    }
    const filterLabel = whData.filterBy === "delivery" ? t("outWhFilterDelivery") : t("outWhFilterOrder")
    const title = `${t("outTabByWarehouse")} [${filterLabel}] (${whData.period.start} ~ ${whData.period.end})`
    const printWindow = window.open("", "_blank")
    if (!printWindow) return
    const rows = whFilteredData.order.flatMap((wn) =>
      (whFilteredData.byWarehouse[wn] || []).map(
        (r) =>
          `<tr><td>${wn}</td><td>${r.store}</td><td>${r.code}</td><td>${r.name}</td><td>${r.spec}</td><td class="text-right">${r.qty}</td><td>${r.deliveryDate}</td></tr>`
      )
    )
    printWindow.document.write(`
      <html><head><meta charset="utf-8"/><title>${title}</title>
      <style>body{font-family:sans-serif;padding:16px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:6px 8px;text-align:left} th{background:#0369a1;color:#fff} .text-right{text-align:right}</style>
      </head><body><h2>${title}</h2><table><thead><tr><th>출고지</th><th>매장</th><th>코드</th><th>품목명</th><th>규격</th><th>수량</th><th>배송일</th></tr></thead><tbody>${rows.join("")}</tbody></table></body></html>`)
    printWindow.document.close()
    printWindow.print()
    printWindow.close()
  }

  const handleWarehouseExcel = () => {
    if (!whData || whFilteredData.order.length === 0) {
      alert(t("orderNoData") || "조회 결과가 없습니다. 먼저 조회해 주세요.")
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
      ["출고지", t("outColStore"), "코드", t("outColItem"), "규격", t("outColQty"), t("orderColDeliveryDate")],
    ]
    whFilteredData.order.forEach((wn) => {
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
        const list = await getMyUsageHistory({
          store: auth?.store || "",
          startStr: s,
          endStr: e,
        })
        setUsageList(Array.isArray(list) ? list : [])
        setHistoryList([])
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
    if (v.includes("배송완료") || v.includes("Delivered")) return "배송완료"
    if (v.includes("배송중") || v.includes("Transit")) return "배송중"
    return v || ""
  }

  const groupedHistory = React.useMemo(() => {
    if (!isOffice) return []
    const g: Record<string, {
      date: string
      target: string
      type: string
      totalQty: number
      totalAmt: number
      items: OutboundHistoryItem[]
      invoiceNo?: string
      receiveImageUrl?: string
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
      if (i.receiveImageUrl) g[k].receiveImageUrl = i.receiveImageUrl
    }
    return Object.values(g).sort((a, b) => (b.date + b.target).localeCompare(a.date + a.target))
  }, [historyList, isOffice])

  const filteredGroupedHistory = React.useMemo(() => {
    if (!isOffice) return groupedHistory
    let result = groupedHistory
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
  }, [groupedHistory, histDeliveryStatus, invoiceSearch, itemSearch, isOffice])

  const shipmentTableRows = React.useMemo((): ShipmentTableRow[] => {
    if (!isOffice) return []
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
        items: g.items.map((it) => ({
          name: it.name || "",
          code: it.code || "",
          spec: it.spec || "",
          qty: it.qty || 0,
          amount: it.amount || 0,
          originalOrderQty: it.originalOrderQty,
        })),
        itemsSummary,
        totalQty: g.totalQty,
        totalAmt: g.totalAmt,
        receiveImageUrl: g.receiveImageUrl,
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
    if (!isOffice || filteredGroupedHistory.length === 0) return
    if (selectedForPrint.size >= filteredGroupedHistory.length) {
      setSelectedForPrint(new Set())
    } else {
      setSelectedForPrint(new Set(filteredGroupedHistory.map((_, i) => i)))
    }
  }

  const buildInvoiceHtml = (
    group: (typeof groupedHistory)[0],
    company: InvoiceDataCompany | null,
    client: InvoiceDataClient | { companyName: string },
    isFirstPage: boolean
  ) => {
    const inv = {
      inv_title: "Delivery Note / Tax Invoice",
      inv_original_doc: "Original (Set Document)",
      inv_doc_no: "Document No.",
      inv_due_date: "Due Date",
      inv_reference: "Reference",
      inv_tax_id: "Tax ID",
      inv_address: "Address",
      inv_phone: "Phone",
      inv_client: "Client",
      inv_description: "Item",
      inv_amount: "Amount",
      inv_total: "Total",
      inv_vat7: "VAT 7%",
      inv_grand_total: "Grand Total",
      inv_remarks: "Remarks",
      inv_received_by: "Recipient",
      inv_approved_by: "Approved by",
      inv_date: "Date",
      inv_baht_only: "baht only",
    }
    const docNo = (group.invoiceNo || `IV-${(group.date || "").replace(/\D/g, "")}`).trim()
    const dateStr = (group.date || "").split(" ")[0] || new Date().toISOString().slice(0, 10)
    const d = dateStr.length === 10
      ? `${dateStr.slice(5, 7)}/${dateStr.slice(8, 10)}/${dateStr.slice(0, 4)}`
      : dateStr.replace(/-/g, "/")
    const totalBaht = Math.round(Math.abs(group.totalAmt || 0))
    const vat7 = Math.round(totalBaht * 0.07)
    const grandTotal = totalBaht + vat7
    const grandWords = `( ${grandTotal.toLocaleString()} ${inv.inv_baht_only} )`
    const companyName = company?.companyName || "บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)"
    const address = company?.address || "-"
    const taxId = company?.taxId || ""
    const phone = company?.phone || ""
    const bankInfo = company?.bankInfo || ""
    const clientName = client?.companyName || group.target || "-"
    const clientAddr = (client as InvoiceDataClient)?.address || ""
    const clientTaxId = (client as InvoiceDataClient)?.taxId || ""
    const clientPhone = (client as InvoiceDataClient)?.phone || ""
    const rows = (group.items || []).map((it, idx) => {
      const amt = Math.round(Math.abs(it.amount || 0))
      const qty = Math.abs(it.qty || 0)
      const price = qty ? amt / qty : 0
      return `<tr><td class="text-center">${idx + 1}</td><td>${(it.name || "-")}${it.spec ? ` ${it.spec}` : ""}</td><td class="text-center">${qty}</td><td class="text-end">${price.toLocaleString()}</td><td class="text-end">0</td><td class="text-end">${amt.toLocaleString()}</td></tr>`
    }).join("")
    const tableStyle = "width:100%; border-collapse: collapse; border: 1px solid #e2e8f0; margin: 8px 0;"
    const thStyle = "background: #0369a1; color: #fff; padding: 6px 8px; text-align: center; border: 1px solid #0369a1;"
    const pageBreak = isFirstPage ? "" : " page-break-before: always;"
    return `<div class="delivery-note-invoice" style="max-width:210mm; margin:0 auto 24px; padding:16px; background:#fff; border:1px solid #e2e8f0; page-break-after:always;${pageBreak} font-family:'Noto Sans KR','Noto Sans Thai',sans-serif; font-size:12px; color:#0f172a;">
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
    <h2 style="margin:0; font-size:1.25rem;">${inv.inv_title}</h2>
    <div style="text-align:right; font-size:11px;">
      <div>${inv.inv_original_doc}</div>
      <div><strong>${inv.inv_doc_no}:</strong> ${docNo}</div>
      <div><strong>${inv.inv_due_date}:</strong> ${d}</div>
      <div><strong>${inv.inv_reference}:</strong> ${group.invoiceNo || "-"}</div>
    </div>
  </div>
  <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
    <div style="flex:1; padding-left:5mm;">
      <div style="font-weight:700; margin-bottom:4px;">${companyName}</div>
      <div style="font-size:11px; color:#475569;">${address}<br>${inv.inv_tax_id} ${taxId} | ${phone}</div>
    </div>
    <div style="flex:1; padding-left:calc(16px + 5mm);">
      <div style="font-weight:700; margin-bottom:4px;">${inv.inv_client}</div>
      <div style="font-size:11px; color:#475569; line-height:1.5;">
        ${clientName}
        ${clientAddr ? "<br>" + inv.inv_address + ": " + clientAddr : ""}
        ${clientTaxId ? "<br>" + inv.inv_tax_id + ": " + clientTaxId : ""}
        ${clientPhone ? "<br>" + inv.inv_phone + ": " + clientPhone : ""}
      </div>
    </div>
  </div>
  <table class="table table-bordered" style="${tableStyle}"><thead><tr><th style="${thStyle}">#</th><th style="${thStyle}">${inv.inv_description}</th><th style="${thStyle}">Qty.</th><th style="${thStyle}">U/P</th><th style="${thStyle}">Disc.</th><th style="${thStyle}">${inv.inv_amount}</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="display:flex; justify-content:flex-end;"><div style="text-align:right; font-size:12px; min-width:200px;">
    <div>${inv.inv_total}: ${totalBaht.toLocaleString()} THB</div>
    <div>${inv.inv_vat7}: ${vat7.toLocaleString()} THB</div>
    <div style="font-weight:700;">${inv.inv_grand_total}: ${grandTotal.toLocaleString()} THB</div>
    <div style="font-size:11px; margin-top:4px;">${grandWords}</div>
  </div></div>
  <div style="margin-top:16px; font-size:11px; color:#475569;"><strong>${inv.inv_remarks}:</strong> ${bankInfo}</div>
  <div style="margin-top:20px; display:flex; justify-content:space-between; font-size:11px;">
    <div><strong>${clientName}</strong><br>${inv.inv_received_by} ________________  ${inv.inv_date} ________________</div>
    <div><strong>${companyName.split(" ")[0]}</strong><br>${inv.inv_approved_by} ________________  ${inv.inv_date} ________________</div>
  </div>
</div>`
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

  const handlePrintInvoice = async () => {
    const checked = Array.from(selectedForPrint).sort((a, b) => a - b).map((i) => filteredGroupedHistory[i]).filter(Boolean)
    if (checked.length === 0) {
      alert(t("outSelectForPrint"))
      return
    }
    try {
      const { company, clients } = await getInvoiceData()
      let prevTarget: string | null = null
      const html = checked.map((g, idx) => {
        const isFirst = idx === 0 || g.target !== prevTarget
        prevTarget = g.target
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
        return buildInvoiceHtml(g, company, client, isFirst)
      }).join("")
      const area = document.createElement("div")
      area.id = "invoice-print-area"
      area.innerHTML = html
      area.style.cssText = "position:absolute; left:-9999px; top:0; width:210mm; visibility:hidden;"
      document.body.appendChild(area)
      const style = document.createElement("style")
      style.id = "invoice-print-style"
      style.textContent = `@media print {
        body.invoice-printing * { visibility: hidden !important; }
        body.invoice-printing > *:not(#invoice-print-area) { display: none !important; visibility: hidden !important; }
        body.invoice-printing #invoice-print-area,
        body.invoice-printing #invoice-print-area * { visibility: visible !important; -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
        body.invoice-printing #invoice-print-area {
          display: block !important; position: absolute !important; left: 0 !important; top: 0 !important;
          margin: 0 !important; width: 210mm !important; min-width: 210mm !important;
          max-width: 210mm !important; padding: 0 10mm !important; box-sizing: border-box !important;
          overflow: visible !important; line-height: 1.85 !important; z-index: 999999 !important;
          background: #fff !important; visibility: visible !important; filter: grayscale(100%) !important;
        }
        body.invoice-printing html, body.invoice-printing body { margin: 0 !important; padding: 0 !important; overflow: visible !important; }
        body.invoice-printing .delivery-note-invoice {
          width: 100% !important; max-width: 210mm !important; box-sizing: border-box !important;
          padding: 18mm 1cm 0.1cm calc(12px + 5mm) !important; margin: 0 auto !important;
          border: none !important; page-break-after: always !important; line-height: 1.85 !important;
        }
        body.invoice-printing .delivery-note-invoice:last-child { page-break-after: auto !important; }
      }`
      document.head.appendChild(style)
      document.body.classList.add("invoice-printing")
      window.print()
      document.body.classList.remove("invoice-printing")
      document.body.removeChild(area)
      const el = document.getElementById("invoice-print-style")
      if (el) el.remove()
    } catch (e) {
      console.error(e)
      alert(t("invLoadFailed"))
    }
  }

  const periodTotal = React.useMemo(() => {
    if (isOffice) return historyList.reduce((sum, i) => sum + (i.amount || 0), 0)
    return usageList.reduce((sum, i) => sum + (i.amount || 0), 0)
  }, [historyList, usageList, isOffice])

  const [tabValue, setTabValue] = React.useState<"new" | "hist" | "warehouse">(isOffice ? "new" : "hist")

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
        <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as "new" | "hist" | "warehouse")} className="space-y-4">
          <TabsList className={`grid w-full max-w-2xl mb-4 ${isOffice ? "grid-cols-3" : "grid-cols-1"}`}>
            {isOffice && <TabsTrigger value="new" className="text-sm font-medium">{t("outTabNew")}</TabsTrigger>}
            <TabsTrigger value="hist" className="text-sm font-medium">{t("outTabHist")}</TabsTrigger>
            {isOffice && <TabsTrigger value="warehouse" className="text-sm font-medium">{t("outTabByWarehouse")}</TabsTrigger>}
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
                  <Button size="sm" variant="outline" onClick={handleWarehousePrint} disabled={!whData || whFilteredData.order.length === 0}>
                    🖨️ {t("outPrintInvoice")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleWarehouseExcel} disabled={!whData || whFilteredData.order.length === 0}>
                    📥 {t("outExcelDownload")}
                  </Button>
                </div>
                {whData && (whData.warehouseOrder.length > 0 || Object.keys(whData.byWarehouse).length > 0) && (
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">출고지(창고)</span>
                      <Input
                        placeholder="창고명"
                        value={whWarehouseFilter}
                        onChange={(e) => setWhWarehouseFilter(e.target.value)}
                        className="w-[120px] h-9"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{t("outColStore")}</span>
                      <Input
                        placeholder={t("outStorePlaceholder")}
                        value={whStoreFilter}
                        onChange={(e) => setWhStoreFilter(e.target.value)}
                        className="w-[120px] h-9"
                      />
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
                )}
                {whLoading ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">{t("loading")}</div>
                ) : whData && (whData.warehouseOrder.length > 0 || Object.keys(whData.byWarehouse).length > 0) ? (
                  <Accordion type="single" collapsible className="w-full">
                    {whFilteredData.order.map((wn) => {
                      const items = whFilteredData.byWarehouse[wn] || []
                      if (items.length === 0) return null
                      return (
                        <AccordionItem key={wn} value={wn} className="border-b border-border/60 last:border-0">
                          <AccordionTrigger className="px-4 py-3.5 text-sm font-semibold hover:no-underline">
                            <span className="font-bold">{wn || "(미지정)"}</span>
                            <span className="ml-2 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                              {items.length}건
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse">
                                <thead>
                                  <tr className="border-b bg-muted/50">
                                    <th className="text-left py-2 px-2">{t("outColStore")}</th>
                                    <th className="text-left py-2 px-2">코드</th>
                                    <th className="text-left py-2 px-2">{t("outColItem")}</th>
                                    <th className="text-left py-2 px-2">규격</th>
                                    <th className="text-right py-2 px-2 w-20">{t("outColQty")}</th>
                                    <th className="text-left py-2 px-2">{t("orderColDeliveryDate")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((r, idx) => (
                                    <tr key={idx} className="border-b">
                                      <td className="py-2 px-2">{r.store}</td>
                                      <td className="py-2 px-2">{r.code}</td>
                                      <td className="py-2 px-2">{r.name}</td>
                                      <td className="py-2 px-2">{r.spec}</td>
                                      <td className="py-2 px-2 text-right font-medium">{r.qty}</td>
                                      <td className="py-2 px-2">{r.deliveryDate}</td>
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
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">{t("orderNoData")}</div>
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
              histStore={histStore}
              outboundTargets={outboundTargets}
              onHistTypeChange={setHistType}
              onHistDeliveryStatusChange={setHistDeliveryStatus}
              onHistStoreChange={setHistStore}
              invoiceSearch={invoiceSearch}
              onInvoiceSearchChange={setInvoiceSearch}
              itemSearch={itemSearch}
              onItemSearchChange={setItemSearch}
              onSearch={fetchHistory}
              onPrintInvoice={isOffice ? handlePrintInvoice : undefined}
              onExcelDownload={isOffice ? handleExcelDownload : undefined}
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
                onPhotoClick={(url) => setPhotoModalUrl(url)}
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

        {photoModalUrl && (
          <Dialog open onOpenChange={(o) => !o && setPhotoModalUrl(null)}>
            <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>{t("outPhotoView")}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center bg-black/50 min-h-[200px]">
                <img
                  src={photoModalUrl}
                  alt={t("outPhotoView")}
                  className="max-w-full max-h-[85vh] object-contain"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}
