"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getAdminItems,
  getAdminVendors,
  getStockStores,
  forceOutboundBatch,
  getCombinedOutboundHistory,
  getMyUsageHistory,
  getInvoiceData,
  type AdminItem,
  type AdminVendor,
  type OutboundHistoryItem,
  type UsageHistoryItem,
  type InvoiceDataCompany,
  type InvoiceDataClient,
} from "@/lib/api-client"
import { ItemPickerDialog } from "@/components/erp/item-picker-dialog"
import {
  ShipmentHeader,
  ShipmentFilterBar,
  ShipmentTable,
  type ShipmentTableRow,
} from "@/components/shipment"

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
  const [invoiceSearch, setInvoiceSearch] = React.useState("")
  const [itemSearch, setItemSearch] = React.useState("")
  const [selectedForPrint, setSelectedForPrint] = React.useState<Set<number>>(new Set())
  const [photoModalUrl, setPhotoModalUrl] = React.useState<string | null>(null)

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
    Promise.all([getAdminItems(), getAdminVendors(), getStockStores()])
      .then(([itemList, vendorList, storeList]) => {
        setItems(Array.isArray(itemList) ? itemList : [])
        const vendors = Array.isArray(vendorList) ? vendorList : []
        const salesNames = vendors
          .filter((v: AdminVendor) => v.type === "sales" || v.type === "both")
          .map((v: AdminVendor) => v.name)
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
      alert(t("inAlertSelectItem") || "품목을 선택해주세요.")
      return
    }
    if (!outQty.trim()) {
      alert(t("inAlertEnterQty") || "수량을 입력해주세요.")
      return
    }
    if (!outStore) {
      alert(t("outStorePlaceholder") || "출고처를 선택해주세요.")
      return
    }
    const q = parseFloat(outQty.replace(/,/g, ""))
    if (isNaN(q) || q <= 0) {
      alert(t("inAlertEnterQty") || "수량을 입력해주세요.")
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
      alert(t("outEmptyList") || "담긴 품목이 없습니다.")
      return
    }
    if (!confirm(t("outConfirmMsg") || "출고 확정하시겠습니까?")) return
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
        alert(res.message || t("outSaveSuccess"))
        setCart([])
      } else {
        alert(res.message || t("outSaveFailed"))
      }
    } catch {
      alert(t("outProcessFail"))
    } finally {
      setSaving(false)
    }
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
  }, [groupedHistory, invoiceSearch, itemSearch, isOffice])

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
          spec: it.spec || "",
          qty: it.qty || 0,
          amount: it.amount || 0,
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
  }, [invoiceSearch, itemSearch])

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
    isFirstPage: boolean,
    invT: (k: string) => string
  ) => {
    const docNo = (group.invoiceNo || `IV-${(group.date || "").replace(/\D/g, "")}`).trim()
    const dateStr = (group.date || "").split(" ")[0] || new Date().toISOString().slice(0, 10)
    const d = dateStr.length === 10
      ? `${dateStr.slice(5, 7)}/${dateStr.slice(8, 10)}/${dateStr.slice(0, 4)}`
      : dateStr.replace(/-/g, "/")
    const totalBaht = Math.round(Math.abs(group.totalAmt || 0))
    const vat7 = Math.round(totalBaht * 0.07)
    const grandTotal = totalBaht + vat7
    const grandWords = `( ${grandTotal.toLocaleString()} ${invT("inv_baht_only")} )`
    const companyName = company?.companyName || "บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)"
    const address = company?.address || "-"
    const taxId = company?.taxId || ""
    const phone = company?.phone || ""
    const bankInfo = company?.bankInfo || ""
    const projectName = company?.projectName || "CM True Digital Park"
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
    <h2 style="margin:0; font-size:1.25rem;">${invT("inv_title")}</h2>
    <div style="text-align:right; font-size:11px;">
      <div>${invT("inv_original_doc")}</div>
      <div><strong>${invT("inv_doc_no")}:</strong> ${docNo}</div>
      <div><strong>${invT("inv_date")}:</strong> ${d}</div>
      <div><strong>${invT("inv_due_date")}:</strong> ${d}</div>
      <div><strong>${invT("inv_reference")}:</strong> ${group.invoiceNo || "-"}</div>
      <div><strong>Project Name:</strong> ${projectName}</div>
    </div>
  </div>
  <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
    <div style="flex:1; padding-left:5mm;">
      <div style="font-weight:700; margin-bottom:4px;">${companyName}</div>
      <div style="font-size:11px; color:#475569;">${address}<br>${invT("inv_tax_id")} ${taxId} | ${phone}</div>
    </div>
    <div style="flex:1; padding-left:calc(16px + 5mm);">
      <div style="font-weight:700; margin-bottom:4px;">${invT("inv_client")}</div>
      <div style="font-size:11px; color:#475569;">${clientName}${clientTaxId ? "<br>" + invT("inv_tax_id") + ": " + clientTaxId : ""}${clientAddr ? "<br>" + invT("inv_address") + ": " + clientAddr : ""}${clientPhone ? "<br>" + invT("inv_phone") + ": " + clientPhone : ""}</div>
    </div>
  </div>
  <table class="table table-bordered" style="${tableStyle}"><thead><tr><th style="${thStyle}">#</th><th style="${thStyle}">${invT("inv_description")}</th><th style="${thStyle}">Qty.</th><th style="${thStyle}">U/P</th><th style="${thStyle}">Disc.</th><th style="${thStyle}">${invT("inv_amount")}</th></tr></thead><tbody>${rows}</tbody></table>
  <div style="display:flex; justify-content:flex-end;"><div style="text-align:right; font-size:12px; min-width:200px;">
    <div>${invT("inv_total")}: ${totalBaht.toLocaleString()} THB</div>
    <div>${invT("inv_vat7")}: ${vat7.toLocaleString()} THB</div>
    <div style="font-weight:700;">${invT("inv_grand_total")}: ${grandTotal.toLocaleString()} THB</div>
    <div style="font-size:11px; margin-top:4px;">${grandWords}</div>
  </div></div>
  <div style="margin-top:16px; font-size:11px; color:#475569;"><strong>${invT("inv_remarks")}:</strong> ${bankInfo}</div>
  <div style="margin-top:20px; display:flex; justify-content:space-between; font-size:11px;">
    <div><strong>${clientName}</strong><br>${invT("inv_received_by")} ________________  ${invT("inv_date")} ________________</div>
    <div><strong>${companyName.split(" ")[0]}</strong><br>${invT("inv_approved_by")} ________________  ${invT("inv_date")} ________________</div>
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
      t("orderColDate") || "주문 일자",
      t("orderColDeliveryDate") || "배송 일자",
      t("outColInvNo") || "인보이스",
      t("outFilterType") || "유형",
      t("outColStore") || "출고처",
      t("outColItem") || "품목명",
      t("spec") || "규격",
      t("outColQty") || "수량",
      t("inColAmount") || "금액",
    ]
    const dataRows: string[][] = []
    for (const g of checked) {
      const orderDate = g.date?.slice(0, 10) || ""
      const deliveryDate = (g.items[0]?.deliveryDate || "").slice(0, 10) || "-"
      const type = g.type || "Force"
      const target = g.target || "-"
      for (const it of g.items) {
        const name = it.name || "-"
        const spec = it.spec || "-"
        dataRows.push([orderDate, deliveryDate, g.invoiceNo || "-", type, target, name, spec, String(it.qty ?? ""), String(it.amount ?? "")])
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
      const invT = (k: string) => t(k as "inv_title") || k
      let prevTarget: string | null = null
      const html = checked.map((g, idx) => {
        const isFirst = idx === 0 || g.target !== prevTarget
        prevTarget = g.target
        const client = (clients && clients[g.target]) || { companyName: g.target || "-" }
        return buildInvoiceHtml(g, company, client, isFirst, invT)
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
        body.invoice-printing #invoice-print-area * { visibility: visible !important; }
        body.invoice-printing #invoice-print-area {
          display: block !important; position: absolute !important; left: 0 !important; top: 0 !important;
          margin: 0 !important; width: 210mm !important; min-width: 210mm !important;
          max-width: 210mm !important; padding: 0 10mm !important; box-sizing: border-box !important;
          overflow: visible !important; line-height: 1.85 !important; z-index: 999999 !important;
          background: #fff !important; visibility: visible !important;
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

  const [tabValue, setTabValue] = React.useState<"new" | "hist">(isOffice ? "new" : "hist")

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
      <div className="p-6 space-y-4">
        <ShipmentHeader
          value={tabValue}
          onValueChange={(v) => setTabValue(v)}
          showNewTab={isOffice}
        />

        <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as "new" | "hist")} className="space-y-4">

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
              histStore={histStore}
              outboundTargets={outboundTargets}
              onHistTypeChange={setHistType}
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
