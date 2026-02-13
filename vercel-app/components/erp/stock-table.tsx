"use client"

import * as React from "react"
import {
  Search,
  BarChart3,
  Package,
  Edit3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
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
import type { StockStatusItem } from "@/lib/api-client"

export interface StockTableProps {
  list: StockStatusItem[]
  stores: string[]
  loading: boolean
  storeFilter: string
  setStoreFilter: (v: string) => void
  searchTerm: string
  setSearchTerm: (v: string) => void
  onSearch: () => void
  canAdjust: boolean
  onAdjust: (item: StockStatusItem) => void
}

export function StockTable({
  list,
  stores,
  loading,
  storeFilter,
  setStoreFilter,
  searchTerm,
  setSearchTerm,
  onSearch,
  canAdjust,
  onAdjust,
}: StockTableProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const filteredList = React.useMemo(() => {
    if (!searchTerm.trim()) return list
    const q = searchTerm.toLowerCase()
    return list.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q)
    )
  }, [list, searchTerm])

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <BarChart3 className="h-[18px] w-[18px] text-warning" />
        </div>
        <h3 className="text-sm font-bold text-card-foreground">{t("stockListTitle")}</h3>
        <span className="ml-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {filteredList.length} {t("stockCountUnit")}
        </span>
      </div>

      <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-3">
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Package className="h-3.5 w-3.5 text-primary" />
            {t("stockFilterStore")}
          </label>
            <Select value={storeFilter || "all"} onValueChange={(v) => setStoreFilter(v === "all" ? "" : v)}>
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
              {stores.length === 0 && (
                <SelectItem value="none" disabled>
                  {t("stockNoStores") || "-"}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("stockSearchPh")}
            className="h-9 pl-9 text-xs"
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
        </div>
        <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={onSearch}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("stockBtnSearch")}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20">{t("stockColCode")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground min-w-[140px]">{t("stockColName")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20">{t("stockColSpec")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-right">{t("stockColQty")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-right">{t("stockColSafeQty")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("stockColStatus")}</th>
              {canAdjust && (
                <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24 text-center">{t("stockColAction")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={canAdjust ? 7 : 6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("loading")}
                </td>
              </tr>
            ) : filteredList.length === 0 ? (
              <tr>
                <td colSpan={canAdjust ? 7 : 6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("stockNoData")}
                </td>
              </tr>
            ) : (
              filteredList.map((row, idx) => {
                const isLow = row.safeQty > 0 && row.qty < row.safeQty
                return (
                  <tr
                    key={`${row.store}-${row.code}`}
                    className={cn(
                      "border-b last:border-b-0 transition-colors hover:bg-muted/20",
                      idx % 2 === 1 && "bg-muted/5"
                    )}
                  >
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                        {row.code}
                      </span>
                    </td>
                    <td className="px-5 py-3 min-w-[140px]">
                      <span className="text-sm font-medium text-foreground">{row.name}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[11px] text-muted-foreground">{row.spec}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        row.qty < 0 ? "text-destructive" : "text-foreground"
                      )}>
                        {row.qty.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs text-muted-foreground">
                        {row.safeQty > 0 ? row.safeQty.toLocaleString() : "-"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          {t("stockLow")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </td>
                    {canAdjust && (
                      <td className="px-5 py-3">
                        <div className="flex justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-[10px] font-semibold"
                            onClick={() => onAdjust(row)}
                          >
                            <Edit3 className="mr-1 h-2.5 w-2.5" />
                            {t("stockBtnAdjust")}
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t bg-muted/10 px-6 py-3">
        <span className="text-[11px] text-muted-foreground">
          {t("stockTotal")} <span className="font-bold text-foreground">{filteredList.length}</span> {t("stockCountUnit")}
        </span>
      </div>
    </div>
  )
}
