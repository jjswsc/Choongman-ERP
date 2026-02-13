"use client"

import * as React from "react"
import { Search } from "lucide-react"
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

export function StockAdjustmentHistory() {
  const { lang } = useLang()
  const t = useT(lang)
  const [stores, setStores] = React.useState<string[]>([])
  const [list, setList] = React.useState<AdjustmentHistoryItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startStr, setStartStr] = React.useState("")
  const [endStr, setEndStr] = React.useState("")
  const [storeFilter, setStoreFilter] = React.useState("")

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setStartStr(today)
    setEndStr(today)
  }, [])

  React.useEffect(() => {
    getStockStores().then((s) => setStores(s || []))
  }, [])

  const handleSearch = async () => {
    const start = startStr || new Date().toISOString().slice(0, 10)
    const end = endStr || start
    setLoading(true)
    try {
      const data = await getAdjustmentHistory({
        startStr: start,
        endStr: end,
        storeFilter: storeFilter || undefined,
      })
      setList(Array.isArray(data) ? data : [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <h3 className="text-sm font-bold text-card-foreground">{t("stockHistTitle")}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-6 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold whitespace-nowrap">{t("stockHistStart")}</label>
          <Input
            type="date"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold whitespace-nowrap">{t("stockHistEnd")}</label>
          <Input
            type="date"
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
            className="h-9 w-36 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold whitespace-nowrap">{t("stockHistStore")}</label>
          <Select value={storeFilter || "all"} onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("stockHistStoreAll")}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={handleSearch}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("stockHistBtnSearch")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-28 min-w-[100px] whitespace-nowrap">{t("stockHistColDate")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-40 min-w-[100px]">{t("stockHistColStore")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-28 max-w-[100px]">{t("stockHistColItem")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-16">{t("stockHistColSpec")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-right">{t("stockHistColDiff")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-64 min-w-[120px] text-center">{t("stockHistColReason")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("loading")}
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("stockHistNoData")}
                </td>
              </tr>
            ) : (
              list.map((row, idx) => (
                <tr
                  key={`${row.date}-${row.store}-${row.item}-${idx}`}
                  className={`border-b last:border-b-0 ${idx % 2 === 1 ? "bg-muted/5" : ""}`}
                >
                  <td className="px-5 py-3 text-xs whitespace-nowrap">{row.date}</td>
                  <td className="px-5 py-3 text-xs font-medium w-40">{row.store}</td>
                  <td className="px-5 py-3 text-xs max-w-[100px] truncate" title={row.item}>{row.item}</td>
                  <td className="px-5 py-3 text-[11px] text-muted-foreground">{row.spec}</td>
                  <td className={cn(
                    "px-5 py-3 text-right font-semibold tabular-nums",
                    row.diff > 0 ? "text-primary" : "text-destructive"
                  )}>
                    {row.diff > 0 ? "+" : ""}{row.diff}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground text-center w-64 min-w-[120px]">{row.reason || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
