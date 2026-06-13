"use client"

import * as React from "react"
import { Search, Calendar, History } from "lucide-react"
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
import { getAdjustmentHistory, getStockStores, type AdjustmentHistoryItem } from "@/lib/api-client"

interface StockAdjustmentHistoryProps {
  isManager?: boolean
  userStore?: string
}

export function StockAdjustmentHistory({ isManager = false, userStore = "" }: StockAdjustmentHistoryProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [stores, setStores] = React.useState<string[]>([])
  const [list, setList] = React.useState<AdjustmentHistoryItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startStr, setStartStr] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [endStr, setEndStr] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [storeFilter, setStoreFilter] = React.useState("")
  const [searchTerm, setSearchTerm] = React.useState("")

  const storesForFilter = React.useMemo(() => {
    if (isManager && userStore) return [userStore]
    return stores
  }, [isManager, userStore, stores])

  const filteredList = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return list
    return list.filter((row) => (row.item || "").toLowerCase().includes(term))
  }, [list, searchTerm])

  React.useEffect(() => {
    getStockStores().then((s) => setStores(s || []))
  }, [])

  React.useEffect(() => {
    if (isManager && userStore) {
      setStoreFilter(userStore)
    }
  }, [isManager, userStore])

  const handleSearch = async () => {
    const start = startStr || new Date().toISOString().slice(0, 10)
    const end = endStr || start
    const effectiveStore = isManager && userStore ? userStore : (storeFilter || undefined)
    setLoading(true)
    try {
      const data = await getAdjustmentHistory({
        startStr: start,
        endStr: end,
        storeFilter: effectiveStore,
      })
      setList(Array.isArray(data) ? data : [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <h3 className="text-sm font-bold text-card-foreground">{t("stockHistTitle")}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div className="relative flex-1 min-w-[160px] max-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("stockHistSearchPh")}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            className="h-9 w-[140px] text-sm"
            aria-label={t("stockHistStart")}
          />
          <span className="text-muted-foreground text-sm">~</span>
          <Input
            type="date"
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
            className="h-9 w-[140px] text-sm"
            aria-label={t("stockHistEnd")}
          />
        </div>
        <Select value={storeFilter || "all"} onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)} disabled={isManager && !!userStore}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder={t("stockHistStore")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("stockHistStoreAll")}</SelectItem>
            {storesForFilter.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 gap-1.5" onClick={handleSearch} disabled={loading}>
          <Search className={cn("h-3.5 w-3.5", loading && "animate-pulse")} />
          {loading ? t("loading") : t("stockHistBtnSearch")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-28 min-w-[90px] whitespace-nowrap text-center">{t("stockHistColDate")}</th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground min-w-[145px] text-center">{t("stockHistColStore")}</th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground min-w-[100px] text-center">{t("stockHistColItem")}</th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-14 text-center">{t("stockHistColSpec")}</th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("stockHistColDiff")}</th>
              <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground w-64 min-w-[120px] text-center">{t("stockHistColReason")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {t("loading")}
                </td>
              </tr>
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <History className="h-10 w-10 opacity-50" />
                    <p>{list.length === 0 ? t("stockHistNoData") : t("stockHistNoMatch")}</p>
                    {list.length > 0 && (
                      <p className="text-xs opacity-80">{t("stockHistNoMatchHint")}</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredList.map((row, idx) => (
                <tr
                  key={`${row.date}-${row.store}-${row.item}-${idx}`}
                  className={cn("border-b border-border last:border-b-0 hover:bg-muted/20", idx % 2 === 1 && "bg-muted/5")}
                >
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{row.date}</td>
                  <td className="px-4 py-3 text-xs font-medium min-w-[145px]" title={row.store}>{row.store}</td>
                  <td className="px-4 py-3 text-xs min-w-[100px] truncate" title={row.item}>{row.item}</td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground w-36 min-w-[7rem]">{row.spec}</td>
                  <td className={cn(
                    "px-4 py-3 text-right font-semibold tabular-nums",
                    row.diff > 0 ? "text-primary" : "text-destructive"
                  )}>
                    {row.diff > 0 ? "+" : ""}{row.diff}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground text-center w-64 min-w-[120px]">{row.reason || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
