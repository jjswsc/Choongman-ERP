"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ArrowDownToLine } from "lucide-react"
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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import {
  getAdminItems,
  getAdminVendors,
  getPurchaseOrders,
  registerInboundBatch,
  getInboundHistory,
  getInboundForStore,
  getInboundBatch,
  updateInboundBatch,
  deleteInboundBatch,
  useStoreList,
  type AdminItem,
  type AdminVendor,
  type InboundHistoryItem,
  type PurchaseOrderRow,
} from "@/lib/api-client"
import { ItemPickerDialog } from "@/components/erp/item-picker-dialog"
import {
  InboundFilterBar,
  InboundTable,
  InboundEditDialog,
  InboundGuideContent,
  type InboundTableRow,
} from "@/components/inbound"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

function parsePoCart(json: string | undefined): { code?: string; name?: string; price?: number; qty?: number }[] {
  if (!json || typeof json !== "string") return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

interface InboundCartItem {
  date: string
  vendor: string
  code: string
  name: string
  spec: string
  qty: string
  cost: string
}

export default function InboundPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const [items, setItems] = React.useState<AdminItem[]>([])
  const [vendors, setVendors] = React.useState<AdminVendor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyList, setHistoryList] = React.useState<InboundHistoryItem[]>([])

  const [inDate, setInDate] = React.useState("")
  const [inVendor, setInVendor] = React.useState("")
  const [inInvoiceNo, setInInvoiceNo] = React.useState("")
  const [inQty, setInQty] = React.useState("")
  const [cart, setCart] = React.useState<InboundCartItem[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<AdminItem | null>(null)
  const [saving, setSaving] = React.useState(false)

  const [histStart, setHistStart] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [histEnd, setHistEnd] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [histVendor, setHistVendor] = React.useState("")
  const [histStore, setHistStore] = React.useState("")
  const [histMonth, setHistMonth] = React.useState("")
  const [fromPoId, setFromPoId] = React.useState<number | null>(null)

  const searchParams = useSearchParams()
  const { stores: storeList } = useStoreList()

  const isOffice = React.useMemo(() => {
    const store = (auth?.store || "").trim()
    return OFFICE_STORES.some((s) => store.toLowerCase().includes(s.toLowerCase()))
  }, [auth?.store])

  const purchaseVendors = React.useMemo(() => {
    return vendors.filter((v) => v.type === "purchase" || v.type === "both")
  }, [vendors])

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setInDate(today)
  }, [])

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setHistStart(today)
    setHistEnd(today)
  }, [])

  React.useEffect(() => {
    Promise.all([getAdminItems(), getAdminVendors()])
      .then(([itemList, vendorList]) => {
        setItems(Array.isArray(itemList) ? itemList : [])
        setVendors(Array.isArray(vendorList) ? vendorList : [])
      })
      .catch(() => {
        setItems([])
        setVendors([])
      })
      .finally(() => setLoading(false))
  }, [])

  // 발주서에서 입고 등록 시 해당 PO 품목 pre-fill
  React.useEffect(() => {
    const poIdParam = searchParams.get("fromPo")
    const poId = poIdParam ? parseInt(poIdParam, 10) : NaN
    if (!poId || isNaN(poId) || !isOffice) return
    setFromPoId(poId)
    getPurchaseOrders({ poId })
      .then((rows) => {
        const po = (Array.isArray(rows) ? rows : [])[0] as PurchaseOrderRow | undefined
        if (!po) return
        const poCart = parsePoCart(po.cart_json)
        const vendorName = String(po.vendor_name || "").trim()
        const batchDate = po.created_at ? po.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
        const prefill: InboundCartItem[] = poCart
          .filter((c) => String(c.code || "").trim())
          .map((c) => ({
            date: batchDate,
            vendor: vendorName,
            code: String(c.code || "").trim(),
            name: String(c.name || "").trim() || String(c.code || "").trim(),
            spec: "",
            qty: String(c.qty ?? 0),
            cost: String(c.price ?? 0),
          }))
        if (prefill.length > 0) {
          setCart(prefill)
          setInVendor(vendorName)
          setInDate(batchDate)
        }
      })
      .catch(() => {})
  }, [searchParams, isOffice])

  const handleItemSelect = (item: AdminItem) => {
    setSelectedItem(item)
    setInQty("")
  }

  const handleAddToList = () => {
    if (!selectedItem) {
      alert(t("inAlertSelectItem"))
      return
    }
    if (!inQty.trim()) {
      alert(t("inAlertEnterQty"))
      return
    }
    if (!inVendor) {
      alert(t("inAlertSelectVendor"))
      return
    }
    const q = parseFloat(inQty.replace(/,/g, ""))
    if (isNaN(q) || q <= 0) {
      alert(t("inAlertEnterQty"))
      return
    }
    setCart((prev) => [
      ...prev,
      {
        date: inDate || new Date().toISOString().slice(0, 10),
        vendor: inVendor,
        code: selectedItem.code,
        name: selectedItem.name,
        spec: selectedItem.spec || "",
        qty: inQty,
        cost: String(selectedItem.cost ?? 0),
      },
    ])
    setSelectedItem(null)
    setInQty("")
  }

  const handleRemoveFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleUpdateCartCost = (idx: number, costStr: string) => {
    setCart((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, cost: costStr } : c))
    )
  }

  const handleSave = async () => {
    if (!cart.length) {
      alert(t("inAlertNoList"))
      return
    }
    const msg = t("inConfirmSave").replace("{count}", String(cart.length))
    if (!confirm(msg)) return
    setSaving(true)
    try {
      const list = cart.map((c) => ({
        date: c.date,
        vendor: c.vendor,
        code: c.code,
        name: c.name,
        spec: c.spec,
        qty: c.qty,
        cost: c.cost ? parseFloat(String(c.cost).replace(/,/g, "")) : undefined,
      }))
      const storeName = !isOffice && auth?.store ? auth.store.trim() : undefined
      const vendorCode = purchaseVendors.find((v) => v.name === cart[0]?.vendor)?.code
      const res = await registerInboundBatch(list, storeName, {
        vendorCode,
        purchaseOrderId: fromPoId ?? undefined,
        invoiceNo: inInvoiceNo.trim() || undefined,
      })
      if (res.success) {
        alert(translateApiMessage(res.message, t) || t("inSaveSuccess"))
        setCart([])
        setInInvoiceNo("")
      } else {
        alert(translateApiMessage(res.message, t) || t("inSaveFailed"))
      }
    } catch {
      alert(t("inSaveFailed"))
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
    try {
      if (isOffice) {
        const list = await getInboundHistory({
          startStr: s,
          endStr: e,
          vendorFilter: histVendor || undefined,
          storeFilter: histStore || undefined,
        })
        setHistoryList(Array.isArray(list) ? list : [])
      } else {
        const list = await getInboundForStore({
          storeName: auth?.store || "",
          startStr: s,
          endStr: e,
          vendorFilter: histVendor || undefined,
        })
        setHistoryList(Array.isArray(list) ? list : [])
      }
    } catch {
      setHistoryList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [histStart, histEnd, histMonth, histVendor, histStore, isOffice, auth?.store])

  const groupedHistory = React.useMemo(() => {
    const g: Record<string, { date: string; vendor: string; totalQty: number; totalAmt: number; items: InboundHistoryItem[]; inbound_batch_id?: number | null; invoice_no?: string | null; invoice_received?: boolean }> = {}
    for (const i of historyList) {
      const batchId = i.inbound_batch_id
      const k = batchId ? `b${batchId}` : `${i.date}_${i.vendor}`
      if (!g[k]) {
        g[k] = { date: i.date, vendor: i.vendor, totalQty: 0, totalAmt: 0, items: [], inbound_batch_id: batchId, invoice_no: i.invoice_no, invoice_received: i.invoice_received }
      }
      g[k].items.push(i)
      g[k].totalQty += i.qty
      g[k].totalAmt += i.amount || 0
    }
    return Object.values(g)
  }, [historyList])

  const periodTotal = React.useMemo(() => {
    return historyList.reduce((sum, i) => sum + (i.amount || 0), 0)
  }, [historyList])

  const inboundTableRows = React.useMemo((): InboundTableRow[] => {
    if (!isOffice) return []
    return groupedHistory.map((g, i) => {
      const first = g.items[0]
      const itemsSummary =
        g.items.length === 1
          ? `${first?.name || ""}${first?.spec ? ` (${first.spec})` : ""}`
          : `${g.items[0]?.name || ""} ${t("inEtcCount")} ${g.items.length - 1}`
      return {
        id: `g-${i}-${g.date}-${g.vendor}`,
        date: g.date,
        vendor: g.vendor,
        inboundBatchId: g.inbound_batch_id ?? undefined,
        invoiceNo: g.invoice_no ?? undefined,
        invoiceReceived: g.invoice_received,
        items: g.items.map((it) => ({
          name: it.name || "",
          spec: it.spec || "",
          qty: it.qty || 0,
          amount: it.amount || 0,
        })),
        itemsSummary,
        totalQty: g.totalQty,
        totalAmt: g.totalAmt,
      }
    })
  }, [groupedHistory, isOffice, t])

  const storeRows = React.useMemo(
    () =>
      historyList.map((i) => ({
        date: i.date,
        vendor: i.vendor,
        item: `${i.name || ""}${i.spec ? ` (${i.spec})` : ""}`.trim() || "-",
        qty: i.qty,
        amount: i.amount || 0,
      })),
    [historyList]
  )

  const [tabValue, setTabValue] = React.useState<"new" | "hist" | "guide">("new")
  const [editingRow, setEditingRow] = React.useState<InboundTableRow | null>(null)
  const [updatingInvoiceId, setUpdatingInvoiceId] = React.useState<number | null>(null)

  const handleEditRow = React.useCallback((row: InboundTableRow) => {
    setEditingRow(row)
  }, [])

  const handleDeleteRow = React.useCallback(
    async (row: InboundTableRow) => {
      if (!row.inboundBatchId) return
      const msg = t("inConfirmDelete") || `${row.date} ${row.vendor} 건을 삭제하시겠습니까? 재고와 미지급금에서도 제거됩니다.`
      if (!confirm(msg)) return
      try {
        const res = await deleteInboundBatch(row.inboundBatchId)
        if (res.success) {
          fetchHistory()
        } else {
          alert(translateApiMessage(res.message, t) || res.message)
        }
      } catch (e) {
        alert(t("processFail") || "처리 실패")
      }
    },
    [t, fetchHistory]
  )

  const handleEditSaved = React.useCallback(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleInvoiceReceivedToggle = React.useCallback(
    async (row: InboundTableRow) => {
      if (!row.inboundBatchId) return
      setUpdatingInvoiceId(row.inboundBatchId)
      try {
        const res = await updateInboundBatch({
          batchId: row.inboundBatchId,
          invoiceReceived: !row.invoiceReceived,
        })
        if (res.success) fetchHistory()
        else alert(translateApiMessage(res.message, t) || res.message)
      } catch (e) {
        alert(t("processFail") || "처리 실패")
      } finally {
        setUpdatingInvoiceId(null)
      }
    },
    [fetchHistory, t]
  )

  const printInbound = React.useCallback(
    (row: InboundTableRow) => {
      const locale = { ko: "ko-KR", en: "en-US", th: "th-TH", mm: "my-MM", la: "lo-LA" }[lang] || "en-US"
      const dateStr = row.date ? new Date(row.date).toLocaleDateString(locale) : ""
      const tbodyHtml = row.items
        .map(
          (it, i) =>
            `<tr><td>${i + 1}</td><td>${(it.name || "-").replace(/</g, "&lt;")}</td><td>${(it.spec || "-").replace(/</g, "&lt;")}</td><td class="num">${it.qty}</td><td class="num">${it.amount.toLocaleString()}</td></tr>`
        )
        .join("")
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("adminInbound")} - ${row.date}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;padding:16px}h1{font-size:20px;margin-bottom:24px;border-bottom:2px solid #333;padding-bottom:8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.num{text-align:right}.tot{font-weight:bold}</style></head><body>
<h1>${t("adminInbound")}</h1><p><strong>${t("stockColDate")}:</strong> ${dateStr}</p><p><strong>${t("inVendor")}:</strong> ${(row.vendor || "-").replace(/</g, "&lt;")}</p>
${row.invoiceNo ? `<p><strong>${t("poInvoiceNo") || "인보이스"}:</strong> ${(row.invoiceNo || "").replace(/</g, "&lt;")}</p>` : ""}
<hr/><table><thead><tr><th>No</th><th>${t("outColItem")}</th><th>${t("spec")}</th><th class="num">${t("outColQty")}</th><th class="num">${t("inColAmount")}</th></tr></thead>
<tbody>${tbodyHtml}</tbody><tfoot><tr class="tot"><td colspan="3" class="num">${t("total")}</td><td class="num">${row.totalQty.toLocaleString()}</td><td class="num">${row.totalAmt.toLocaleString()}</td></tr></tfoot></table></body></html>`
      const w = window.open("", "_blank")
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => { w.print(); w.close() }, 300)
      }
    },
    [lang, t]
  )

  const exportInboundExcel = React.useCallback(
    (row: InboundTableRow) => {
      const escapeXml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      const headers = ["No", t("outColItem"), t("spec"), t("outColQty"), t("inColAmount")]
      const dataRows = row.items.map((it, i) => [i + 1, it.name || "-", it.spec || "-", it.qty, it.amount])
      const allRows = [
        [t("adminInbound"), `${row.date} ${row.vendor}`],
        row.invoiceNo ? [t("poInvoiceNo") || "인보이스", row.invoiceNo] : [],
        [],
        headers,
        ...dataRows.map((r) => r.map((v) => String(v))),
        [],
        [t("total"), "", "", row.totalQty, row.totalAmt],
      ].filter((r) => r.length > 0)
      const colCount = 5
      const pad = (r: (string | number)[], n: number) => [...r].concat(Array(Math.max(0, n - r.length)).fill("")).slice(0, n).map((v) => escapeXml(String(v)))
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{border-collapse:collapse}</style></head><body><table>${allRows.map((row, ri) => `<tr${ri === 3 || ri >= allRows.length - 1 ? ' class="head"' : ""}>${pad(row as (string|number)[], colCount).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`
      const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Inbound_${row.date}_${(row.vendor || "").replace(/[/\\?*:"|]/g, "_").slice(0, 20)}.xls`
      a.click()
      URL.revokeObjectURL(url)
    },
    [t]
  )

  const periodTotalFormatted = `${periodTotal.toLocaleString()}${lang === "th" ? " THB" : ""}`

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminInbound")}</h1>
            <p className="text-xs text-muted-foreground">{isOffice ? t("inPageSubOffice") : t("inPageSubStoreDirect")}</p>
          </div>
        </div>
        <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as "new" | "hist" | "guide")} className="space-y-4">
          <TabsList className="grid w-full max-w-2xl mb-4 grid-cols-3">
            <TabsTrigger value="new" className="text-sm font-medium">{t("inTabNew")}</TabsTrigger>
            <TabsTrigger value="hist" className="text-sm font-medium">{t("inTabHist")}</TabsTrigger>
            <TabsTrigger value="guide" className="text-sm font-medium">{t("inTabGuide")}</TabsTrigger>
          </TabsList>

          <TabsContent value="new">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-2 space-y-4">
                  <div className="rounded-xl border bg-card p-5">
                    <h3 className="text-sm font-bold mb-4">{t("inNewTitle")}</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold">{t("inDate")}</label>
                        <Input
                          type="date"
                          value={inDate}
                          onChange={(e) => setInDate(e.target.value)}
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inVendor")}</label>
                        <Select value={inVendor || "__none__"} onValueChange={(v) => setInVendor(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue placeholder={t("inVendorPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{t("inVendorPlaceholder")}</SelectItem>
                            {purchaseVendors.map((v) => (
                              <SelectItem key={v.code} value={v.name}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("poInvoiceNo") || "인보이스 번호"}</label>
                        <Input
                          value={inInvoiceNo}
                          onChange={(e) => setInInvoiceNo(e.target.value)}
                          className="mt-1 h-9"
                          placeholder="INV-001"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inItem")}</label>
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
                        <label className="text-xs font-semibold">{t("inQty")}</label>
                        <Input
                          type="number"
                          value={inQty}
                          onChange={(e) => setInQty(e.target.value)}
                          placeholder={t("inQty")}
                          className="mt-1 h-9"
                          onKeyDown={(e) => e.key === "Enter" && handleAddToList()}
                        />
                      </div>
                      <Button className="w-full" variant="secondary" onClick={handleAddToList}>
                        {t("inAddList")}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold">
                        {t("inWaitList")} <span className="badge bg-muted px-2 py-0.5 rounded text-xs">{cart.length}</span>
                        {fromPoId && (
                          <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {t("inFromPO")} #{fromPoId}
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">{t("inColItem")}</th>
                            <th className="text-right py-2 px-2 w-20">{t("inColQty")}</th>
                            <th className="text-right py-2 px-2 w-24">{t("inColCost")}</th>
                            <th className="text-right py-2 px-2 w-20">{t("inColAmount")}</th>
                            <th className="w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-muted-foreground text-sm">
                                {t("inEmptyList")}
                              </td>
                            </tr>
                          ) : (
                            cart.map((c, idx) => {
                              const qtyNum = parseFloat(String(c.qty).replace(/,/g, "")) || 0
                              const costNum = parseFloat(String(c.cost).replace(/,/g, "")) || 0
                              const amount = qtyNum * costNum
                              return (
                                <tr key={idx} className="border-b">
                                  <td className="py-2 px-2">{c.name} {c.spec ? `(${c.spec})` : ""}</td>
                                  <td className="py-2 px-2 text-right font-medium">{c.qty}</td>
                                  <td className="py-2 px-2">
                                    <Input
                                      type="number"
                                      value={c.cost}
                                      onChange={(e) => handleUpdateCartCost(idx, e.target.value)}
                                      className="h-8 w-full min-w-[80px] text-right text-sm"
                                      min={0}
                                      step="0.01"
                                    />
                                  </td>
                                  <td className="py-2 px-2 text-right font-medium">
                                    {amount.toLocaleString()}
                                    {lang === "th" ? " THB" : ""}
                                  </td>
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
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      className="w-full mt-4"
                      onClick={handleSave}
                      disabled={saving || !cart.length}
                    >
                      {saving ? t("loading") : t("inSave")}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

          <TabsContent value="hist">
            <InboundFilterBar
              totalAmount={periodTotalFormatted}
              isOffice={isOffice}
              histStore={histStore}
              stores={storeList}
              onHistStoreChange={setHistStore}
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
              histVendor={histVendor}
              vendors={purchaseVendors.map((v) => v.name)}
              onHistVendorChange={setHistVendor}
              onSearch={fetchHistory}
            />
            <div className="overflow-x-auto max-h-[500px]">
              <InboundTable
                isOffice={isOffice}
                rows={inboundTableRows}
                loading={historyLoading}
                storeRows={!isOffice ? storeRows : undefined}
                onEdit={handleEditRow}
                onDelete={handleDeleteRow}
                onInvoiceReceivedToggle={handleInvoiceReceivedToggle}
                onPrint={printInbound}
                onExcel={exportInboundExcel}
                updatingInvoiceId={updatingInvoiceId}
              />
            </div>
            <InboundEditDialog
              open={!!editingRow}
              onOpenChange={(open) => !open && setEditingRow(null)}
              row={editingRow}
              onSaved={handleEditSaved}
              onFetchBatch={async (batchId) => {
                const b = await getInboundBatch(batchId)
                return b ? { vendorName: b.vendorName, vendorCode: b.vendorCode ?? undefined, invoiceNo: b.invoiceNo ?? undefined } : null
              }}
              onSave={async (params) => {
                const res = await updateInboundBatch(params)
                if (!res.success) {
                  alert(translateApiMessage(res.message, t) || res.message)
                  return false
                }
                return true
              }}
            />
          </TabsContent>

          <TabsContent value="guide" className="mt-4">
            <InboundGuideContent />
          </TabsContent>
        </Tabs>

        <ItemPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          items={items}
          onSelect={handleItemSelect}
        />
      </div>
    </div>
  )
}
