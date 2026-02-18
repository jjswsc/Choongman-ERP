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
import { getAdminOrders, type AdminOrderItem } from "@/lib/api-client"
import { Printer, FileSpreadsheet, Search, RefreshCw } from "lucide-react"

const HQ_STORES = ["본사", "Office", "오피스", "본점"]

export function AdminOrderHistory() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(auth?.role || "")
  const userStore = (auth?.store || "").trim()
  const isHQ = HQ_STORES.some((h) => userStore.toLowerCase().includes(h.toLowerCase()))

  const [list, setList] = React.useState<AdminOrderItem[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startDate, setStartDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [storeFilter, setStoreFilter] = React.useState(isManager && userStore ? userStore : "All")
  const [statusFilter, setStatusFilter] = React.useState("All")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const effectiveStore = !isHQ && userStore ? userStore : storeFilter === "All" ? undefined : storeFilter
      const { list: rows, stores: s } = await getAdminOrders({
        startStr: startDate,
        endStr: endDate,
        store: effectiveStore,
        status: statusFilter === "All" ? undefined : statusFilter,
        userStore: userStore || undefined,
        userRole: auth?.role,
      })
      setList(rows || [])
      setStores(s || [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, storeFilter, statusFilter, userStore, auth?.role, isHQ])

  React.useEffect(() => {
    load()
  }, [load])

  const dateShort = (d: string) => {
    if (!d) return "-"
    const m = d.match(/(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[1]}-${m[2]}-${m[3]}` : d.substring(0, 10)
  }

  const handlePrint = () => {
    const win = window.open("", "_blank")
    if (!win) return
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${t("orderTabStoreOrderHist") || "매장 발주 내역"}</title>
<style>body{font-family:Arial,sans-serif;padding:16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f5f5f5}.num{text-align:right}.tot{font-weight:bold}</style>
</head><body>
<h1>${t("orderTabStoreOrderHist") || "매장 발주 내역"}</h1>
<p>${t("orderFilterPeriod")}: ${startDate} ~ ${endDate}</p>
<table>
<thead><tr>
<th>${t("orderColDate")}</th><th>${t("orderColDeliveryDate")}</th><th>${t("orderColStore")}</th>
<th>${t("orderOrderedBy")}</th><th>${t("orderColSummary")}</th><th class="num">${t("orderColTotal")}</th><th>${t("orderColStatus")}</th>
</tr></thead>
<tbody>
${list.map((o) => {
  const delDate = (o.deliveryDate || "").trim().substring(0, 10) || "-"
  const statusLabel = o.status === "Pending" ? (t("orderStatusPending") || "대기") : o.status === "Approved" ? (t("orderStatusApproved") || "승인") : o.status === "Rejected" ? (t("orderStatusRejected") || "거절") : o.status === "Hold" ? (t("orderStatusHold") || "보류") : o.status || ""
  return `<tr><td>${dateShort(o.date)}</td><td>${delDate}</td><td>${(o.store || "").replace(/</g, "&lt;")}</td><td>${(o.userName || "-").replace(/</g, "&lt;")}</td><td>${(o.summary || "-").replace(/</g, "&lt;")}</td><td class="num">${(Number(o.total) || 0).toLocaleString()} ฿</td><td>${statusLabel}</td></tr>`
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
      const t = String(s ?? "")
      if (t.indexOf(",") !== -1 || t.indexOf('"') !== -1 || t.indexOf("\n") !== -1) return `"${t.replace(/"/g, '""')}"`
      return t
    }
    const headers = [t("orderColDate"), t("orderColDeliveryDate"), t("orderColStore"), t("orderOrderedBy"), t("orderColSummary"), t("orderColTotal"), t("orderColStatus")]
    const rows = list.map((o) => [
      dateShort(o.date),
      (o.deliveryDate || "").toString().substring(0, 10) || "",
      o.store || "",
      o.userName || "",
      o.summary || "",
      Number(o.total) || 0,
      o.status || "",
    ])
    const csv = "\uFEFF" + [headers.map(escapeCsv).join(","), ...rows.map((r) => r.map(escapeCsv).join(","))].join("\r\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `order_history_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {isHQ && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("orderFilterStore")}</label>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("orderFilterStoreAll")}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("orderFilterPeriod")}</label>
          <div className="flex gap-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t("orderFilterStatus")}</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[110px]">
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
        </div>
        <Button size="sm" onClick={load} disabled={loading}>
          <Search className="mr-1.5 h-4 w-4" />
          {t("orderBtnSearch")}
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} disabled={list.length === 0}>
          <Printer className="mr-1.5 h-4 w-4" />
          {t("printBtn")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExcel} disabled={list.length === 0}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          {t("excelBtn")}
        </Button>
        {list.length > 0 && (
          <span className="text-sm font-medium text-primary ml-1">{list.length} {t("orderDetailCount")}</span>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">{t("orderColDate")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("orderColDeliveryDate")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("orderColStore")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("orderOrderedBy")}</th>
                <th className="px-4 py-2.5 text-left font-medium">{t("orderColSummary")}</th>
                <th className="px-4 py-2.5 text-right font-medium">{t("orderColTotal")}</th>
                <th className="px-4 py-2.5 text-center font-medium">{t("orderColStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t("loading")}</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">{t("orderNoData")}</td></tr>
              ) : (
                list.map((o) => {
                  const statusBg = o.status === "Pending" ? "bg-warning/10 text-warning" : o.status === "Approved" ? "bg-success/10 text-success" : o.status === "Rejected" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  const statusLabel = o.status === "Pending" ? t("orderStatusPending") : o.status === "Approved" ? t("orderStatusApproved") : o.status === "Rejected" ? t("orderStatusRejected") : o.status === "Hold" ? t("orderStatusHold") : o.status || ""
                  return (
                    <tr key={o.orderId} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2">{dateShort(o.date)}</td>
                      <td className="px-4 py-2">{(o.deliveryDate || "").toString().substring(0, 10) || "-"}</td>
                      <td className="px-4 py-2 font-medium">{o.store || "-"}</td>
                      <td className="px-4 py-2">{o.userName || "-"}</td>
                      <td className="px-4 py-2">{o.summary || "-"}</td>
                      <td className="px-4 py-2 text-right font-medium">{(Number(o.total) || 0).toLocaleString()} ฿</td>
                      <td className="px-4 py-2 text-center">
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
    </div>
  )
}
