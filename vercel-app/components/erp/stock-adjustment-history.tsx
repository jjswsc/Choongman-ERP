"use client"

import * as React from "react"
import { Search, History, Package } from "lucide-react"
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
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import {
  getAdjustmentHistory,
  getAppData,
  getMyUsageHistory,
  getStockStores,
  type AdjustmentHistoryItem,
  type UsageHistoryItem,
} from "@/lib/api-client"
import { AdminFilterBar, AdminFilterField } from "@/components/erp/admin-filter-bar"
import {
  collectCategoryOptions,
  filterStockHistoryRows,
  filterStockListRows,
  type StockViewKind,
} from "@/lib/stock-history-filter"

interface StockListRow {
  code: string
  name: string
  spec: string
  category: string
  qty: number
  safeQty: number
}

interface StockAdjustmentHistoryProps {
  isManager?: boolean
  userStore?: string
}

function viewTitleKey(kind: StockViewKind): "useHistory" | "stockTabHistory" | "stockTabList" {
  if (kind === "usage") return "useHistory"
  if (kind === "list") return "stockTabList"
  return "stockTabHistory"
}

export function StockAdjustmentHistory({ isManager = false, userStore = "" }: StockAdjustmentHistoryProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [stores, setStores] = React.useState<string[]>([])
  const [adjustList, setAdjustList] = React.useState<AdjustmentHistoryItem[]>([])
  const [usageList, setUsageList] = React.useState<UsageHistoryItem[]>([])
  const [stockList, setStockList] = React.useState<StockListRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startStr, setStartStr] = React.useState(() => getBangkokTodayDateString())
  const [endStr, setEndStr] = React.useState(() => getBangkokTodayDateString())
  const [storeFilter, setStoreFilter] = React.useState("")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("")
  const [viewKind, setViewKind] = React.useState<StockViewKind>("adjustment")

  const storesForFilter = React.useMemo(() => {
    if (isManager && userStore) return [userStore]
    return stores
  }, [isManager, userStore, stores])

  const effectiveStore = isManager && userStore ? userStore : storeFilter

  const activeHistoryRows = viewKind === "usage" ? usageList : adjustList

  const categoryOptions = React.useMemo(() => {
    if (viewKind === "list") {
      return collectCategoryOptions(
        stockList.map((r) => ({ item: r.name, itemCode: r.code, category: r.category }))
      )
    }
    return collectCategoryOptions(activeHistoryRows)
  }, [viewKind, stockList, activeHistoryRows])

  const filteredAdjustList = React.useMemo(
    () => filterStockHistoryRows(adjustList, categoryFilter, searchTerm),
    [adjustList, categoryFilter, searchTerm]
  )

  const filteredUsageList = React.useMemo(
    () => filterStockHistoryRows(usageList, categoryFilter, searchTerm),
    [usageList, categoryFilter, searchTerm]
  )

  const filteredStockList = React.useMemo(
    () => filterStockListRows(stockList, categoryFilter, searchTerm),
    [stockList, categoryFilter, searchTerm]
  )

  const filteredCount =
    viewKind === "usage"
      ? filteredUsageList.length
      : viewKind === "list"
        ? filteredStockList.length
        : filteredAdjustList.length

  const rawCount =
    viewKind === "usage" ? usageList.length : viewKind === "list" ? stockList.length : adjustList.length

  React.useEffect(() => {
    getStockStores().then((s) => setStores(s || []))
  }, [])

  React.useEffect(() => {
    if (isManager && userStore) {
      setStoreFilter(userStore)
    }
  }, [isManager, userStore])

  const handleSearch = async () => {
    const start = startStr || getBangkokTodayDateString()
    const end = endStr || start
    const storeForApi = effectiveStore || undefined

    if ((viewKind === "usage" || viewKind === "list") && !storeForApi) {
      if (viewKind === "usage") setUsageList([])
      else setStockList([])
      return
    }

    setLoading(true)
    try {
      if (viewKind === "usage") {
        const data = await getMyUsageHistory({
          store: storeForApi!,
          startStr: start,
          endStr: end,
        })
        setUsageList(Array.isArray(data) ? data : [])
      } else if (viewKind === "list") {
        const { items, stock } = await getAppData(storeForApi!, start)
        const mapped: StockListRow[] = items.map((i) => ({
          code: i.code,
          name: i.name,
          spec: i.spec,
          category: i.category || "",
          qty: stock[i.code] ?? 0,
          safeQty: i.safeQty ?? 0,
        }))
        setStockList(mapped)
      } else {
        const data = await getAdjustmentHistory({
          startStr: start,
          endStr: end,
          storeFilter: storeForApi,
        })
        setAdjustList(Array.isArray(data) ? data : [])
      }
    } catch {
      if (viewKind === "usage") setUsageList([])
      else if (viewKind === "list") setStockList([])
      else setAdjustList([])
    } finally {
      setLoading(false)
    }
  }

  const storeRequired =
    (viewKind === "usage" && !effectiveStore) || (viewKind === "list" && !effectiveStore)

  const storeRequiredMessage =
    viewKind === "list" ? t("stockHistListStoreRequired") : t("stockHistUsageStoreRequired")

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-bold text-card-foreground">{t(viewTitleKey(viewKind))}</h3>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {filteredCount} {t("stockCountUnit")}
        </span>
      </div>

      <div className="border-b border-border bg-muted/20 px-4 py-3">
        <AdminFilterBar className="border-0 bg-transparent p-0 items-end">
          <AdminFilterField label={t("stockHistFilterUsageCat")}>
            <Select
              value={viewKind === "usage" ? "usage" : undefined}
              onValueChange={() => setViewKind("usage")}
            >
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usage">{t("useHistory")}</SelectItem>
              </SelectContent>
            </Select>
          </AdminFilterField>
          <AdminFilterField label={t("stockHistFilterStockStatus")}>
            <Select
              value={viewKind === "list" ? "list" : viewKind === "adjustment" ? "adjustment" : undefined}
              onValueChange={(v) => setViewKind(v as "list" | "adjustment")}
            >
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="list">{t("stockTabList")}</SelectItem>
                <SelectItem value="adjustment">{t("stockTabHistory")}</SelectItem>
              </SelectContent>
            </Select>
          </AdminFilterField>
          {categoryOptions.length > 0 && (
            <AdminFilterField label={t("itemsCategory")}>
              <Select
                value={categoryFilter || "__all__"}
                onValueChange={(v) => setCategoryFilter(v === "__all__" ? "" : v)}
              >
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("itemsCategoryAll")}</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AdminFilterField>
          )}
          {viewKind === "list" ? (
            <AdminFilterField label={t("stockFilterDate")}>
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-9 w-[140px] text-xs"
                aria-label={t("stockFilterDate")}
              />
            </AdminFilterField>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="h-9 w-[140px] text-xs"
                aria-label={t("stockHistStart")}
              />
              <span className="text-muted-foreground text-sm">~</span>
              <Input
                type="date"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="h-9 w-[140px] text-xs"
                aria-label={t("stockHistEnd")}
              />
            </div>
          )}
          <AdminFilterField label={t("stockHistStore")}>
            <Select
              value={storeFilter || "all"}
              onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)}
              disabled={isManager && !!userStore}
            >
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue placeholder={t("stockHistStore")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("stockHistStoreAll")}</SelectItem>
                {storesForFilter.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterField>
          <AdminFilterField label={t("search")}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("stockHistSearchPh")}
                className="h-9 w-44 pl-8 text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
          </AdminFilterField>
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={handleSearch} disabled={loading}>
            <Search className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
            {loading ? t("loading") : t("stockHistBtnSearch")}
          </Button>
        </AdminFilterBar>
      </div>

      <div className="overflow-x-auto">
        {storeRequired ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">{storeRequiredMessage}</div>
        ) : viewKind === "list" ? (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">
                  {t("stockColCode")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground min-w-[100px] text-center">
                  {t("stockColName")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-28 text-center">
                  {t("stockColSpec")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">
                  {t("stockColQty")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">
                  {t("stockColSafeQty")}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">
                  {t("stockColStatus")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {t("loading")}
                  </td>
                </tr>
              ) : filteredStockList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-10 w-10 opacity-50" />
                      <p>{rawCount === 0 ? t("stockHistNoData") : t("stockHistNoMatch")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStockList.map((row) => {
                  const isLow = row.safeQty > 0 && row.qty < row.safeQty
                  return (
                    <tr key={row.code} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                      <td className="px-4 py-3 text-xs font-medium tabular-nums">{row.code}</td>
                      <td className="px-4 py-3 text-xs min-w-[100px] truncate" title={row.name}>
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">{row.spec}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">{row.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {row.safeQty > 0 ? row.safeQty : "-"}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-center text-xs font-semibold",
                          isLow ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {isLow ? t("stockLow") : "-"}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-28 min-w-[90px] whitespace-nowrap text-center">
                  {t("stockHistColDate")}
                </th>
                {viewKind === "adjustment" && (
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground min-w-[145px] text-center">
                    {t("stockHistColStore")}
                  </th>
                )}
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground min-w-[100px] text-center">
                  {t("stockHistColItem")}
                </th>
                {viewKind === "adjustment" && (
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-14 text-center">
                    {t("stockHistColSpec")}
                  </th>
                )}
                <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">
                  {viewKind === "usage" ? t("stockHistColQty") : t("stockHistColDiff")}
                </th>
                {viewKind === "usage" ? (
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-40 min-w-[100px] text-center">
                    {t("stockHistColUser")}
                  </th>
                ) : (
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-64 min-w-[120px] text-center">
                    {t("stockHistColReason")}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={viewKind === "usage" ? 4 : 6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {t("loading")}
                  </td>
                </tr>
              ) : (viewKind === "usage" ? filteredUsageList : filteredAdjustList).length === 0 ? (
                <tr>
                  <td colSpan={viewKind === "usage" ? 4 : 6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <History className="h-10 w-10 opacity-50" />
                      <p>{rawCount === 0 ? t("stockHistNoData") : t("stockHistNoMatch")}</p>
                      {rawCount > 0 && (
                        <p className="text-xs opacity-80">{t("stockHistNoMatchHint")}</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : viewKind === "usage" ? (
                filteredUsageList.map((row, idx) => (
                  <tr
                    key={`${row.dateTime}-${row.item}-${idx}`}
                    className={cn("border-b border-border last:border-b-0 hover:bg-muted/20", idx % 2 === 1 && "bg-muted/5")}
                  >
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{row.dateTime}</td>
                    <td className="px-4 py-3 text-xs min-w-[100px] truncate" title={row.item}>
                      {row.item}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-destructive">
                      -{row.qty}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground text-center">
                      {row.userNick || row.userName || "-"}
                    </td>
                  </tr>
                ))
              ) : (
                filteredAdjustList.map((row, idx) => (
                  <tr
                    key={`${row.date}-${row.store}-${row.item}-${idx}`}
                    className={cn("border-b border-border last:border-b-0 hover:bg-muted/20", idx % 2 === 1 && "bg-muted/5")}
                  >
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-3 text-xs font-medium min-w-[145px]" title={row.store}>
                      {row.store}
                    </td>
                    <td className="px-4 py-3 text-xs min-w-[100px] truncate" title={row.item}>
                      {row.item}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground w-36 min-w-[7rem]">{row.spec}</td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-semibold tabular-nums",
                        row.diff > 0 ? "text-primary" : "text-destructive"
                      )}
                    >
                      {row.diff > 0 ? "+" : ""}
                      {row.diff}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground text-center w-64 min-w-[120px]">
                      {row.reason || "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
