"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import Link from "next/link"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarRange,
  Download,
  ExternalLink,
  FileText,
  Package,
  Printer,
  Search,
  SlidersHorizontal,
  Warehouse,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { appAlert } from "@/lib/app-message"
import { addBangkokCalendarDays, getBangkokMonthRange, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { useIsMobile } from "@/hooks/use-mobile"
import { ADMIN_BTN_XS_CN, ADMIN_NUMERIC_CN, ADMIN_PANEL_WARNING_CN, ADMIN_TABLE_SCROLL_CN } from "@/lib/admin-ui-standards"
import {
  getHqWarehouseDailyStockMatrix,
  type HqWarehouseDailyItemRow,
  type HqWarehouseDailyStockMatrixResult,
  type HqWarehouseMovementColumn,
  type HqWarehouseDayInvoice,
} from "@/lib/api-client"
import {
  applyMatrixViewMode,
  formatYmdThaiBuddhist,
  type MatrixViewMode,
} from "@/lib/hq-warehouse-daily-stock-matrix-view"
import { exportStockDailyMatrixXlsx } from "@/lib/stock-daily-matrix-export"
import { openStockDailyMatrixInvoicePrint } from "@/lib/stock-daily-matrix-invoice-print"

function formatNum(n: number, maxFrac = 2): string {
  if (!Number.isFinite(n)) return "0"
  return Number(n.toFixed(maxFrac)).toLocaleString()
}

function formatYmdShort(ymd: string, useThai: boolean): string {
  if (!ymd) return ""
  return useThai ? formatYmdThaiBuddhist(ymd, true) : ymd.slice(5).replace("-", "/")
}

function columnKindStyles(kind: HqWarehouseMovementColumn["kind"]) {
  switch (kind) {
    case "in":
      return {
        header: "bg-emerald-500/12 text-emerald-900 dark:text-emerald-200 border-emerald-200/60",
        cell: "bg-emerald-500/[0.06]",
        cellActive: "text-emerald-900 dark:text-emerald-100 font-medium",
      }
    case "out":
      return {
        header: "bg-sky-500/12 text-sky-900 dark:text-sky-200 border-sky-200/60",
        cell: "bg-sky-500/[0.05]",
        cellActive: "text-sky-900 dark:text-sky-100 font-medium",
      }
    case "adjust":
      return {
        header: "bg-amber-500/12 text-amber-900 dark:text-amber-200 border-amber-200/60",
        cell: "bg-amber-500/[0.06]",
        cellActive: "text-amber-900 dark:text-amber-100 font-medium",
      }
  }
}

function buildDrillHref(ymd: string, store?: string) {
  const q = new URLSearchParams({
    plDrill: "1",
    tab: "hist",
    startStr: ymd,
    endStr: ymd,
  })
  if (store) q.set("store", store)
  return `/admin/outbound?${q.toString()}`
}

function MiniSparkline({ values }: { values: number[] }) {
  if (!values.length) return <span className="text-muted-foreground/40">—</span>
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-px h-5 w-[4rem]" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-w-[2px] rounded-sm bg-sky-400/75 dark:bg-sky-500/60"
          style={{ height: `${Math.max(15, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  )
}

type StockDailyMatrixPanelProps = {
  storeTargets: string[]
}

export function StockDailyMatrixPanel({ storeTargets }: StockDailyMatrixPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const isMobile = useIsMobile()
  const defaultRange = React.useMemo(() => getBangkokMonthRange(), [])

  const [startStr, setStartStr] = React.useState(defaultRange.startStr)
  const [endStr, setEndStr] = React.useState(defaultRange.endStr)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("")
  const [warehouseKey, setWarehouseKey] = React.useState("본사")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [viewMode, setViewMode] = React.useState<MatrixViewMode>("daily_total")
  const [belowMinOnly, setBelowMinOnly] = React.useState(false)
  const [outboundOnly, setOutboundOnly] = React.useState(false)
  const [useThaiDate, setUseThaiDate] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [data, setData] = React.useState<HqWarehouseDailyStockMatrixResult | null>(null)
  const [invoicePrinting, setInvoicePrinting] = React.useState<string | null>(null)

  const categoryOptions = React.useMemo(() => {
    if (!data?.items) return []
    const cats = new Set<string>()
    for (const r of data.items) {
      const c = (r.category || "").trim()
      if (c) cats.add(c)
    }
    return Array.from(cats).sort()
  }, [data])

  const warehouseOptions = React.useMemo(() => {
    const fromApi = data?.warehouseOptions || []
    return [...new Set([...fromApi, warehouseKey])].sort((a, b) => a.localeCompare(b))
  }, [data?.warehouseOptions, warehouseKey])

  const fetchData = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await getHqWarehouseDailyStockMatrix({
        startStr,
        endStr,
        storeFilter: storeFilter || undefined,
        categoryFilter: categoryFilter || undefined,
        warehouseKey,
        includePriorPeriod: true,
      })
      setData(res)
      if (res.warehouseKey) setWarehouseKey(res.warehouseKey)
    } catch (e) {
      setData(null)
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [startStr, endStr, storeFilter, categoryFilter, warehouseKey])

  React.useEffect(() => {
    void fetchData()
  }, [fetchData])

  const displayMatrix = React.useMemo(() => {
    if (!data) return null
    return applyMatrixViewMode(data.columns, data.items, viewMode)
  }, [data, viewMode])

  const filteredItems = React.useMemo(() => {
    if (!displayMatrix) return []
    let rows = displayMatrix.items
    const q = searchTerm.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.spec.toLowerCase().includes(q)
      )
    }
    if (belowMinOnly) {
      rows = rows.filter((r) => r.minQty > 0 && r.balance < r.minQty)
    }
    if (outboundOnly) {
      rows = rows.filter((r) => r.totalOut > 0)
    }
    return rows
  }, [displayMatrix, searchTerm, belowMinOnly, outboundOnly])

  const summary = React.useMemo(() => {
    if (!data) return null
    let totalOut = 0
    let totalIn = 0
    let lowStock = 0
    for (const row of filteredItems) {
      totalOut += row.totalOut
      totalIn += row.totalIn
      if (row.minQty > 0 && row.balance < row.minQty) lowStock += 1
    }
    const invoiceTotal = data.dayInvoices.reduce((s, inv) => s + inv.grandTotal, 0)
    return {
      itemCount: filteredItems.length,
      columnCount: displayMatrix?.columns.length ?? 0,
      invoiceCount: data.dayInvoices.length,
      invoiceTotal,
      totalOut,
      totalIn,
      lowStock,
      periodDays: data.periodDays,
    }
  }, [data, filteredItems, displayMatrix])

  const applyPreset = (preset: "month" | "lastMonth" | "7d") => {
    if (preset === "month") {
      const r = getBangkokMonthRange()
      setStartStr(r.startStr)
      setEndStr(r.endStr)
      return
    }
    if (preset === "lastMonth") {
      const cur = getBangkokMonthRange()
      const prevYm = addBangkokCalendarDays(cur.startStr, -1).slice(0, 7)
      const r = getBangkokMonthRange(prevYm)
      setStartStr(r.startStr)
      setEndStr(r.endStr)
      return
    }
    const end = getBangkokTodayDateString()
    setEndStr(end)
    setStartStr(addBangkokCalendarDays(end, -6))
  }

  const handleExportXlsx = async () => {
    if (!data || !displayMatrix) return
    await exportStockDailyMatrixXlsx({
      items: filteredItems,
      columns: displayMatrix.columns,
      dayInvoices: data.dayInvoices,
      startStr: data.startStr,
      endStr: data.endStr,
      useThaiDate: useThaiDate,
      labels: {
        code: t("stockDailyMatrixColCode"),
        name: t("stockDailyMatrixColName"),
        unit: t("stockDailyMatrixColUnit"),
        cost: t("stockDailyMatrixColCost"),
        price: t("stockDailyMatrixColPrice"),
        beginning: t("stockDailyMatrixBeginning"),
        balance: t("stockDailyMatrixBalance"),
        minQty: t("stockDailyMatrixMinQty"),
        totalIn: t("stockDailyMatrixTotalIn"),
        totalOut: t("stockDailyMatrixTotalOut"),
        avgDay: t("stockDailyMatrixAvgDay"),
        avgWeek: t("stockDailyMatrixAvgWeek"),
        avgMonth: t("stockDailyMatrixAvgMonth"),
        orderPeriod: t("stockDailyMatrixOrderPeriod"),
        costGoods: t("stockDailyMatrixCostGoods"),
        priorOut: t("stockDailyMatrixPriorOut"),
        outChange: t("stockDailyMatrixOutChange"),
        invoicesTitle: t("stockDailyMatrixInvoicesTitle"),
        invoiceNo: t("stockDailyMatrixInvoiceNo"),
        taxInvoice: t("stockDailyMatrixTaxInvoice"),
        receipt: t("stockDailyMatrixReceipt"),
        totalPrice: t("stockDailyMatrixTotalPrice"),
        subtotal: t("stockDailyMatrixSubtotal"),
        vat: t("stockDailyMatrixVat"),
        grandTotal: t("stockDailyMatrixGrandTotal"),
        date: t("stockHistColDate"),
        store: t("stockHistColStore"),
      },
    })
  }

  const handleInvoicePrint = async (inv: HqWarehouseDayInvoice) => {
    if (!data) return
    const key = inv.invoiceNo || `${inv.ymd}-${inv.store}`
    setInvoicePrinting(key)
    try {
      const res = await openStockDailyMatrixInvoicePrint(inv, data.startStr, data.endStr)
      if (!res.ok) await appAlert(res.message || t("msg_save_fail"))
    } finally {
      setInvoicePrinting(null)
    }
  }

  const columns = displayMatrix?.columns ?? []
  const filterFieldCn = "space-y-1.5 min-w-0"
  const filterLabelCn = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground"

  return (
    <div id="stock-daily-matrix-root" className="space-y-5 print:space-y-2">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #stock-daily-matrix-root, #stock-daily-matrix-root * { visibility: visible; }
          #stock-daily-matrix-root { position: absolute; left: 0; top: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div className="rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/20 p-4 sm:p-5 shadow-sm print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary">
              <Warehouse className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                {data?.warehouseLabel || "S&J"}
              </span>
              {data?.usedRpc && (
                <Badge variant="secondary" className="text-[10px]">{t("stockDailyMatrixRpcHint")}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{t("stockDailyMatrixIntro")}</p>
          </div>
          <Link
            href="/admin/outbound"
            className={cn(ADMIN_BTN_XS_CN, "inline-flex items-center rounded-md border bg-background/80 text-primary hover:bg-primary/5 shrink-0")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("adminOutbound")}
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 bg-emerald-500/10 text-emerald-800 border-emerald-200/60">
            <ArrowDownToLine className="h-3 w-3" /> IN
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 bg-sky-500/10 text-sky-800 border-sky-200/60">
            <ArrowUpFromLine className="h-3 w-3" /> OUT
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 bg-amber-500/10 text-amber-800 border-amber-200/60">
            <SlidersHorizontal className="h-3 w-3" /> ADJ
          </span>
        </div>
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              <Package className="h-3.5 w-3.5" />
              {t("stockDailyMatrixColName")}
            </div>
            <p className={cn("mt-2 text-2xl font-semibold", ADMIN_NUMERIC_CN)}>{summary.itemCount.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{summary.columnCount} cols · {summary.periodDays}d</p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ArrowUpFromLine className="h-3.5 w-3.5 text-sky-600" />
              {t("stockDailyMatrixTotalOut")}
            </div>
            <p className={cn("mt-2 text-2xl font-semibold text-sky-700 dark:text-sky-300", ADMIN_NUMERIC_CN)}>
              {formatNum(summary.totalOut)}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {t("stockDailyMatrixInvoicesTitle")}
            </div>
            <p className={cn("mt-2 text-2xl font-semibold", ADMIN_NUMERIC_CN)}>{summary.invoiceCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{formatNum(summary.invoiceTotal)}</p>
          </div>
          <div className={cn("rounded-xl border p-4 shadow-sm", summary.lowStock > 0 && "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20")}>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              {t("stockDailyMatrixBelowMin")}
            </div>
            <p className={cn("mt-2 text-2xl font-semibold", ADMIN_NUMERIC_CN)}>{summary.lowStock}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 sm:p-5 space-y-4 shadow-sm print:hidden">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className={ADMIN_BTN_XS_CN} onClick={() => applyPreset("month")}>
            {t("stockDailyMatrixPresetMonth")}
          </Button>
          <Button size="sm" variant="outline" className={ADMIN_BTN_XS_CN} onClick={() => applyPreset("lastMonth")}>
            {t("stockDailyMatrixPresetLastMonth")}
          </Button>
          <Button size="sm" variant="outline" className={ADMIN_BTN_XS_CN} onClick={() => applyPreset("7d")}>
            {t("stockDailyMatrixPreset7d")}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className={filterFieldCn}>
            <label className={filterLabelCn}>{t("stockDailyMatrixStart")}</label>
            <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="h-9 w-[148px]" />
          </div>
          <div className={filterFieldCn}>
            <label className={filterLabelCn}>{t("stockDailyMatrixEnd")}</label>
            <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="h-9 w-[148px]" />
          </div>
          <div className={cn(filterFieldCn, "min-w-[160px]")}>
            <label className={filterLabelCn}>{t("stockDailyMatrixWarehouse")}</label>
            <Select value={warehouseKey} onValueChange={setWarehouseKey}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {warehouseOptions.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={cn(filterFieldCn, "min-w-[160px]")}>
            <label className={filterLabelCn}>{t("stockDailyMatrixStoreFilter")}</label>
            <Select value={storeFilter || "__all__"} onValueChange={(v) => setStoreFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("stockDailyMatrixStoreAll")}</SelectItem>
                {storeTargets.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={cn(filterFieldCn, "min-w-[140px]")}>
            <label className={filterLabelCn}>{t("stockDailyMatrixCategory")}</label>
            <Select value={categoryFilter || "__all__"} onValueChange={(v) => setCategoryFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("stockDailyMatrixCategoryAll")}</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={cn(filterFieldCn, "min-w-[140px]")}>
            <label className={filterLabelCn}>{t("stockDailyMatrixViewMode")}</label>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as MatrixViewMode)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="detail">{t("stockDailyMatrixViewDetail")}</SelectItem>
                <SelectItem value="daily_total">{t("stockDailyMatrixViewDaily")}</SelectItem>
                <SelectItem value="store_pivot">{t("stockDailyMatrixViewStore")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className={cn(ADMIN_BTN_XS_CN, "h-9")} onClick={() => void fetchData()} disabled={loading}>
            <Search className="h-3.5 w-3.5" />
            {loading ? t("loading") : t("stockDailyMatrixBtnLoad")}
          </Button>
          <Button size="sm" variant="outline" className={cn(ADMIN_BTN_XS_CN, "h-9")} onClick={handleExportXlsx} disabled={!filteredItems.length}>
            <Download className="h-3.5 w-3.5" />
            {t("stockDailyMatrixExportXlsx")}
          </Button>
          <Button size="sm" variant="outline" className={cn(ADMIN_BTN_XS_CN, "h-9")} onClick={() => window.print()} disabled={!filteredItems.length}>
            <Printer className="h-3.5 w-3.5" />
            {t("stockDailyMatrixPrint")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={belowMinOnly} onCheckedChange={(c) => setBelowMinOnly(Boolean(c))} />
            {t("stockDailyMatrixFilterBelowMin")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={outboundOnly} onCheckedChange={(c) => setOutboundOnly(Boolean(c))} />
            {t("stockDailyMatrixFilterOutboundOnly")}
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={useThaiDate} onCheckedChange={(c) => setUseThaiDate(Boolean(c))} />
            {t("stockDailyMatrixThaiDate")}
          </label>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-9 bg-muted/30" placeholder={t("stockHistSearchPh")} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive px-1 print:hidden">{error}</p>}
      {data?.hitRowCap && <p className={ADMIN_PANEL_WARNING_CN}>{t("stockDailyMatrixHitCap")}</p>}

      {loading && !data?.items?.length && (
        <div className="rounded-xl border bg-card py-20 text-center text-sm text-muted-foreground">{t("loading")}</div>
      )}

      {!loading && data && filteredItems.length === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/20 py-16 text-center print:hidden">
          <p className="text-sm text-muted-foreground">{t("stockDailyMatrixNoData")}</p>
        </div>
      )}

      {isMobile && filteredItems.length > 0 && (
        <div className="space-y-3 print:hidden">
          <h3 className="text-sm font-semibold">{t("stockDailyMatrixMobileTitle")}</h3>
          {filteredItems.map((row) => (
            <div key={row.code} className="rounded-xl border bg-card p-4 space-y-2 shadow-sm">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
                  <p className="font-medium">{row.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t("stockDailyMatrixBalance")}</p>
                  <p className={cn("text-lg font-semibold text-primary", ADMIN_NUMERIC_CN)}>{formatNum(row.balance)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                <span>IN {formatNum(row.totalIn)}</span>
                <span>OUT {formatNum(row.totalOut)}</span>
                {row.outChangePct != null && <span>{row.outChangePct}%</span>}
              </div>
              <MiniSparkline values={row.sparkline} />
            </div>
          ))}
        </div>
      )}

      {!isMobile && filteredItems.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground print:hidden">
            {filteredItems.length} items · {t("stockDailyMatrixScrollHint")}
          </div>
          <div className={cn(ADMIN_TABLE_SCROLL_CN, "max-h-[min(72vh,760px)]")}>
            <table className="w-full text-[12px] border-collapse min-w-[960px]">
              <thead className="sticky top-0 z-20">
                <tr className="border-b">
                  <th className="sticky left-0 z-30 bg-muted/95 px-3 py-2.5 text-left font-semibold border-r min-w-[80px]">{t("stockDailyMatrixColCode")}</th>
                  <th className="sticky left-[80px] z-30 bg-muted/95 px-3 py-2.5 text-left font-semibold border-r min-w-[140px]">{t("stockDailyMatrixColName")}</th>
                  <th className="bg-muted/95 px-2 py-2.5 text-center font-medium min-w-[72px]">{t("stockDailyMatrixSparkline")}</th>
                  {columns.map((c) => {
                    const styles = columnKindStyles(c.kind)
                    return (
                      <th key={c.key} className={cn("px-1.5 py-2 text-center font-semibold min-w-[72px] border-l", styles.header)} title={c.label}>
                        <span className="block text-[10px] opacity-80">{formatYmdShort(c.ymd, useThaiDate)}</span>
                        <span className="block truncate text-[11px]">{c.kind === "out" ? c.store || c.label : c.label}</span>
                      </th>
                    )
                  })}
                  <th className="bg-violet-500/10 px-2 py-2.5 text-right font-semibold border-l-2 min-w-[64px]">{t("stockDailyMatrixBeginning")}</th>
                  <th className="bg-primary/10 px-2 py-2.5 text-right font-bold text-primary min-w-[72px]">{t("stockDailyMatrixBalance")}</th>
                  <th className="bg-muted/80 px-2 py-2.5 text-right min-w-[56px]">{t("stockDailyMatrixMinQty")}</th>
                  <th className="bg-emerald-500/8 px-2 py-2.5 text-right text-emerald-800 min-w-[64px]">{t("stockDailyMatrixTotalIn")}</th>
                  <th className="bg-sky-500/8 px-2 py-2.5 text-right text-sky-800 min-w-[64px]">{t("stockDailyMatrixTotalOut")}</th>
                  <th className="bg-muted/60 px-2 py-2.5 text-right min-w-[56px]">{t("stockDailyMatrixPriorOut")}</th>
                  <th className="bg-muted/60 px-2 py-2.5 text-right min-w-[56px]">{t("stockDailyMatrixOutChange")}</th>
                  <th className="bg-muted/60 px-2 py-2.5 text-right min-w-[56px]">{t("stockDailyMatrixAvgDay")}</th>
                  <th className="bg-muted/80 px-2 py-2.5 text-right min-w-[72px]">{t("stockDailyMatrixCostGoods")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row, rowIdx) => {
                  const belowMin = row.minQty > 0 && row.balance < row.minQty
                  return (
                    <tr key={row.code} className={cn("border-b hover:bg-muted/40", rowIdx % 2 === 1 && "bg-muted/[0.12]")}>
                      <td className="sticky left-0 z-10 bg-card px-3 py-2 font-mono text-[11px] border-r">{row.code}</td>
                      <td className="sticky left-[80px] z-10 bg-card px-3 py-2 font-medium truncate max-w-[200px] border-r" title={row.name}>{row.name}</td>
                      <td className="px-2 py-2"><MiniSparkline values={row.sparkline} /></td>
                      {columns.map((c) => {
                        const v = row.cells[c.key]
                        const styles = columnKindStyles(c.kind)
                        const drillYmd = c.ymd
                        const drillStore = c.store
                        const cellInner = v ? formatNum(v) : "—"
                        return (
                          <td key={c.key} className={cn("px-1.5 py-2 text-center border-l", styles.cell, v ? styles.cellActive : "text-muted-foreground/35")}>
                            {v && c.kind === "out" && drillYmd ? (
                              <Link href={buildDrillHref(drillYmd, drillStore)} className="hover:underline" title={t("stockDailyMatrixDrillOutbound")}>
                                <span className={ADMIN_NUMERIC_CN}>{cellInner}</span>
                              </Link>
                            ) : (
                              <span className={ADMIN_NUMERIC_CN}>{cellInner}</span>
                            )}
                          </td>
                        )
                      })}
                      <td className={cn("px-2 py-2 text-right border-l-2", ADMIN_NUMERIC_CN)}>{formatNum(row.beginning)}</td>
                      <td className={cn("px-2 py-2 text-right font-semibold text-primary", belowMin && "text-amber-700", ADMIN_NUMERIC_CN)}>{formatNum(row.balance)}</td>
                      <td className={cn("px-2 py-2 text-right", ADMIN_NUMERIC_CN)}>{formatNum(row.minQty)}</td>
                      <td className={cn("px-2 py-2 text-right text-emerald-700", ADMIN_NUMERIC_CN)}>{formatNum(row.totalIn)}</td>
                      <td className={cn("px-2 py-2 text-right text-sky-700", ADMIN_NUMERIC_CN)}>{formatNum(row.totalOut)}</td>
                      <td className={cn("px-2 py-2 text-right", ADMIN_NUMERIC_CN)}>{formatNum(row.priorTotalOut)}</td>
                      <td className={cn("px-2 py-2 text-right", ADMIN_NUMERIC_CN)}>
                        {row.outChangePct != null ? `${row.outChangePct}%` : "—"}
                      </td>
                      <td className={cn("px-2 py-2 text-right", ADMIN_NUMERIC_CN)}>{formatNum(row.avgOutPerDay)}</td>
                      <td className={cn("px-2 py-2 text-right", ADMIN_NUMERIC_CN)}>{formatNum(row.costOfGoods)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.dayInvoices.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden print:hidden">
          <div className="border-b bg-muted/30 px-4 py-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{t("stockDailyMatrixInvoicesTitle")}</h3>
            <Badge variant="secondary" className="text-[10px]">{data.dayInvoices.length}</Badge>
          </div>
          <AdminTableScroll hint={false}>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="py-2.5 px-4 text-left">{t("stockHistColDate")}</th>
                  <th className="py-2.5 px-3 text-left">{t("stockHistColStore")}</th>
                  <th className="py-2.5 px-3 text-left">{t("stockDailyMatrixInvoiceNo")}</th>
                  <th className="py-2.5 px-3 text-right">{t("stockDailyMatrixSubtotal")}</th>
                  <th className="py-2.5 px-3 text-right">{t("stockDailyMatrixVat")}</th>
                  <th className="py-2.5 px-3 text-right">{t("stockDailyMatrixGrandTotal")}</th>
                  <th className="py-2.5 px-4 text-right">{t("stockDailyMatrixInvoicePrint")}</th>
                </tr>
              </thead>
              <tbody>
                {data.dayInvoices.map((inv, idx) => {
                  const key = inv.invoiceNo || `${inv.ymd}-${inv.store}`
                  return (
                    <tr key={key} className={cn("border-b hover:bg-muted/30", idx % 2 === 1 && "bg-muted/[0.12]")}>
                      <td className="py-2.5 px-4">{formatYmdShort(inv.ymd, useThaiDate) || inv.ymd}</td>
                      <td className="py-2.5 px-3 font-medium">{inv.store}</td>
                      <td className="py-2.5 px-3">
                        <Link href={buildDrillHref(inv.ymd, inv.store)} className="font-mono text-[11px] text-primary hover:underline">
                          {inv.invoiceNo || "—"}
                        </Link>
                      </td>
                      <td className={cn("py-2.5 px-3 text-right", ADMIN_NUMERIC_CN)}>{formatNum(inv.subtotal)}</td>
                      <td className={cn("py-2.5 px-3 text-right", ADMIN_NUMERIC_CN)}>{formatNum(inv.vat)}</td>
                      <td className={cn("py-2.5 px-3 text-right font-semibold", ADMIN_NUMERIC_CN)}>{formatNum(inv.grandTotal)}</td>
                      <td className="py-2.5 px-4 text-right">
                        <Button size="sm" variant="outline" className={ADMIN_BTN_XS_CN} disabled={invoicePrinting === key} onClick={() => void handleInvoicePrint(inv)}>
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </AdminTableScroll>
        </div>
      )}
    </div>
  )
}
