"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ArrowDownToLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
  getItemsByVendor,
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
  const [itemsForVendor, setItemsForVendor] = React.useState<AdminItem[]>([])
  const [itemsForVendorLoading, setItemsForVendorLoading] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyList, setHistoryList] = React.useState<InboundHistoryItem[]>([])

  const [inDate, setInDate] = React.useState("")
  /** 입고 매장: 본사는 선택(입고등록=본사, 또는 매장명), 매니저는 자기 매장 고정 */
  const [inStore, setInStore] = React.useState("")
  const [inVendor, setInVendor] = React.useState("")
  const [inPoNo, setInPoNo] = React.useState("")
  const [inInvoiceNo, setInInvoiceNo] = React.useState("")
  const [inQty, setInQty] = React.useState("")
  const [cart, setCart] = React.useState<InboundCartItem[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<AdminItem | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [inVendorSearch, setInVendorSearch] = React.useState("")
  const [inStoreSearch, setInStoreSearch] = React.useState("")

  const [histStart, setHistStart] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [histEnd, setHistEnd] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [histVendor, setHistVendor] = React.useState("")
  const [histStore, setHistStore] = React.useState("")
  const [histPurchaseSource, setHistPurchaseSource] = React.useState<"" | "hq" | "store">("")
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

  /** 판매처 (입고 목적지로 선택 가능) - 매장 아닌 외부 판매처. sales_outlet 우선 */
  const salesVendors = React.useMemo(() => {
    return vendors
      .filter((v) => v.type === "sales" || v.type === "both")
      .map((v) => ({
        code: v.code,
        name: (v.sales_outlet?.trim() || v.gps_name?.trim() || v.name || "").trim(),
      }))
      .filter((v) => v.name)
  }, [vendors])

  const storeOptions = React.useMemo(() => {
    const stores = (storeList || []).filter((s) => s && s !== "All")
    return { stores, salesVendors }
  }, [storeList, salesVendors])

  /** 입고 내역 필터용: 매장 + 판매처 (중복 제거) */
  const histStoreOptions = React.useMemo(() => {
    const base = (storeList || []).filter((s) => s && s !== "All")
    const salesNames = salesVendors.map((v) => v.name).filter(Boolean)
    const seen = new Set(base)
    const out = [...base]
    for (const n of salesNames) {
      if (!seen.has(n)) {
        seen.add(n)
        out.push(n)
      }
    }
    return out
  }, [storeList, salesVendors])

  const filteredStoreOptions = React.useMemo(() => {
    const q = inStoreSearch.trim().toLowerCase()
    const filteredStores = !q
      ? storeOptions.stores
      : storeOptions.stores.filter((s) => s.toLowerCase().includes(q))
    const filteredSales = !q
      ? storeOptions.salesVendors
      : storeOptions.salesVendors.filter(
          (v) => (v.name || v.code || "").toLowerCase().includes(q)
        )
    return { stores: filteredStores, salesVendors: filteredSales }
  }, [storeOptions, inStoreSearch])

  /** 거래처 선택 시 해당 거래처에 등록된 품목 (items.vendor + item_vendors 매핑) */
  const itemsForPicker = React.useMemo(() => {
    if (!inVendor?.trim()) return items
    return itemsForVendor.length > 0 ? itemsForVendor : items.filter((i) => {
      const iv = String(i.vendor || "").trim().toLowerCase()
      const vName = inVendor.trim().toLowerCase()
      const v = purchaseVendors.find((x) => x.name.trim().toLowerCase() === vName)
      const vCode = v?.code?.trim().toLowerCase() ?? ""
      if (!iv) return false
      return iv === vName || iv === vCode
    })
  }, [items, inVendor, purchaseVendors, itemsForVendor])

  React.useEffect(() => {
    if (!inVendor?.trim()) {
      setItemsForVendor([])
      return
    }
    const v = purchaseVendors.find((x) => x.name.trim().toLowerCase() === inVendor.trim().toLowerCase())
    if (!v?.code) {
      setItemsForVendor([])
      return
    }
    setItemsForVendorLoading(true)
    getItemsByVendor(v.code, v.name)
      .then((list) => {
        const mapped: AdminItem[] = (list || []).map((it) => ({
          code: it.code,
          name: it.name,
          category: it.category || "",
          vendor: inVendor.trim(),
          outboundLocation: it.outbound_location,
          spec: it.spec || "",
          unit: "",
          price: it.price,
          cost: it.cost,
          totalQuantity: null,
          taxType: (it.taxType as "taxable" | "exempt" | "zero") || "taxable",
          imageUrl: it.image || "",
          hasImage: !!(it.image || "").trim(),
        }))
        setItemsForVendor(mapped)
      })
      .catch(() => setItemsForVendor([]))
      .finally(() => setItemsForVendorLoading(false))
  }, [inVendor, purchaseVendors])

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setInDate(today)
  }, [])

  React.useEffect(() => {
    if (isOffice) {
      setInStore((prev) => prev || "입고등록")
    } else if (auth?.store) {
      setInStore(auth.store)
    }
  }, [isOffice, auth?.store])

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
          setInPoNo(String(po.po_no || `PO-${po.id}` || "").trim())
        }
      })
      .catch(() => {})
  }, [searchParams, isOffice])

  const handleItemSelect = (item: AdminItem) => {
    setSelectedItem(item)
    setInQty("")
  }

  const handleAddToList = async () => {
    if (!selectedItem) {
      await appAlert(t("inAlertSelectItem"))
      return
    }
    if (!inQty.trim()) {
      await appAlert(t("inAlertEnterQty"))
      return
    }
    if (!inVendor) {
      await appAlert(t("inAlertSelectVendor"))
      return
    }
    const q = parseFloat(inQty.replace(/,/g, ""))
    if (isNaN(q) || q <= 0) {
      await appAlert(t("inAlertEnterQty"))
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
      await appAlert(t("inAlertNoList"))
      return
    }
    const msg = t("inConfirmSave").replace("{count}", String(cart.length))
    if (!await appConfirm(msg)) return
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
      let storeName: string | undefined
      if (!isOffice) {
        storeName = auth?.store?.trim() || undefined
      } else if (!inStore || inStore === "입고등록") {
        storeName = undefined
      } else if (inStore.startsWith("sales:")) {
        const code = inStore.slice(6)
        storeName = salesVendors.find((v) => v.code === code)?.name ?? inStore
      } else {
        storeName = inStore.trim()
      }
      const vendorCode = purchaseVendors.find((v) => v.name === cart[0]?.vendor)?.code
      const res = await registerInboundBatch(list, storeName, {
        vendorCode,
        purchaseOrderId: fromPoId ?? undefined,
        poNo: inPoNo.trim() || undefined,
        invoiceNo: inInvoiceNo.trim() || undefined,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("inSaveSuccess"))
        setCart([])
        setInPoNo("")
        setInInvoiceNo("")
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("inSaveFailed"))
      }
    } catch {
      await appAlert(t("inSaveFailed"))
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

  const filteredHistoryList = React.useMemo(() => {
    if (!histPurchaseSource) return historyList
    return historyList.filter((i) => (i.purchaseSource ?? "hq") === histPurchaseSource)
  }, [historyList, histPurchaseSource])

  const groupedHistory = React.useMemo(() => {
    const g: Record<string, { date: string; po_created_at?: string | null; vendor: string; totalQty: number; totalAmt: number; items: InboundHistoryItem[]; inbound_batch_id?: number | null; po_no?: string | null; invoice_no?: string | null; invoice_received?: boolean }> = {}
    for (const i of filteredHistoryList) {
      const batchId = i.inbound_batch_id
      const k = batchId ? `b${batchId}` : `${i.date}_${i.vendor}`
      if (!g[k]) {
        g[k] = { date: i.date, po_created_at: i.po_created_at, vendor: i.vendor, totalQty: 0, totalAmt: 0, items: [], inbound_batch_id: batchId, po_no: i.po_no, invoice_no: i.invoice_no, invoice_received: i.invoice_received }
      }
      g[k].items.push(i)
      g[k].totalQty += i.qty
      g[k].totalAmt += i.amount || 0
    }
    return Object.values(g)
  }, [filteredHistoryList])

  const periodTotal = React.useMemo(() => {
    return filteredHistoryList.reduce((sum, i) => sum + (i.amount || 0), 0)
  }, [filteredHistoryList])

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
        poDate: g.po_created_at ?? undefined,
        vendor: g.vendor,
        inboundBatchId: g.inbound_batch_id ?? undefined,
        poNo: g.po_no ?? undefined,
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
      filteredHistoryList.map((i) => ({
        date: i.date,
        vendor: i.vendor,
        item: `${i.name || ""}${i.spec ? ` (${i.spec})` : ""}`.trim() || "-",
        qty: i.qty,
        amount: i.amount || 0,
      })),
    [filteredHistoryList]
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
      if (!await appConfirm(msg)) return
      try {
        const res = await deleteInboundBatch(row.inboundBatchId)
        if (res.success) {
          fetchHistory()
        } else {
          await appAlert(translateApiMessage(res.message, t) || res.message)
        }
      } catch (e) {
        await appAlert(t("processFail") || "처리 실패")
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
        else await appAlert(translateApiMessage(res.message, t) || res.message)
      } catch (e) {
        await appAlert(t("processFail") || "처리 실패")
      } finally {
        setUpdatingInvoiceId(null)
      }
    },
    [fetchHistory, t]
  )

  const printInbound = React.useCallback(
    (row: InboundTableRow) => {
      const locale = {
        ko: "ko-KR",
        en: "en-US",
        th: "th-TH",
        mm: "my-MM",
        la: "lo-LA",
        kh: "km-KH",
        vi: "vi-VN",
        ms: "ms-MY",
      }[lang] || "en-US"
      const inboundDateStr = row.date ? new Date(row.date).toLocaleDateString(locale) : ""
      const poDateStr = row.poDate ? new Date(row.poDate).toLocaleDateString(locale) : ""
      const tbodyHtml = row.items
        .map(
          (it, i) =>
            `<tr><td>${i + 1}</td><td>${(it.name || "-").replace(/</g, "&lt;")}</td><td>${(it.spec || "-").replace(/</g, "&lt;")}</td><td class="num">${it.qty}</td><td class="num">${it.amount.toLocaleString()}</td></tr>`
        )
        .join("")
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("adminInbound")} - ${row.date}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;padding:16px}h1{font-size:20px;margin-bottom:24px;border-bottom:2px solid #333;padding-bottom:8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.num{text-align:right}.tot{font-weight:bold}</style></head><body>
<h1>${t("adminInbound")}</h1>${row.poDate ? `<p><strong>${t("inPoDate")}:</strong> ${poDateStr}</p>` : ""}<p><strong>${t("inInboundDate")}:</strong> ${inboundDateStr}</p><p><strong>${t("inVendor")}:</strong> ${(row.vendor || "-").replace(/</g, "&lt;")}</p>
${row.poNo ? `<p><strong>${t("inPoNo") || "PO 번호"}:</strong> ${(row.poNo || "").replace(/</g, "&lt;")}</p>` : ""}${row.invoiceNo ? `<p><strong>${t("inInvoiceNo") || "인보이스"}:</strong> ${(row.invoiceNo || "").replace(/</g, "&lt;")}</p>` : ""}
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
        ...(row.poDate ? [[t("inPoDate"), row.poDate]] : []),
        [t("inInboundDate"), row.date],
        ...(row.poNo ? [[t("inPoNo"), row.poNo]] : []),
        ...(row.invoiceNo ? [[t("inInvoiceNo"), row.invoiceNo]] : []),
        [],
        headers,
        ...dataRows.map((r) => r.map((v) => String(v))),
        [],
        [t("total"), "", "", row.totalQty, row.totalAmt],
      ].filter((r) => r.length > 0)
      const colCount = 5
      const pad = (r: (string | number)[], n: number) => [...r].concat(Array(Math.max(0, n - r.length)).fill("")).slice(0, n).map((v) => escapeXml(String(v)))
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{border-collapse:collapse}</style></head><body><table>${allRows.map((r, ri) => `<tr${ri === 0 || (Array.isArray(r) && r[0] === "No") || ri === allRows.length - 1 ? ' class="head"' : ""}>${pad(r as (string|number)[], colCount).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`
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
                        <label className="text-xs font-semibold">{t("store")}</label>
                        {isOffice ? (
                          <Select value={inStore || "입고등록"} onValueChange={(v) => setInStore(v)} onOpenChange={(open) => !open && setInStoreSearch("")}>
                            <SelectTrigger className="mt-1 h-9">
                              <SelectValue placeholder={t("store")} />
                            </SelectTrigger>
                            <SelectContent>
                              <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  placeholder={t("search") || "검색"}
                                  value={inStoreSearch}
                                  onChange={(e) => setInStoreSearch(e.target.value)}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <SelectGroup>
                                <SelectLabel className="text-muted-foreground font-medium">{t("store")}</SelectLabel>
                                <SelectItem value="입고등록">{t("inLocationHQ")}</SelectItem>
                                {filteredStoreOptions.stores.map((s) => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectGroup>
                              {filteredStoreOptions.salesVendors.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel className="text-muted-foreground font-medium">{t("vendorTypeSales")}</SelectLabel>
                                  {filteredStoreOptions.salesVendors.map((v) => (
                                    <SelectItem key={v.code} value={`sales:${v.code}`}>{v.name}</SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={inStore || auth?.store || "-"} readOnly className="mt-1 h-9 bg-muted" />
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inVendor")}</label>
                        <Select value={inVendor || "__none__"} onValueChange={(v) => setInVendor(v === "__none__" ? "" : v)} onOpenChange={(open) => !open && setInVendorSearch("")}>
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue placeholder={t("inVendorPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="p-1.5 border-b" onClick={(e) => e.stopPropagation()}>
                              <Input
                                placeholder={t("search") || "검색"}
                                value={inVendorSearch}
                                onChange={(e) => setInVendorSearch(e.target.value)}
                                className="h-7 text-xs"
                              />
                            </div>
                            <SelectItem value="__none__">{t("inVendorPlaceholder")}</SelectItem>
                            {purchaseVendors
                              .filter((v) => !inVendorSearch.trim() || (v.name || v.code || "").toLowerCase().includes(inVendorSearch.trim().toLowerCase()))
                              .map((v) => (
                                <SelectItem key={v.code} value={v.name}>
                                  {v.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inPoNo") || "PO 번호"}</label>
                        <Input
                          value={inPoNo}
                          onChange={(e) => setInPoNo(e.target.value)}
                          className="mt-1 h-9"
                          placeholder="PO-2024-001"
                          readOnly={!!fromPoId}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inInvoiceNo") || "인보이스 번호"}</label>
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
              stores={histStoreOptions}
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
              histPurchaseSource={histPurchaseSource}
              onHistPurchaseSourceChange={setHistPurchaseSource}
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
                return b ? { vendorName: b.vendorName, vendorCode: b.vendorCode ?? undefined, poNo: b.poNo ?? undefined, invoiceNo: b.invoiceNo ?? undefined } : null
              }}
              onSave={async (params) => {
                const res = await updateInboundBatch(params)
                if (!res.success) {
                  await appAlert(translateApiMessage(res.message, t) || res.message)
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
          items={itemsForPicker}
          onSelect={handleItemSelect}
        />
      </div>
    </div>
  )
}
