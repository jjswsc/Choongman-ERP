"use client"

import * as React from "react"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import Link from "next/link"
import { ClipboardList, ExternalLink, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { getAppData, getItemCategories, getStockUsageAggregate, type AppItem } from "@/lib/api-client"
import { isManagerRole } from "@/lib/permissions"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import { LogisticsEmptyState, LogisticsTableSkeleton } from "@/components/erp/logistics-ui"

export interface StockReorderAssistProps {
  stores: string[]
  storeFilter: string
  setStoreFilter: (v: string) => void
  storeSelectDisabled?: boolean
  stockDateFilter: string
  setStockDateFilter: (v: string) => void
  userRole: string
}

type Row = {
  code: string
  name: string
  spec: string
  category: string
  qty: number
  safeQty: number
  usage: number
  dailyAvg: number
  coverDays: number | null
  suggested: number
  orderDisabled: boolean
}

function formatNum(n: number, maxFrac = 2): string {
  if (!Number.isFinite(n)) return "0"
  return Number(n.toFixed(maxFrac)).toLocaleString()
}

export function StockReorderAssist({
  stores,
  storeFilter,
  setStoreFilter,
  storeSelectDisabled = false,
  stockDateFilter,
  setStockDateFilter,
  userRole,
}: StockReorderAssistProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(userRole)

  const [days, setDays] = React.useState(30)
  const [usageEndYmd, setUsageEndYmd] = React.useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
  )
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<Row[]>([])
  const [usageMeta, setUsageMeta] = React.useState<{
    startYmd: string
    endYmd: string
    nDays: number
    consumptionBasis: 'hq_outbound' | 'store_usage'
  } | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("")
  const [suggestOnly, setSuggestOnly] = React.useState(false)
  const [itemCategories, setItemCategories] = React.useState<string[]>([])

  React.useEffect(() => {
    let cancelled = false
    getItemCategories()
      .then((res) => {
        if (!cancelled && res.categories?.length) setItemCategories(res.categories)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const categoryOptions = React.useMemo(() => {
    const s = new Set<string>(itemCategories)
    for (const r of rows) {
      const c = (r.category || "").trim()
      if (c) s.add(c)
    }
    return Array.from(s).sort()
  }, [itemCategories, rows])

  const load = React.useCallback(async () => {
    const store = storeFilter.trim()
    if (!store) {
      setRows([])
      setUsageMeta(null)
      return
    }
    setLoading(true)
    try {
      const [app, usageRes] = await Promise.all([
        getAppData(store, stockDateFilter.trim() || undefined),
        getStockUsageAggregate({ storeName: store, days, endDate: usageEndYmd.trim() || undefined }),
      ])
      const items = (app.items || []) as AppItem[]
      const stock = app.stock || {}
      const usageByCode = usageRes.usageByCode || {}
      const nDays = usageRes.days || days

      const list: Row[] = []
      for (const i of items) {
        const code = String(i.code || "").trim()
        if (!code) continue
        const qty = Number(stock[code]) || 0
        const usage = Number(usageByCode[code]) || 0
        const safeQty = Number(i.safeQty) || 0
        const dailyAvg = nDays > 0 ? usage / nDays : 0
        const coverDays = dailyAvg > 1e-6 ? qty / dailyAvg : null
        const suggested = Math.max(0, Math.ceil(usage + safeQty - qty))
        list.push({
          code,
          name: String(i.name || ""),
          spec: String(i.spec || ""),
          category: String(i.category || ""),
          qty,
          safeQty,
          usage,
          dailyAvg,
          coverDays,
          suggested,
          orderDisabled: i.orderDisabled === true,
        })
      }
      list.sort((a, b) => b.suggested - a.suggested || a.code.localeCompare(b.code))
      setRows(list)
      if (usageRes.startYmd && usageRes.endYmd) {
        const consumptionBasis =
          usageRes.consumptionBasis === 'hq_outbound' ? 'hq_outbound' : 'store_usage'
        setUsageMeta({
          startYmd: usageRes.startYmd,
          endYmd: usageRes.endYmd,
          nDays,
          consumptionBasis,
        })
      } else {
        setUsageMeta(null)
      }
    } catch {
      setRows([])
      setUsageMeta(null)
    } finally {
      setLoading(false)
    }
  }, [storeFilter, stockDateFilter, days, usageEndYmd])

  const filtered = React.useMemo(() => {
    let result = rows
    if (suggestOnly) result = result.filter((r) => r.suggested > 0)
    if (categoryFilter && categoryFilter !== "__all__") {
      result = result.filter((r) => (r.category || "").trim() === categoryFilter)
    }
    const q = searchTerm.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
      )
    }
    return result
  }, [rows, suggestOnly, categoryFilter, searchTerm])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-start gap-2">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="leading-relaxed">{t("stockReorderIntro")}</p>
        </div>
      </div>

      <AdminFilterBar className="items-end">
        <AdminFilterField label={t("stockFilterStore")}>
          <Select
            value={storeFilter || "all"}
            onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)}
            disabled={storeSelectDisabled}
          >
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("stockFilterStoreAll")}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AdminFilterField>
        <AdminFilterField label={t("stockFilterDate")}>
          <Input
            type="date"
            value={stockDateFilter}
            onChange={(e) => setStockDateFilter(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </AdminFilterField>
        <AdminFilterField label={t("stockReorderDays")}>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-9 w-[5.25rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7</SelectItem>
              <SelectItem value="14">14</SelectItem>
              <SelectItem value="30">30</SelectItem>
              <SelectItem value="45">45</SelectItem>
              <SelectItem value="60">60</SelectItem>
              <SelectItem value="90">90</SelectItem>
              <SelectItem value="120">120</SelectItem>
              <SelectItem value="180">180</SelectItem>
            </SelectContent>
          </Select>
        </AdminFilterField>
        <AdminFilterField label={t("stockReorderEndDate")}>
          <Input
            type="date"
            value={usageEndYmd}
            onChange={(e) => setUsageEndYmd(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </AdminFilterField>
        <AdminFilterField label={t("itemsCategory")}>
          <Select value={categoryFilter || "__all__"} onValueChange={(v) => setCategoryFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-9 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("stockReorderFilterAll")}</SelectItem>
              {categoryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AdminFilterField>
        <Button size="sm" className="h-9 px-3 text-xs font-semibold" onClick={load} disabled={loading || !storeFilter.trim()}>
          <Search className="mr-1 h-3 w-3" />
          {t("stockReorderBtnLoad")}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {isManager ? (
            <Button variant="outline" size="sm" className="h-9 text-xs" asChild>
              <Link href="/admin/order-create">
                {t("stockReorderLinkOrderCreate")}
                <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-9 text-xs" asChild>
              <Link href="/admin/accounting/purchase-order">
                {t("stockReorderLinkPo")}
                <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </AdminFilterBar>

      {usageMeta ? (
        <div className="space-y-0.5 text-[11px] text-muted-foreground">
          <p>
            {t("stockReorderPeriodLabel")}: {usageMeta.startYmd} ~ {usageMeta.endYmd} ({usageMeta.nDays}
            {t("stockReorderDaysUnit")})
          </p>
          <p className="font-medium text-foreground/80">
            {usageMeta.consumptionBasis === 'hq_outbound'
              ? t("stockReorderBasisHqOutbound")
              : t("stockReorderBasisStoreUsage")}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="rounded border-input"
            checked={suggestOnly}
            onChange={(e) => setSuggestOnly(e.target.checked)}
          />
          {t("stockReorderFilterSuggest")}
        </label>
        <div className="relative flex flex-1 min-w-[10rem] items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("stockSearchPh")}
            className="h-9 max-w-xs pl-8 text-xs"
          />
        </div>
      </div>

      <AdminTableScroll className="rounded-lg border border-border/60" hint={false}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-center">{t("stockColCode")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground min-w-[7rem]">{t("stockColName")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-center">{t("stockReorderColCategory")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-right">{t("stockColQty")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-right">
                {usageMeta?.consumptionBasis === 'hq_outbound'
                  ? t("stockReorderColHqOutbound")
                  : t("stockReorderColUsage")}
              </th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-right">{t("stockReorderColDailyAvg")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-right">{t("stockReorderColCover")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-right">{t("stockColSafeQty")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-right">{t("stockReorderColSuggested")}</th>
              <th className="px-3 py-2.5 text-[11px] font-bold text-muted-foreground text-center">{t("stockColStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {!storeFilter.trim() ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <LogisticsEmptyState icon={ClipboardList} title={t("stockReorderNoStore")} className="border-0 bg-transparent py-10" />
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <LogisticsTableSkeleton rows={6} cols={5} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-0">
                  <LogisticsEmptyState icon={Search} title={t("stockNoData")} className="border-0 bg-transparent py-10" />
                </td>
              </tr>
            ) : (
              filtered.map((r, idx) => (
                <tr
                  key={r.code}
                  className={cn(
                    "border-b last:border-b-0 transition-colors hover:bg-muted/20",
                    idx % 2 === 1 && "bg-muted/5",
                    r.suggested > 0 && "bg-amber-500/5"
                  )}
                >
                  <td className="px-3 py-2.5 text-center">
                    <span className="inline-flex rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                      {r.code}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-sm font-medium text-foreground">{r.name}</div>
                    {r.spec ? <div className="text-[10px] text-muted-foreground">{r.spec}</div> : null}
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs text-muted-foreground">{r.category || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{r.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNum(r.usage, 2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatNum(r.dailyAvg, 2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.coverDays != null ? formatNum(r.coverDays, 1) : t("stockReorderCoverNA")}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.safeQty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={cn(
                        "tabular-nums font-bold",
                        r.suggested > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                      )}
                    >
                      {r.suggested.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-[11px]">
                    {r.orderDisabled ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{t("stockReorderOrderPaused")}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminTableScroll>
    </div>
  )
}
