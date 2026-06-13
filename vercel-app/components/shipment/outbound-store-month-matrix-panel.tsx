"use client"

import * as React from "react"
import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import {
  getOutboundStoreMonthMatrix,
  type OutboundStoreMonthAmountCell,
  type OutboundStoreMonthMatrixResult,
} from "@/lib/api-client"
import { cn } from "@/lib/utils"
function defaultMatrixYear(): number {
  return Number(getBangkokTodayDateString().slice(0, 4))
}

function formatAmount(n: number, lang: string): string {
  return `${n.toLocaleString()}${lang === "th" ? " THB" : ""}`
}

function AmountPair({
  cell,
  lang,
  className,
  onClick,
}: {
  cell: OutboundStoreMonthAmountCell
  lang: string
  className?: string
  onClick?: () => void
}) {
  if (!cell.subtotal && !cell.grandTotal) {
    return <span className={cn("text-muted-foreground/50 tabular-nums", className)}>—</span>
  }
  const inner = (
    <>
      <span className="block tabular-nums leading-tight">{formatAmount(cell.subtotal, lang)}</span>
      <span className="block text-[10px] text-muted-foreground tabular-nums leading-tight">
        ({formatAmount(cell.grandTotal, lang)})
      </span>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full text-right rounded px-1 py-0.5 hover:bg-primary/10 hover:text-primary transition-colors",
          className
        )}
      >
        {inner}
      </button>
    )
  }
  return <div className={cn("text-right", className)}>{inner}</div>
}

export type OutboundStoreMonthDrillParams = {
  store: string
  yearMonth: string
}

type OutboundStoreMonthMatrixPanelProps = {
  storeTargets: string[]
  onDrillToHistory: (params: OutboundStoreMonthDrillParams) => void
}

export function OutboundStoreMonthMatrixPanel({
  storeTargets,
  onDrillToHistory,
}: OutboundStoreMonthMatrixPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [year, setYear] = React.useState(defaultMatrixYear)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<OutboundStoreMonthMatrixResult | null>(null)
  const [error, setError] = React.useState("")

  const fetchMatrix = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const res = await getOutboundStoreMonthMatrix({
        year,
        storeFilter: storeFilter || undefined,
        knownStores: storeTargets,
      })
      setData(res)
    } catch (e) {
      setData(null)
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [year, storeFilter, storeTargets])

  React.useEffect(() => {
    void fetchMatrix()
  }, [fetchMatrix])

  const monthLabel = React.useCallback(
    (ym: string) => {
      const m = Number(ym.slice(5, 7))
      if (lang === "ko") return `${m}월`
      return ym.slice(5)
    },
    [lang]
  )

  const handleExcel = React.useCallback(() => {
    if (!data) return
    const sep = ","
    const esc = (v: string | number) => {
      const s = String(v)
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const headers = [
      t("orderColStore"),
      ...data.months.flatMap((m) => [
        `${monthLabel(m)} ${t("inColAmount")}`,
        `${monthLabel(m)} ${t("inv_total")}`,
      ]),
      `${t("outStoreMonthRowTotal")} ${t("inColAmount")}`,
      `${t("outStoreMonthRowTotal")} ${t("inv_total")}`,
    ]
    const lines: string[] = [headers.map(esc).join(sep)]
    for (const store of data.stores) {
      const row = data.cells[store] || {}
      const cols: (string | number)[] = [store]
      for (const m of data.months) {
        const c = row[m] || { subtotal: 0, grandTotal: 0, vat: 0 }
        cols.push(c.subtotal, c.grandTotal)
      }
      const rt = data.rowTotals[store] || { subtotal: 0, grandTotal: 0, vat: 0 }
      cols.push(rt.subtotal, rt.grandTotal)
      lines.push(cols.map(esc).join(sep))
    }
    const foot: (string | number)[] = [t("outStoreMonthColTotal")]
    for (const m of data.months) {
      const c = data.colTotals[m] || { subtotal: 0, grandTotal: 0, vat: 0 }
      foot.push(c.subtotal, c.grandTotal)
    }
    foot.push(data.grandTotal.subtotal, data.grandTotal.grandTotal)
    lines.push(foot.map(esc).join(sep))
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `outbound_store_month_${data.year}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [data, monthLabel, t])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground">{t("outStoreMonthHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {t("outStoreMonthYear")}
          </label>
          <Input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) setYear(n)
            }}
            className="w-[100px] h-9"
          />
          <Select value={storeFilter || "__all__"} onValueChange={(v) => setStoreFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder={t("orderColStore")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("orderFilterStoreAll")}</SelectItem>
              {storeTargets.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => void fetchMatrix()} disabled={loading}>
            {loading ? t("loading") : t("btn_query")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExcel}
            disabled={!data || data.stores.length === 0}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {t("outExcelDownload")}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("outStoreMonthAmountLegend")}
        </p>
        {data?.hitRowCap ? (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("outStoreMonthHitRowCap")}</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading && !data ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : !data || data.stores.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t("outNoData")}</div>
        ) : (
          <div className="overflow-x-auto max-h-[min(70vh,720px)]">
            <table className="w-full text-xs border-collapse min-w-[960px]">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b">
                  <th className="sticky left-0 z-20 bg-muted/95 py-2 px-3 text-left font-semibold min-w-[120px] border-r">
                    {t("orderColStore")}
                  </th>
                  {data.months.map((m) => (
                    <th key={m} className="py-2 px-2 text-right font-semibold min-w-[88px] whitespace-nowrap">
                      {monthLabel(m)}
                    </th>
                  ))}
                  <th className="py-2 px-2 text-right font-semibold min-w-[96px] bg-muted/80 border-l">
                    {t("outStoreMonthRowTotal")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.stores.map((store) => (
                  <tr key={store} className="border-b hover:bg-muted/30">
                    <td className="sticky left-0 z-[1] bg-card py-2 px-3 font-medium border-r whitespace-nowrap">
                      {store}
                    </td>
                    {data.months.map((m) => {
                      const cell = data.cells[store]?.[m] || { subtotal: 0, vat: 0, grandTotal: 0 }
                      return (
                        <td key={m} className="py-1.5 px-1 align-top">
                          <AmountPair
                            cell={cell}
                            lang={lang}
                            onClick={
                              cell.subtotal > 0
                                ? () => onDrillToHistory({ store, yearMonth: m })
                                : undefined
                            }
                          />
                        </td>
                      )
                    })}
                    <td className="py-1.5 px-2 align-top bg-muted/20 border-l">
                      <AmountPair
                        cell={data.rowTotals[store] || { subtotal: 0, vat: 0, grandTotal: 0 }}
                        lang={lang}
                      />
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="sticky left-0 z-[1] bg-muted/60 py-2 px-3 border-r">{t("outStoreMonthColTotal")}</td>
                  {data.months.map((m) => (
                    <td key={m} className="py-1.5 px-1 align-top">
                      <AmountPair
                        cell={data.colTotals[m] || { subtotal: 0, vat: 0, grandTotal: 0 }}
                        lang={lang}
                      />
                    </td>
                  ))}
                  <td className="py-1.5 px-2 align-top border-l">
                    <AmountPair cell={data.grandTotal} lang={lang} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
