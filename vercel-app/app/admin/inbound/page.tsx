"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { parsePurchaseDrillNav } from "@/lib/income-statement-purchase-drill-nav"
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
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Invoice, type InvoiceData } from "@/components/invoice"
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
  getInvoiceData,
  getInvoiceSettings,
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
import { parsePurchaseOrderCart } from "@/lib/purchase-order-cart"
import {
  buildInboundPrintHtmlBulk,
  buildInboundPrintHtmlSingle,
  type InboundPrintBatchInput,
} from "@/lib/inbound-print-html"
import { buildInboundExcelHtmlBulk, buildInboundExcelHtmlSingle } from "@/lib/inbound-excel-html"
import { resolveInvoiceClientForTarget } from "@/lib/invoice-client-resolve"
import { buildInboundTaxInvoiceData } from "@/lib/build-inbound-tax-invoice-data"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

function inboundTableRowToPrintBatch(row: InboundTableRow): InboundPrintBatchInput {
  return {
    date: row.date,
    poDate: row.poDate ?? null,
    vendor: row.vendor,
    poNo: row.poNo,
    invoiceNo: row.invoiceNo,
    items: row.items.map((it) => ({
      name: it.name,
      spec: it.spec,
      qty: it.qty,
      amount: it.amount,
      vatAmount: it.vatAmount,
    })),
    totalQty: row.totalQty,
    totalAmt: row.totalAmt,
    totalVat: row.totalVat,
  }
}

function parsePoCart(json: string | undefined): { code?: string; name?: string; price?: number; qty?: number }[] {
  return parsePurchaseOrderCart(json).items
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
  const [histVendorSearch, setHistVendorSearch] = React.useState("")
  const [histItemSearch, setHistItemSearch] = React.useState("")
  const [histStore, setHistStore] = React.useState("")
  const [histPurchaseSource, setHistPurchaseSource] = React.useState<"" | "hq" | "store">("")
  const [histMonth, setHistMonth] = React.useState("")
  const [summaryStart, setSummaryStart] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [summaryEnd, setSummaryEnd] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [summaryMonth, setSummaryMonth] = React.useState("")
  const [summaryMonthDialogOpen, setSummaryMonthDialogOpen] = React.useState(false)
  const [summaryMonthDraft, setSummaryMonthDraft] = React.useState("")
  const [summaryLoading, setSummaryLoading] = React.useState(false)
  const [summaryList, setSummaryList] = React.useState<InboundHistoryItem[]>([])
  const [summaryVendorFilter, setSummaryVendorFilter] = React.useState("")
  const [summaryCategoryFilter, setSummaryCategoryFilter] = React.useState("")
  const [summaryItemSearch, setSummaryItemSearch] = React.useState("")
  const [summaryStoreFilter, setSummaryStoreFilter] = React.useState("")
  const [summaryVendorSortBy, setSummaryVendorSortBy] = React.useState<"qty" | "amount">("amount")
  const [summaryVendorSortDir, setSummaryVendorSortDir] = React.useState<"asc" | "desc">("desc")
  const [summaryItemSortBy, setSummaryItemSortBy] = React.useState<"qty" | "amount">("amount")
  const [summaryItemSortDir, setSummaryItemSortDir] = React.useState<"asc" | "desc">("desc")
  const [fromPoId, setFromPoId] = React.useState<number | null>(null)
  const [taxInvoicePreviewOpen, setTaxInvoicePreviewOpen] = React.useState(false)
  const [taxInvoicePreviewData, setTaxInvoicePreviewData] = React.useState<InvoiceData | null>(null)

  const searchParams = useSearchParams()
  const { posStores: storeList } = useStoreList()

  const isOffice = React.useMemo(() => {
    const store = (auth?.store || "").trim()
    return OFFICE_STORES.some((s) => store.toLowerCase().includes(s.toLowerCase()))
  }, [auth?.store])

  const purchaseVendors = React.useMemo(() => {
    return vendors.filter((v) => v.type === "purchase" || v.type === "both")
  }, [vendors])

  const histVendorSelectOptions = React.useMemo(() => {
    const masters = purchaseVendors.map((v) => v.name).filter(Boolean)
    const fromHist = [...new Set(historyList.map((h) => h.vendor).filter(Boolean))]
    return [...new Set([...masters, ...fromHist])].sort((a, b) => a.localeCompare(b))
  }, [purchaseVendors, historyList])

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

  const summaryVendorOptions = React.useMemo(() => {
    const fromMaster = purchaseVendors.map((v) => v.name).filter(Boolean)
    const fromRows = [...new Set(summaryList.map((r) => r.vendor).filter(Boolean))]
    return [...new Set([...fromMaster, ...fromRows])].sort((a, b) => a.localeCompare(b))
  }, [purchaseVendors, summaryList])

  const summaryCategoryOptions = React.useMemo(() => {
    return [...new Set(items.map((it) => String(it.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [items])

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
    const today = new Date().toISOString().slice(0, 10)
    setSummaryStart(today)
    setSummaryEnd(today)
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
    let s = String(histStart || "").trim()
    let e = String(histEnd || "").trim()
    if (!s || !e) {
      if (histMonth) {
        const [y, m] = histMonth.split("-").map(Number)
        if (y && m) {
          s = new Date(y, m - 1, 1).toISOString().slice(0, 10)
          e = new Date(y, m, 0).toISOString().slice(0, 10)
        }
      }
    }
    if (!s || !e) {
      const today = new Date().toISOString().slice(0, 10)
      s = s || today
      e = e || today
    }
    setHistoryLoading(true)
    try {
      if (isOffice) {
        const list = await getInboundHistory({
          startStr: s,
          endStr: e,
          vendorFilter: histVendor || undefined,
          vendorSearch: !histVendor.trim() && histVendorSearch.trim() ? histVendorSearch.trim() : undefined,
          itemSearch: histItemSearch.trim() || undefined,
          storeFilter: histStore || undefined,
        })
        setHistoryList(Array.isArray(list) ? list : [])
      } else {
        const list = await getInboundForStore({
          storeName: auth?.store || "",
          startStr: s,
          endStr: e,
          vendorFilter: histVendor || undefined,
          vendorSearch: !histVendor.trim() && histVendorSearch.trim() ? histVendorSearch.trim() : undefined,
          itemSearch: histItemSearch.trim() || undefined,
        })
        setHistoryList(Array.isArray(list) ? list : [])
      }
    } catch {
      setHistoryList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [histStart, histEnd, histMonth, histVendor, histVendorSearch, histItemSearch, histStore, isOffice, auth?.store])

  const applyHistMonthRange = React.useCallback((month: string) => {
    setHistMonth(month)
    if (!month) return
    const [y, m] = month.split("-").map(Number)
    if (!y || !m) return
    const first = new Date(y, m - 1, 1).toISOString().slice(0, 10)
    const last = new Date(y, m, 0).toISOString().slice(0, 10)
    setHistStart(first)
    setHistEnd(last)
  }, [])

  const handleSummaryStartChange = React.useCallback((next: string) => {
    setSummaryStart(next)
    if (next && summaryMonth) setSummaryMonth("")
  }, [summaryMonth])

  const handleSummaryEndChange = React.useCallback((next: string) => {
    setSummaryEnd(next)
    if (next && summaryMonth) setSummaryMonth("")
  }, [summaryMonth])

  const applySummaryMonthRange = React.useCallback((month: string) => {
    setSummaryMonth(month)
    if (!month) return
    const [y, m] = month.split("-").map(Number)
    if (!y || !m) return
    const first = new Date(y, m - 1, 1).toISOString().slice(0, 10)
    const last = new Date(y, m, 0).toISOString().slice(0, 10)
    setSummaryStart(first)
    setSummaryEnd(last)
  }, [])

  const openSummaryMonthDialog = React.useCallback(() => {
    setSummaryMonthDraft(summaryMonth || "")
    setSummaryMonthDialogOpen(true)
  }, [summaryMonth])

  const pickCurrentSummaryMonth = React.useCallback(() => {
    const now = new Date()
    setSummaryMonthDraft(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
  }, [])

  const handleApplySummaryMonthDialog = React.useCallback(() => {
    applySummaryMonthRange(summaryMonthDraft)
    setSummaryMonthDialogOpen(false)
  }, [applySummaryMonthRange, summaryMonthDraft])

  const handleClearSummaryMonthDialog = React.useCallback(() => {
    applySummaryMonthRange("")
    setSummaryMonthDialogOpen(false)
  }, [applySummaryMonthRange])

  const fetchSummaryHistory = React.useCallback(async () => {
    let s = summaryStart
    let e = summaryEnd
    if (summaryMonth) {
      const [y, m] = summaryMonth.split("-").map(Number)
      const first = new Date(y, m - 1, 1).toISOString().slice(0, 10)
      const last = new Date(y, m, 0).toISOString().slice(0, 10)
      s = first
      e = last
    }
    if (!s || !e) return
    setSummaryLoading(true)
    try {
      if (isOffice) {
        const list = await getInboundHistory({
          startStr: s,
          endStr: e,
          storeFilter: summaryStoreFilter || undefined,
          itemSearch: summaryItemSearch.trim() || undefined,
        })
        setSummaryList(Array.isArray(list) ? list : [])
      } else {
        const list = await getInboundForStore({
          storeName: auth?.store || "",
          startStr: s,
          endStr: e,
          itemSearch: summaryItemSearch.trim() || undefined,
        })
        setSummaryList(Array.isArray(list) ? list : [])
      }
    } catch {
      setSummaryList([])
    } finally {
      setSummaryLoading(false)
    }
  }, [summaryStart, summaryEnd, summaryMonth, summaryStoreFilter, summaryItemSearch, isOffice, auth?.store])

  const itemCategoryMap = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      const code = String(item.code || "").trim()
      const category = String(item.category || "").trim()
      if (code && category && !map.has(code)) map.set(code, category)
    }
    return map
  }, [items])

  const filteredSummaryRows = React.useMemo(() => {
    let rows = summaryList
    if (summaryVendorFilter) {
      rows = rows.filter((r) => String(r.vendor || "").trim() === summaryVendorFilter)
    }
    if (summaryCategoryFilter) {
      rows = rows.filter((r) => (itemCategoryMap.get(String(r.code || "").trim()) || "") === summaryCategoryFilter)
    }
    if (summaryItemSearch.trim()) {
      const q = summaryItemSearch.trim().toLowerCase()
      rows = rows.filter((r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.spec || "").toLowerCase().includes(q)
      )
    }
    return rows
  }, [summaryList, summaryVendorFilter, summaryCategoryFilter, summaryItemSearch, itemCategoryMap])

  const summaryByVendor = React.useMemo(() => {
    const map = new Map<string, { vendor: string; qty: number; amount: number }>()
    for (const row of filteredSummaryRows) {
      const key = String(row.vendor || "").trim() || "-"
      const current = map.get(key)
      if (current) {
        current.qty += Number(row.qty || 0)
        current.amount += Number(row.amount || 0)
      } else {
        map.set(key, { vendor: key, qty: Number(row.qty || 0), amount: Number(row.amount || 0) })
      }
    }
    const rows = Array.from(map.values())
    rows.sort((a, b) => {
      const primary = summaryVendorSortBy === "qty" ? a.qty - b.qty : a.amount - b.amount
      if (primary !== 0) return summaryVendorSortDir === "asc" ? primary : -primary
      return a.vendor.localeCompare(b.vendor)
    })
    return rows
  }, [filteredSummaryRows, summaryVendorSortBy, summaryVendorSortDir])

  const summaryByItem = React.useMemo(() => {
    const map = new Map<string, { code: string; name: string; spec: string; qty: number; amount: number }>()
    for (const row of filteredSummaryRows) {
      const code = String(row.code || "").trim()
      const name = String(row.name || "").trim()
      const spec = String(row.spec || "").trim()
      const key = `${code}__${name}__${spec}`
      const current = map.get(key)
      if (current) {
        current.qty += Number(row.qty || 0)
        current.amount += Number(row.amount || 0)
      } else {
        map.set(key, { code, name, spec, qty: Number(row.qty || 0), amount: Number(row.amount || 0) })
      }
    }
    const rows = Array.from(map.values())
    rows.sort((a, b) => {
      const primary = summaryItemSortBy === "qty" ? a.qty - b.qty : a.amount - b.amount
      if (primary !== 0) return summaryItemSortDir === "asc" ? primary : -primary
      return a.code.localeCompare(b.code) || a.name.localeCompare(b.name)
    })
    return rows
  }, [filteredSummaryRows, summaryItemSortBy, summaryItemSortDir])

  const summaryVendorTotals = React.useMemo(
    () =>
      summaryByVendor.reduce((acc, row) => ({ qty: acc.qty + row.qty, amount: acc.amount + row.amount }), {
        qty: 0,
        amount: 0,
      }),
    [summaryByVendor]
  )

  const summaryItemTotals = React.useMemo(
    () =>
      summaryByItem.reduce((acc, row) => ({ qty: acc.qty + row.qty, amount: acc.amount + row.amount }), {
        qty: 0,
        amount: 0,
      }),
    [summaryByItem]
  )

  const toggleSummaryVendorSort = (field: "qty" | "amount") => {
    if (summaryVendorSortBy === field) {
      setSummaryVendorSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
      return
    }
    setSummaryVendorSortBy(field)
    setSummaryVendorSortDir("desc")
  }

  const toggleSummaryItemSort = (field: "qty" | "amount") => {
    if (summaryItemSortBy === field) {
      setSummaryItemSortDir((prev) => (prev === "desc" ? "asc" : "desc"))
      return
    }
    setSummaryItemSortBy(field)
    setSummaryItemSortDir("desc")
  }

  const sortMark = (active: boolean, dir: "asc" | "desc") => {
    if (!active) return ""
    return dir === "desc" ? " ▼" : " ▲"
  }

  const formatInboundLineName = React.useCallback(
    (it: Pick<InboundHistoryItem, "name">) =>
      it.name === "__BANK_PURCHASE_PAYMENT__" ? t("inBankPurchasePaymentLabel") : it.name || "",
    [t]
  )

  const filteredHistoryList = React.useMemo(() => {
    if (!histPurchaseSource) return historyList
    return historyList.filter((i) => (i.purchaseSource ?? "hq") === histPurchaseSource)
  }, [historyList, histPurchaseSource])

  const groupedHistory = React.useMemo(() => {
    const g: Record<string, { date: string; po_created_at?: string | null; vendor: string; totalQty: number; totalAmt: number; totalVat: number; items: InboundHistoryItem[]; inbound_batch_id?: number | null; po_no?: string | null; invoice_no?: string | null; invoice_received?: boolean }> = {}
    for (const i of filteredHistoryList) {
      const batchId = i.inbound_batch_id
      const bankId = i.bank_transaction_id
      const k = bankId ? `banktx-${bankId}` : batchId ? `b${batchId}` : `${i.date}_${i.vendor}`
      if (!g[k]) {
        g[k] = {
          date: i.date,
          po_created_at: i.po_created_at ?? null,
          vendor: i.vendor,
          totalQty: 0,
          totalAmt: 0,
          totalVat: 0,
          items: [],
          inbound_batch_id: batchId ?? null,
          po_no: i.po_no ?? null,
          invoice_no: i.invoice_no ?? null,
          invoice_received: Boolean(i.invoice_received),
        }
      } else {
        const cur = g[k]
        if (!cur.po_no?.trim() && (i.po_no || "").trim()) cur.po_no = i.po_no ?? null
        if (!cur.invoice_no?.trim() && (i.invoice_no || "").trim()) cur.invoice_no = i.invoice_no ?? null
        if (!cur.po_created_at && i.po_created_at) cur.po_created_at = i.po_created_at
        cur.invoice_received = Boolean(cur.invoice_received) || Boolean(i.invoice_received)
        if (cur.inbound_batch_id == null && batchId != null) cur.inbound_batch_id = batchId
      }
      g[k].items.push(i)
      g[k].totalQty += i.qty
      g[k].totalAmt += i.amount || 0
      g[k].totalVat += i.vatAmount || 0
    }
    return Object.entries(g).map(([groupKey, data]) => ({ groupKey, ...data }))
  }, [filteredHistoryList])

  const periodTotal = React.useMemo(() => {
    return filteredHistoryList.reduce((sum, i) => sum + (i.amount || 0), 0)
  }, [filteredHistoryList])

  const periodVatTotal = React.useMemo(() => {
    return filteredHistoryList.reduce((sum, i) => sum + (i.vatAmount || 0), 0)
  }, [filteredHistoryList])

  const inboundTableRows = React.useMemo((): InboundTableRow[] => {
    return groupedHistory.map((g) => {
      const first = g.items[0]
      const firstLine = formatInboundLineName(first)
      const itemsSummary =
        g.items.length === 1
          ? `${firstLine}${first?.spec ? ` (${first.spec})` : ""}`
          : `${formatInboundLineName(g.items[0])} ${t("inEtcCount")} ${g.items.length - 1}`
      return {
        id: g.groupKey,
        date: g.date,
        poDate: g.po_created_at ?? undefined,
        vendor: g.vendor,
        inboundBatchId: g.inbound_batch_id ?? undefined,
        poNo: g.po_no ?? undefined,
        invoiceNo: g.invoice_no ?? undefined,
        invoiceReceived: g.invoice_received,
        items: g.items.map((it) => ({
          name: formatInboundLineName(it),
          spec: it.spec || "",
          qty: it.qty || 0,
          amount: it.amount || 0,
          vatAmount: it.vatAmount || 0,
        })),
        itemsSummary,
        totalQty: g.totalQty,
        totalAmt: g.totalAmt,
        totalVat: g.totalVat,
      }
    })
  }, [groupedHistory, t, formatInboundLineName])

  const [tabValue, setTabValue] = React.useState<"new" | "hist" | "summary" | "guide">("new")
  const [editingRow, setEditingRow] = React.useState<InboundTableRow | null>(null)
  const [updatingInvoiceId, setUpdatingInvoiceId] = React.useState<number | null>(null)
  const [filtersHydrated, setFiltersHydrated] = React.useState(false)

  React.useEffect(() => {
    const plNav = parsePurchaseDrillNav(searchParams)
    if (plNav.fromPlDrill) {
      if (plNav.startStr) setHistStart(plNav.startStr)
      if (plNav.endStr) setHistEnd(plNav.endStr)
      if (plNav.yearMonth) setHistMonth(plNav.yearMonth)
      if (plNav.vendorLabel) {
        setHistVendor(plNav.vendorLabel)
        setHistVendorSearch(plNav.vendorLabel)
      }
      if (plNav.store) setHistStore(plNav.store)
      if (searchParams.get("tab") === "hist") setTabValue("hist")
      setFiltersHydrated(true)
      return
    }
    try {
      const histRaw = sessionStorage.getItem("inbound:hist-filters:v1")
      if (histRaw) {
        const parsed = JSON.parse(histRaw) as {
          histStart?: string
          histEnd?: string
          histMonth?: string
          histVendor?: string
          histVendorSearch?: string
          histItemSearch?: string
          histStore?: string
          histPurchaseSource?: "" | "hq" | "store"
        }
        if (typeof parsed.histStart === "string") setHistStart(parsed.histStart)
        if (typeof parsed.histEnd === "string") setHistEnd(parsed.histEnd)
        if (typeof parsed.histMonth === "string") setHistMonth(parsed.histMonth)
        if (typeof parsed.histVendor === "string") setHistVendor(parsed.histVendor)
        if (typeof parsed.histVendorSearch === "string") setHistVendorSearch(parsed.histVendorSearch)
        if (typeof parsed.histItemSearch === "string") setHistItemSearch(parsed.histItemSearch)
        if (typeof parsed.histStore === "string") setHistStore(parsed.histStore)
        if (parsed.histPurchaseSource === "" || parsed.histPurchaseSource === "hq" || parsed.histPurchaseSource === "store") {
          setHistPurchaseSource(parsed.histPurchaseSource)
        }
      }

      const summaryRaw = sessionStorage.getItem("inbound:summary-filters:v1")
      if (summaryRaw) {
        const parsed = JSON.parse(summaryRaw) as {
          summaryStart?: string
          summaryEnd?: string
          summaryMonth?: string
          summaryVendorFilter?: string
          summaryCategoryFilter?: string
          summaryItemSearch?: string
          summaryStoreFilter?: string
          summaryVendorSortBy?: "qty" | "amount"
          summaryVendorSortDir?: "asc" | "desc"
          summaryItemSortBy?: "qty" | "amount"
          summaryItemSortDir?: "asc" | "desc"
        }
        if (typeof parsed.summaryStart === "string") setSummaryStart(parsed.summaryStart)
        if (typeof parsed.summaryEnd === "string") setSummaryEnd(parsed.summaryEnd)
        if (typeof parsed.summaryMonth === "string") setSummaryMonth(parsed.summaryMonth)
        if (typeof parsed.summaryVendorFilter === "string") setSummaryVendorFilter(parsed.summaryVendorFilter)
        if (typeof parsed.summaryCategoryFilter === "string") setSummaryCategoryFilter(parsed.summaryCategoryFilter)
        if (typeof parsed.summaryItemSearch === "string") setSummaryItemSearch(parsed.summaryItemSearch)
        if (typeof parsed.summaryStoreFilter === "string") setSummaryStoreFilter(parsed.summaryStoreFilter)
        if (parsed.summaryVendorSortBy === "qty" || parsed.summaryVendorSortBy === "amount") setSummaryVendorSortBy(parsed.summaryVendorSortBy)
        if (parsed.summaryVendorSortDir === "asc" || parsed.summaryVendorSortDir === "desc") setSummaryVendorSortDir(parsed.summaryVendorSortDir)
        if (parsed.summaryItemSortBy === "qty" || parsed.summaryItemSortBy === "amount") setSummaryItemSortBy(parsed.summaryItemSortBy)
        if (parsed.summaryItemSortDir === "asc" || parsed.summaryItemSortDir === "desc") setSummaryItemSortDir(parsed.summaryItemSortDir)
      }

      const tabRaw = sessionStorage.getItem("inbound:active-tab:v1")
      if (tabRaw === "new" || tabRaw === "hist" || tabRaw === "summary" || tabRaw === "guide") {
        setTabValue(tabRaw)
      }
    } catch {}
    setFiltersHydrated(true)
  }, [searchParams])

  React.useEffect(() => {
    if (!filtersHydrated) return
    try {
      sessionStorage.setItem(
        "inbound:hist-filters:v1",
        JSON.stringify({
          histStart,
          histEnd,
          histMonth,
          histVendor,
          histVendorSearch,
          histItemSearch,
          histStore,
          histPurchaseSource,
        })
      )
    } catch {}
  }, [filtersHydrated, histStart, histEnd, histMonth, histVendor, histVendorSearch, histItemSearch, histStore, histPurchaseSource])

  React.useEffect(() => {
    if (!filtersHydrated) return
    try {
      sessionStorage.setItem(
        "inbound:summary-filters:v1",
        JSON.stringify({
          summaryStart,
          summaryEnd,
          summaryMonth,
          summaryVendorFilter,
          summaryCategoryFilter,
          summaryItemSearch,
          summaryStoreFilter,
          summaryVendorSortBy,
          summaryVendorSortDir,
          summaryItemSortBy,
          summaryItemSortDir,
        })
      )
    } catch {}
  }, [
    filtersHydrated,
    summaryStart,
    summaryEnd,
    summaryMonth,
    summaryVendorFilter,
    summaryCategoryFilter,
    summaryItemSearch,
    summaryStoreFilter,
    summaryVendorSortBy,
    summaryVendorSortDir,
    summaryItemSortBy,
    summaryItemSortDir,
  ])

  React.useEffect(() => {
    if (!filtersHydrated) return
    try {
      sessionStorage.setItem("inbound:active-tab:v1", tabValue)
    } catch {}
  }, [filtersHydrated, tabValue])

  /** 내역 탭으로 들어오면 현재 필터로 조회 (본사·매장 공통) */
  React.useEffect(() => {
    if (tabValue !== "hist") return
    void fetchHistory()
  }, [tabValue])

  React.useEffect(() => {
    if (tabValue !== "summary") return
    void fetchSummaryHistory()
  }, [tabValue])

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
      } catch {
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
      } catch {
        await appAlert(t("processFail") || "처리 실패")
      } finally {
        setUpdatingInvoiceId(null)
      }
    },
    [fetchHistory, t]
  )

  /** 본사 단건 인쇄·가맹 🧾 보기 미리보기 — 동일 HTML (`buildInboundPrintHtmlSingle`) */
  const getInboundPrintHtmlForRow = React.useCallback(
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
      const supplyLabel = t("salesSupplyAmount") || t("posSystemSubtotal") || "Supply"
      const vatLabel = t("posVatLabel") || "VAT"
      const totalLabel = t("inv_total") || t("total") || "Total"
      return buildInboundPrintHtmlSingle(inboundTableRowToPrintBatch(row), {
        locale,
        lang,
        t,
        supplyLabel,
        vatLabel,
        totalLabel,
      })
    },
    [lang, t]
  )

  const printInbound = React.useCallback(
    (row: InboundTableRow) => {
      const html = getInboundPrintHtmlForRow(row)
      const w = window.open("", "_blank")
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => {
          w.print()
          w.close()
        }, 300)
      }
    },
    [getInboundPrintHtmlForRow]
  )

  /** 본사·가맹 단건 엑셀 — 동일 `buildInboundExcelHtmlSingle` (매장 컨텍스트는 역할에 따라 분기) */
  const getInboundExcelHtmlForRow = React.useCallback(
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
      const supplyLabel = t("salesSupplyAmount") || t("posSystemSubtotal") || "Supply"
      const vatLabel = t("posVatLabel") || "VAT"
      const totalLabel = t("inv_total") || t("total") || "Total"
      const periodLabel =
        histStart && histEnd ? `${histStart} ~ ${histEnd}` : row.date || "—"
      const storeLabelRaw = isOffice
        ? (histStore?.trim() ? histStore : (t("store_all_stores") || "AllStores"))
        : (auth?.store?.trim() || t("store") || "Store")
      return buildInboundExcelHtmlSingle(inboundTableRowToPrintBatch(row), {
        locale,
        t,
        supplyLabel,
        vatLabel,
        totalLabel,
        generatedAt: new Date(),
        periodLabel,
        storeContext: storeLabelRaw,
      })
    },
    [t, lang, histStart, histEnd, isOffice, histStore, auth?.store]
  )

  const exportInboundExcel = React.useCallback(
    (row: InboundTableRow) => {
      const storeLabelRaw = isOffice
        ? (histStore?.trim() ? histStore : (t("store_all_stores") || "AllStores"))
        : (auth?.store?.trim() || t("store") || "Store")
      const html = getInboundExcelHtmlForRow(row)
      const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const startLabel = (histStart || row.date || "").replace(/-/g, "")
      const endLabel = (histEnd || row.date || "").replace(/-/g, "")
      const periodFile = startLabel && endLabel ? `${startLabel}-${endLabel}` : (row.date || "").replace(/-/g, "")
      const storeLabel = storeLabelRaw.replace(/[/\\?*:"|]/g, "_").slice(0, 20)
      a.download = `Inbound_${storeLabel}_${periodFile}_${(row.vendor || "").replace(/[/\\?*:"|]/g, "_").slice(0, 20)}.xls`
      a.click()
      URL.revokeObjectURL(url)
    },
    [getInboundExcelHtmlForRow, isOffice, histStore, t, auth?.store, histStart, histEnd]
  )

  /** 가맹점 🧾 — 출고·미수금과 동일 Tax Invoice (`/admin/invoice-print` + vendors 매출처 마스터) */
  const prepareFranchiseTaxInvoiceData = React.useCallback(
    async (row: InboundTableRow) => {
      try {
        const [invoiceDataRes, invSettings] = await Promise.all([getInvoiceData(), getInvoiceSettings()])
        const company = invoiceDataRes?.company ?? null
        const clients = invoiceDataRes?.clients ?? {}
        const settings =
          typeof invSettings === "object" && invSettings !== null ? (invSettings as Record<string, string>) : {}
        const storeTarget = String(auth?.store || "").trim()
        const client = resolveInvoiceClientForTarget(storeTarget, company, clients)
        return buildInboundTaxInvoiceData({ row, company, client, invSettings: settings })
      } catch (e) {
        console.error(e)
        return null
      }
    },
    [auth?.store]
  )

  const openFranchiseTaxInvoicePreview = React.useCallback(
    async (row: InboundTableRow) => {
      const data = await prepareFranchiseTaxInvoiceData(row)
      if (!data) {
        await appAlert(t("invLoadFailed"))
        return
      }
      setTaxInvoicePreviewData(data)
      setTaxInvoicePreviewOpen(true)
    },
    [prepareFranchiseTaxInvoiceData, t]
  )

  const printInboundBulk = React.useCallback(
    (rows: InboundTableRow[]) => {
      if (!rows.length) return
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
      const supplyLabel = t("salesSupplyAmount") || t("posSystemSubtotal") || "Supply"
      const vatLabel = t("posVatLabel") || "VAT"
      const totalLabel = t("inv_total") || t("total") || "Total"
      const html = buildInboundPrintHtmlBulk(rows.map(inboundTableRowToPrintBatch), {
        locale,
        lang,
        t,
        supplyLabel,
        vatLabel,
        totalLabel,
      })
      const w = window.open("", "_blank")
      if (w) {
        w.document.write(html)
        w.document.close()
        w.focus()
        setTimeout(() => {
          w.print()
          w.close()
        }, 300)
      }
    },
    [lang, t]
  )

  const exportInboundExcelBulk = React.useCallback(
    (rows: InboundTableRow[]) => {
      if (!rows.length) return
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
      const supplyLabel = t("salesSupplyAmount") || t("posSystemSubtotal") || "Supply"
      const vatLabel = t("posVatLabel") || "VAT"
      const totalLabel = t("inv_total") || t("total") || "Total"
      const periodLabel = histStart && histEnd ? `${histStart} ~ ${histEnd}` : "—"
      const storeLabelRaw = isOffice
        ? (histStore?.trim() ? histStore : (t("store_all_stores") || "AllStores"))
        : (auth?.store?.trim() || t("store") || "Store")
      const html = buildInboundExcelHtmlBulk(rows.map(inboundTableRowToPrintBatch), {
        locale,
        t,
        supplyLabel,
        vatLabel,
        totalLabel,
        generatedAt: new Date(),
        periodLabel,
        storeContext: storeLabelRaw,
      })
      const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const startLabel = (histStart || "").replace(/-/g, "")
      const endLabel = (histEnd || "").replace(/-/g, "")
      const periodFile = startLabel && endLabel ? `${startLabel}-${endLabel}` : "period"
      const storeLabel = storeLabelRaw.replace(/[/\\?*:"|]/g, "_").slice(0, 20)
      a.download = `Inbound_bulk_${storeLabel}_${periodFile}.xls`
      a.click()
      URL.revokeObjectURL(url)
    },
    [t, lang, histStart, histEnd, isOffice, histStore, auth?.store]
  )

  const periodTotalFormatted = `${periodTotal.toLocaleString()}${lang === "th" ? " THB" : ""}`
  const periodVatFormatted = `${periodVatTotal.toLocaleString()}${lang === "th" ? " THB" : ""}`

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
        <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as "new" | "hist" | "summary" | "guide")} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="new" className={adminTabsTriggerCn}>
                  {t("inTabNew")}
                </TabsTrigger>
                <TabsTrigger value="hist" className={adminTabsTriggerCn}>
                  {t("inTabHist")}
                </TabsTrigger>
                <TabsTrigger value="summary" className={adminTabsTriggerCn}>
                  {t("inTabSummary")}
                </TabsTrigger>
                <TabsTrigger value="guide" className={adminTabsTriggerCn}>
                  {t("inTabGuide")}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="new" className={adminTabsContentCn}>
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
                                      className={`${ADMIN_BTN_XS_CN} text-destructive hover:text-destructive`}
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

          <TabsContent value="hist" className={adminTabsContentCn}>
            {isOffice ? (
              <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                {t("inHistFilterHintOffice")}
              </p>
            ) : (
              <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                {t("inHistExpandHintStore")}
              </p>
            )}
            <InboundFilterBar
              totalAmount={periodTotalFormatted}
              totalVat={periodVatFormatted}
              isOffice={isOffice}
              histStore={histStore}
              stores={histStoreOptions}
              onHistStoreChange={setHistStore}
              histStart={histStart}
              histEnd={histEnd}
              histMonth={histMonth}
              onHistStartChange={setHistStart}
              onHistEndChange={setHistEnd}
              onHistMonthChange={applyHistMonthRange}
              onMonthClick={() => {
                const now = new Date()
                applyHistMonthRange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
              }}
              histVendor={histVendor}
              vendors={histVendorSelectOptions}
              onHistVendorChange={setHistVendor}
              histItemSearch={histItemSearch}
              onHistItemSearchChange={setHistItemSearch}
              histVendorSearch={histVendorSearch}
              onHistVendorSearchChange={setHistVendorSearch}
              histPurchaseSource={histPurchaseSource}
              onHistPurchaseSourceChange={setHistPurchaseSource}
              onSearch={fetchHistory}
            />
            <div className="overflow-x-auto max-h-[500px]">
              <InboundTable
                rows={inboundTableRows}
                loading={historyLoading}
                onEdit={isOffice ? handleEditRow : undefined}
                onDelete={isOffice ? handleDeleteRow : undefined}
                onInvoiceReceivedToggle={isOffice ? handleInvoiceReceivedToggle : undefined}
                onPrint={isOffice ? printInbound : undefined}
                onExcel={isOffice ? exportInboundExcel : undefined}
                onBulkPrint={printInboundBulk}
                onBulkExcel={exportInboundExcelBulk}
                updatingInvoiceId={updatingInvoiceId}
                franchiseTaxInvoicePreview={!isOffice ? openFranchiseTaxInvoicePreview : undefined}
              />
            </div>
            <Dialog
              open={taxInvoicePreviewOpen}
              onOpenChange={(open) => {
                setTaxInvoicePreviewOpen(open)
                if (!open) setTaxInvoicePreviewData(null)
              }}
            >
              <DialogContent className="flex max-h-[92vh] max-w-5xl w-[95vw] flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="shrink-0 border-b px-4 py-3 text-left">
                  <DialogTitle>{t("posReceiptTaxInvoice")}</DialogTitle>
                  <DialogDescription className="text-xs leading-relaxed">
                    {t("inTaxInvoicePreviewHint")}
                  </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {taxInvoicePreviewData ? (
                    <Invoice data={taxInvoicePreviewData} printOnly embedded />
                  ) : null}
                </div>
              </DialogContent>
            </Dialog>
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

          <TabsContent value="summary" className={adminTabsContentCn}>
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={summaryStart}
                    onChange={(e) => handleSummaryStartChange(e.target.value)}
                    className="w-[140px] h-9"
                  />
                  <Input
                    type="date"
                    value={summaryEnd}
                    onChange={(e) => handleSummaryEndChange(e.target.value)}
                    className="w-[140px] h-9"
                  />
                  <Button
                    type="button"
                    variant={summaryMonth ? "default" : "outline"}
                    className="h-9"
                    onClick={openSummaryMonthDialog}
                  >
                    {t("outFilterMonth")}
                    {summaryMonth ? ` (${summaryMonth})` : ""}
                  </Button>
                  {isOffice && (
                    <Select value={summaryStoreFilter || "__all__"} onValueChange={(v) => setSummaryStoreFilter(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder={t("store")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("all")}</SelectItem>
                        {histStoreOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" onClick={fetchSummaryHistory} disabled={summaryLoading}>
                    {summaryLoading ? t("loading") : t("btn_query")}
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
                    value={summaryItemSearch}
                    onChange={(e) => setSummaryItemSearch(e.target.value)}
                    placeholder={t("inItemSearchPh")}
                    className="w-[220px] h-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("inSummaryHint")}</p>
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
                    <p className="text-xs text-muted-foreground">
                      {summaryMonth
                        ? "월 필터 적용 중: 선택한 월 전체 기간으로 조회됩니다."
                        : "기간을 직접 입력하면 월 필터는 해제되고 입력한 기간으로 조회됩니다."}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" onClick={pickCurrentSummaryMonth}>
                        {t("thisMonth") || "이번 달"}
                      </Button>
                      <Button type="button" variant="outline" onClick={handleClearSummaryMonthDialog}>
                        {t("all")}
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => setSummaryMonthDialogOpen(false)}>
                        {t("cancel") || "Cancel"}
                      </Button>
                      <Button type="button" onClick={handleApplySummaryMonthDialog}>
                        {t("btn_query")}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-5">
                  <h3 className="text-sm font-bold mb-3">{t("inSummaryByVendor")}</h3>
                  <div className="overflow-x-auto max-h-[480px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr className="border-b">
                          <th className="py-2 px-2 text-left">{t("vendor")}</th>
                          <th className="py-2 px-2 text-right">
                            <button type="button" className="font-semibold hover:text-primary" onClick={() => toggleSummaryVendorSort("qty")}>
                              {t("outColQty")}{sortMark(summaryVendorSortBy === "qty", summaryVendorSortDir)}
                            </button>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <button type="button" className="font-semibold hover:text-primary" onClick={() => toggleSummaryVendorSort("amount")}>
                              {t("inColAmount")}{sortMark(summaryVendorSortBy === "amount", summaryVendorSortDir)}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryByVendor.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-8 text-center text-muted-foreground">{t("inNoData")}</td>
                          </tr>
                        ) : (
                          summaryByVendor.map((row) => (
                            <tr key={row.vendor} className="border-b">
                              <td className="py-2 px-2">{row.vendor}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.qty.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.amount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                        {summaryByVendor.length > 0 && (
                          <tr className="sticky bottom-0 bg-muted/90 border-t-2">
                            <td className="py-2 px-2 font-semibold">{t("inv_total") || "Total"}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryVendorTotals.qty.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryVendorTotals.amount.toLocaleString()}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-5">
                  <h3 className="text-sm font-bold mb-3">{t("inSummaryByItem")}</h3>
                  <div className="overflow-x-auto max-h-[480px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr className="border-b">
                          <th className="py-2 px-2 text-left">{t("inSummaryItemCol")}</th>
                          <th className="py-2 px-2 text-right">
                            <button type="button" className="font-semibold hover:text-primary" onClick={() => toggleSummaryItemSort("qty")}>
                              {t("outColQty")}{sortMark(summaryItemSortBy === "qty", summaryItemSortDir)}
                            </button>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <button type="button" className="font-semibold hover:text-primary" onClick={() => toggleSummaryItemSort("amount")}>
                              {t("inColAmount")}{sortMark(summaryItemSortBy === "amount", summaryItemSortDir)}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryByItem.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-8 text-center text-muted-foreground">{t("inNoData")}</td>
                          </tr>
                        ) : (
                          summaryByItem.map((row) => (
                            <tr key={`${row.code}-${row.name}-${row.spec}`} className="border-b">
                              <td className="py-2 px-2">
                                {row.code ? `[${row.code}] ` : ""}
                                {formatInboundLineName({ name: row.name })}
                                {row.spec ? ` (${row.spec})` : ""}
                              </td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.qty.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{row.amount.toLocaleString()}</td>
                            </tr>
                          ))
                        )}
                        {summaryByItem.length > 0 && (
                          <tr className="sticky bottom-0 bg-muted/90 border-t-2">
                            <td className="py-2 px-2 font-semibold">{t("inv_total") || "Total"}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryItemTotals.qty.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right tabular-nums font-semibold">{summaryItemTotals.amount.toLocaleString()}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="guide" className={adminTabsContentCn}>
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
