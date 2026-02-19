"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerRole } from "@/lib/permissions"
import {
  getAdminOrders,
  getOrderFilterOptions,
  getVendorsForPurchase,
  type AdminOrderItem,
  useStoreList,
} from "@/lib/api-client"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Printer, FileSpreadsheet, Search, ArrowRightCircle, ChevronDown } from "lucide-react"
import { useOrderCreate } from "@/lib/order-create-context"

const HQ_STORES = ["본사", "Office", "오피스", "본점"]
const inputClass = "h-9 rounded-md border border-input bg-background px-3 text-sm w-full min-w-0"
const filterClass = "h-9 rounded-md border border-input bg-background px-2 text-sm shrink-0"

interface ItemRow {
  id: string
  orderId: number
  date: string
  deliveryDate: string
  store: string
  userName: string
  userNick: string
  code: string
  name: string
  category: string
  vendor: string
  qty: number
  price: number
  status: string
}

export function AdminOrderHistory() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const userStore = (auth?.store || "").trim()
  const isManager = isManagerRole(auth?.role || "")
  const isHQ = HQ_STORES.some((h) => userStore.toLowerCase().includes(h.toLowerCase()))
  const { stores: storeListFromApi } = useStoreList()
  const orderCtx = useOrderCreate()
  const setActiveTab = orderCtx?.setActiveTab ?? (() => {})
  const setTransferToPo = orderCtx?.setTransferToPo ?? (() => {})

  const [list, setList] = React.useState<AdminOrderItem[]>([])
  const [storesFromOrders, setStoresFromOrders] = React.useState<string[]>([])
  const [vendors, setVendors] = React.useState<{ code: string; name: string }[]>([])
  const [filterCategories, setFilterCategories] = React.useState<string[]>([])
  const [filterVendors, setFilterVendors] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startDate, setStartDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [statusFilter, setStatusFilter] = React.useState("All")
  const [categoryFilter, setCategoryFilter] = React.useState("All")
  const [vendorFilter, setVendorFilter] = React.useState("All")
  const [itemNameFilter, setItemNameFilter] = React.useState("")
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = React.useState(false)
  const [transferGroupDialog, setTransferGroupDialog] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const effectiveStore = !isHQ && userStore ? userStore : storeFilter === "All" ? undefined : storeFilter
      const [ordersRes, venRes] = await Promise.all([
        getAdminOrders({
          startStr: startDate,
          endStr: endDate,
          store: effectiveStore,
          status: statusFilter === "All" ? undefined : statusFilter,
          userStore: userStore || undefined,
          userRole: auth?.role,
        }),
        getVendorsForPurchase(),
      ])
      const { list: rows, stores: s } = ordersRes
      setList(rows || [])
      setStoresFromOrders(s || [])
      setVendors((venRes || []).map((v) => ({ code: v.code, name: v.name })))
      setHasSearched(true)
    } catch {
      setList([])
      setHasSearched(true)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, storeFilter, statusFilter, userStore, auth?.role, isHQ])

  React.useEffect(() => {
    getOrderFilterOptions()
      .then(({ categories, vendors: v }) => {
        setFilterCategories(categories || [])
        setFilterVendors(v || [])
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [startDate, endDate, storeFilter, statusFilter, categoryFilter, vendorFilter, itemNameFilter])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size >= itemRows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(itemRows.map((r) => r.id)))
    }
  }

  const stores = React.useMemo(() => {
    const fromApi = storeListFromApi || []
    const fromOrders = storesFromOrders || []
    return [...new Set([...fromApi, ...fromOrders])].filter(Boolean).sort()
  }, [storeListFromApi, storesFromOrders])

  const categoriesFromList = React.useMemo(() => {
    const set = new Set<string>()
    for (const o of list) {
      for (const it of o.items || []) {
        const c = String(it.category || "").trim()
        if (c) set.add(c)
      }
    }
    return Array.from(set).sort()
  }, [list])

  const vendorListFromList = React.useMemo(() => {
    const set = new Set<string>()
    for (const o of list) {
      for (const it of o.items || []) {
        const v = String(it.vendor || "").trim()
        if (v) set.add(v)
      }
    }
    return Array.from(set).sort()
  }, [list])

  const categories = React.useMemo(
    () => Array.from(new Set([...filterCategories, ...categoriesFromList])).sort(),
    [filterCategories, categoriesFromList]
  )

  const vendorList = React.useMemo(
    () => Array.from(new Set([...filterVendors, ...vendorListFromList])).sort(),
    [filterVendors, vendorListFromList]
  )

  const filteredOrders = React.useMemo(() => {
    let out = list
    if (categoryFilter && categoryFilter !== "All") {
      out = out.filter((o) =>
        (o.items || []).some((it) => String(it.category || "").trim() === categoryFilter)
      )
    }
    if (vendorFilter && vendorFilter !== "All") {
      out = out.filter((o) =>
        (o.items || []).some((it) => String(it.vendor || "").trim() === vendorFilter)
      )
    }
    if (itemNameFilter.trim()) {
      const kw = itemNameFilter.trim().toLowerCase()
      out = out.filter((o) =>
        (o.items || []).some(
          (it) =>
            (it.name || "").toLowerCase().includes(kw) ||
            (it.code || "").toLowerCase().includes(kw)
        )
      )
    }
    return out
  }, [list, categoryFilter, vendorFilter, itemNameFilter])

  const itemRows: ItemRow[] = React.useMemo(() => {
    const rows: ItemRow[] = []
    for (const o of filteredOrders) {
      for (let itemIdx = 0; itemIdx < (o.items || []).length; itemIdx++) {
        const it = o.items![itemIdx]
        const qty = it.originalQty ?? it.qty ?? 0
        const price = Number(it.price) || 0
        const vendorStr = String(it.vendor || "").trim()
        const categoryStr = String(it.category || "").trim()
        if (vendorFilter && vendorFilter !== "All" && vendorStr !== vendorFilter) continue
        if (categoryFilter && categoryFilter !== "All" && categoryStr !== categoryFilter) continue
        rows.push({
          id: `${o.orderId}-${itemIdx}`,
          orderId: o.orderId,
          date: o.date,
          deliveryDate: o.deliveryDate || "",
          store: o.store || "",
          userName: o.userName || "",
          userNick: o.userNick || o.userName || "",
          code: it.code || "",
          name: it.name || "",
          category: String(it.category || "").trim(),
          vendor: vendorStr,
          qty,
          price,
          status: o.status || "Pending",
        })
      }
    }
    return rows
  }, [filteredOrders, vendorFilter, categoryFilter])

  const dateShort = (d: string) => {
    if (!d) return "-"
    const m = d.match(/(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[1]}-${m[2]}-${m[3]}` : d.substring(0, 10)
  }

  const selectedRows = React.useMemo(
    () => itemRows.filter((r) => selectedIds.has(r.id)),
    [itemRows, selectedIds]
  )
  const selectedByVendor = React.useMemo(() => {
    const byVendor = new Map<string, { code: string; name: string; price: number; qty: number }[]>()
    for (const r of selectedRows) {
      const v = String(r.vendor || "").trim()
      if (!v) continue
      const arr = byVendor.get(v) || []
      const existing = arr.find((x) => x.code === r.code)
      if (existing) {
        existing.qty += r.qty
      } else {
        arr.push({ code: r.code, name: r.name, price: r.price || 0, qty: r.qty })
      }
      byVendor.set(v, arr)
    }
    return byVendor
  }, [selectedRows])

  const vendorCountInSelection = selectedByVendor.size
  const canTransferToPo = isHQ && selectedIds.size > 0 && vendorCountInSelection === 1
  const transferVendorItems = React.useMemo(() => {
    if (vendorCountInSelection !== 1) return []
    const [, items] = Array.from(selectedByVendor.entries())[0] || [[], []]
    const byCode = new Map<string, { code: string; name: string; price: number; qty: number }>()
    for (const x of items) {
      const existing = byCode.get(x.code)
      if (existing) {
        existing.qty += x.qty
      } else {
        byCode.set(x.code, { ...x })
      }
    }
    return Array.from(byCode.values())
  }, [selectedByVendor, vendorCountInSelection])

  const doTransferForVendor = (vendorStr: string, groupByStore: boolean) => {
    const vendorRows = selectedRows.filter((r) => String(r.vendor || "").trim() === vendorStr)
    if (vendorRows.length === 0) return
    const matched = vendors.find(
      (v) =>
        v.code.toLowerCase() === vendorStr.toLowerCase() ||
        v.name.toLowerCase() === vendorStr.toLowerCase()
    )
    const vendorCode = matched?.code ?? vendorStr
    const vendorName = matched?.name ?? vendorStr
    let cart: { code: string; name: string; price: number; qty: number; store?: string }[]
    if (groupByStore) {
      cart = vendorRows.map((r) => ({
        code: r.code,
        name: r.name,
        price: r.price || 0,
        qty: r.qty,
        store: r.store || "",
      }))
    } else {
      const byCode = new Map<string, { code: string; name: string; price: number; qty: number }>()
      for (const r of vendorRows) {
        const existing = byCode.get(r.code)
        if (existing) existing.qty += r.qty
        else byCode.set(r.code, { code: r.code, name: r.name, price: r.price || 0, qty: r.qty })
      }
      cart = Array.from(byCode.values())
    }
    setTransferToPo({
      vendorCode,
      vendorName,
      cart: cart.map((x) => ({ code: x.code, name: x.name, price: x.price, qty: x.qty, store: x.store })),
      groupByStore,
    })
    setTransferGroupDialog(null)
    setActiveTab("hq")
  }

  const handleTransferToPo = () => {
    if (canTransferToPo && transferVendorItems.length > 0) {
      const [[vendorStr]] = Array.from(selectedByVendor.entries()) as [string, unknown][]
      setTransferGroupDialog(vendorStr)
    }
  }

  const handleTransferVendorClick = (vendorStr: string) => {
    setTransferGroupDialog(vendorStr)
  }

  const handlePrint = () => {
    const win = window.open("", "_blank")
    if (!win) return
    const rowsToPrint = selectedIds.size > 0 ? selectedRows : itemRows
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${t("orderTabStoreOrderHist") || "매장 발주 내역"}</title>
<style>body{font-family:Arial,sans-serif;padding:16px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px}th{background:#f5f5f5;text-align:center}.num{text-align:center}</style>
</head><body>
<h1>${t("orderTabStoreOrderHist") || "매장 발주 내역"}</h1>
<p>${t("orderFilterPeriod")}: ${startDate} ~ ${endDate}${selectedIds.size > 0 ? ` (${t("orderSelectedItems") || "선택"} ${rowsToPrint.length}건)` : ""}</p>
<table>
<thead><tr>
<th>${t("orderColDate")}</th><th>${t("orderColDeliveryDate")}</th><th>${t("orderColStore")}</th>
<th>${t("emp_label_nickname")}</th><th>${t("orderColCode")}</th><th>${t("orderItemName")}</th>
<th>${t("itemsCategory")}</th><th>${t("itemsVendor")}</th>
<th class="num">${t("orderItemQty")}</th><th class="num">${t("orderItemUnitPrice")}</th><th class="num">${t("orderItemTotal")}</th>
<th>${t("orderColStatus")}</th>
</tr></thead>
<tbody>
${rowsToPrint.map((r) => {
  const statusLabel = r.status === "Pending" ? t("orderStatusPending") : r.status === "Approved" ? t("orderStatusApproved") : r.status === "Rejected" ? t("orderStatusRejected") : r.status === "Hold" ? t("orderStatusHold") : r.status || ""
  return `<tr><td>${dateShort(r.date)}</td><td>${dateShort(r.deliveryDate)}</td><td>${(r.store || "").replace(/</g, "&lt;")}</td><td>${(r.userNick || r.userName || "").replace(/</g, "&lt;")}</td><td>${(r.code || "").replace(/</g, "&lt;")}</td><td>${(r.name || "").replace(/</g, "&lt;")}</td><td>${(r.category || "").replace(/</g, "&lt;")}</td><td>${(r.vendor || "").replace(/</g, "&lt;")}</td><td class="num">${r.qty}</td><td class="num">${r.price}</td><td class="num">${r.price * r.qty}</td><td>${statusLabel}</td></tr>`
}).join("")}
</tbody>
</table>
</body></html>`
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.close()
    }, 300)
  }

  const handleExcel = () => {
    const escapeCsv = (s: string | number) => {
      const str = String(s ?? "")
      if (str.indexOf(",") !== -1 || str.indexOf('"') !== -1 || str.indexOf("\n") !== -1) return `"${str.replace(/"/g, '""')}"`
      return str
    }
    const rowsToExport = selectedIds.size > 0 ? selectedRows : itemRows
    const headers = [
      t("orderColDate"),
      t("orderColDeliveryDate"),
      t("orderColStore"),
      t("emp_label_nickname"),
      t("orderColCode"),
      t("orderItemName"),
      t("itemsCategory"),
      t("itemsVendor"),
      t("orderItemQty"),
      t("orderItemUnitPrice"),
      t("orderItemTotal"),
      t("orderColStatus"),
    ]
    const rows = rowsToExport.map((r) => [
      dateShort(r.date),
      dateShort(r.deliveryDate),
      r.store,
      r.userNick || r.userName,
      r.code,
      r.name,
      r.category,
      r.vendor,
      r.qty,
      r.price,
      r.price * r.qty,
      r.status,
    ])
    const csv = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `order_history_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isHQ && (
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className={filterClass + " w-[100px]"}>
              <SelectValue placeholder={t("orderFilterStore")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t("orderFilterStoreAll")}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={filterClass + " w-[110px] min-w-[110px] max-w-[110px] text-[13px]"} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={filterClass + " w-[110px] min-w-[110px] max-w-[110px] text-[13px]"} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className={filterClass + " w-[85px]"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">{t("orderStatusAll")}</SelectItem>
            <SelectItem value="Pending">{t("orderStatusPending")}</SelectItem>
            <SelectItem value="Approved">{t("orderStatusApproved")}</SelectItem>
            <SelectItem value="Rejected">{t("orderStatusRejected")}</SelectItem>
            <SelectItem value="Hold">{t("orderStatusHold")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className={filterClass + " w-[95px]"}>
            <SelectValue placeholder={t("itemsCategory")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">{t("itemsCategoryAll")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className={filterClass + " w-[95px]"}>
            <SelectValue placeholder={t("itemsVendor")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">{t("orderFilterVendorAll")}</SelectItem>
            {vendorList.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder={t("itemsColName")}
          value={itemNameFilter}
          onChange={(e) => setItemNameFilter(e.target.value)}
          className={filterClass + " w-[100px] min-w-[100px] max-w-[100px]"}
        />
        <Button size="sm" onClick={() => load()} disabled={loading} className="h-9 shrink-0">
          <Search className="mr-1 h-4 w-4" />
          {t("orderBtnSearch")}
        </Button>
        {isHQ && !isManager && (
          vendorCountInSelection > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="default"
                  className="h-9 shrink-0"
                  disabled={selectedIds.size === 0}
                  title={t("orderTransferToPoByVendor") || "거래처별로 선택하여 보내기"}
                >
                  <ArrowRightCircle className="mr-1 h-4 w-4" />
                  {t("orderTransferToPo")} ({selectedIds.size})
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {Array.from(selectedByVendor.entries()).map(([vendorName, items]) => {
                  const count = items.reduce((s, x) => s + (x.qty ?? 0), 0)
                  return (
                    <DropdownMenuItem
                      key={vendorName}
                      onClick={() => handleTransferVendorClick(vendorName)}
                    >
                      {vendorName} ({items.length}품목, {count}개)
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={handleTransferToPo}
              disabled={!canTransferToPo}
              className="h-9 shrink-0"
              title={
                selectedIds.size === 0
                  ? (t("orderSelectItemsFirst") || "품목을 선택해 주세요")
                  : ""
              }
            >
              <ArrowRightCircle className="mr-1 h-4 w-4" />
              {t("orderTransferToPo")}{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
          )
        )}
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={itemRows.length === 0} className="h-9 shrink-0">
          <Printer className="mr-1 h-4 w-4" />
          {t("printBtn")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExcel} disabled={itemRows.length === 0} className="h-9 shrink-0">
          <FileSpreadsheet className="mr-1 h-4 w-4" />
          {t("excelBtn")}
        </Button>
        {itemRows.length > 0 && (
          <span className="text-sm font-medium text-primary shrink-0">{itemRows.length} {t("orderDetailCount")}</span>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                {isHQ && (
                  <th className="w-10 px-2 py-2 text-center">
                    <Checkbox
                      checked={itemRows.length > 0 && selectedIds.size >= itemRows.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label={t("orderSelectAll") || "전체 선택"}
                    />
                  </th>
                )}
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderColDate")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderColDeliveryDate")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderColStore")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap w-[52px]">{t("emp_label_nickname")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderColCode")}</th>
                <th className="px-3 py-2 text-center font-medium whitespace-nowrap min-w-[260px]">{t("orderItemName")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("itemsCategory")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("itemsVendor")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderItemQty")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderItemUnitPrice")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderItemTotal")}</th>
                <th className="px-2 py-2 text-center font-medium whitespace-nowrap">{t("orderColStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isHQ ? 13 : 12} className="px-4 py-8 text-center text-muted-foreground">{t("loading")}</td></tr>
              ) : !hasSearched ? (
                <tr><td colSpan={isHQ ? 13 : 12} className="px-4 py-8 text-center text-muted-foreground">{t("orderSearchHint") || "조회 버튼을 눌러 주세요."}</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={isHQ ? 13 : 12} className="px-4 py-8 text-center text-muted-foreground">{t("orderNoData")}</td></tr>
              ) : itemRows.length === 0 ? (
                <tr><td colSpan={isHQ ? 13 : 12} className="px-4 py-8 text-center text-muted-foreground">{t("mgr_no_match") || "조건에 맞는 내역이 없습니다."}</td></tr>
              ) : (
                itemRows.map((r) => {
                  const statusBg = r.status === "Pending" ? "bg-warning/10 text-warning" : r.status === "Approved" ? "bg-success/10 text-success" : r.status === "Rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  const statusLabel = r.status === "Pending" ? t("orderStatusPending") : r.status === "Approved" ? t("orderStatusApproved") : r.status === "Rejected" ? t("orderStatusRejected") : r.status === "Hold" ? t("orderStatusHold") : r.status || ""
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      {isHQ && (
                        <td className="w-10 px-2 py-1.5 text-center">
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                            aria-label={r.name || r.code}
                          />
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{dateShort(r.date)}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{dateShort(r.deliveryDate) || "-"}</td>
                      <td className="px-2 py-1.5 text-center font-medium whitespace-nowrap">{r.store || "-"}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap w-[52px] text-xs">{r.userNick || r.userName || "-"}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground whitespace-nowrap">{r.code || "-"}</td>
                      <td className="px-3 py-1.5 font-medium min-w-[260px]">{r.name || "-"}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.category || "-"}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.vendor || "-"}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.qty}</td>
                      <td className="px-2 py-1.5 text-center whitespace-nowrap">{(r.price || 0).toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-center font-medium whitespace-nowrap">{(r.price * r.qty).toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusBg}`}>{statusLabel}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!transferGroupDialog} onOpenChange={(open) => !open && setTransferGroupDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("orderTransferDisplayMode") || "품목 표시 방식"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("orderTransferDisplayModeHint") || "주문 품목을 매장별로 나눠서 보여줄까요, 합쳐서 보여줄까요?"}
          </p>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => transferGroupDialog && doTransferForVendor(transferGroupDialog, true)}
            >
              {t("orderTransferByStore") || "매장별로"}
            </Button>
            <Button
              onClick={() => transferGroupDialog && doTransferForVendor(transferGroupDialog, false)}
            >
              {t("orderTransferMerged") || "합쳐서"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
