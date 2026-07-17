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
import { ADMIN_TABLE_SCROLL_CN } from "@/lib/admin-ui-standards"

function defaultMatrixYear(): number {
  return Number(getBangkokTodayDateString().slice(0, 4))
}

function defaultMatrixMonth(): string {
  return String(Number(getBangkokTodayDateString().slice(5, 7)))
}

function mergeStoresWithKnown(
  fromApi: string[],
  knownStores: string[]
): string[] {
  const known = knownStores.map((s) => String(s || "").trim()).filter(Boolean)
  return [...new Set([...known, ...fromApi])].sort((a, b) => a.localeCompare(b))
}

function formatAmount(n: number, lang: string): string {
  return `${n.toLocaleString()}${lang === "th" ? " THB" : ""}`
}

function formatPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—"
  return `${pct.toFixed(1)}%`
}

function AmountPair({
  cell,
  lang,
  className,
  onClick,
  showSales,
}: {
  cell: OutboundStoreMonthAmountCell
  lang: string
  className?: string
  onClick?: () => void
  showSales?: boolean
}) {
  const hasPurchase = Boolean(cell.subtotal || cell.grandTotal)
  const hasSales = Boolean(cell.salesTotal)
  if (!hasPurchase && !hasSales) {
    return <span className={cn("text-muted-foreground/50 tabular-nums", className)}>—</span>
  }
  const inner = (
    <>
      {hasPurchase ? (
        <>
          <span className="block tabular-nums leading-tight">{formatAmount(cell.subtotal, lang)}</span>
          <span className="block text-[10px] text-muted-foreground tabular-nums leading-tight">
            ({formatAmount(cell.grandTotal, lang)})
          </span>
        </>
      ) : null}
      {showSales && hasSales ? (
        <span className="mt-0.5 block text-[10px] text-sky-700 dark:text-sky-300 tabular-nums leading-tight">
          {formatAmount(cell.salesTotal, lang)}
        </span>
      ) : null}
      {showSales && cell.purchaseToSalesPct != null ? (
        <span className="block text-[10px] font-medium text-emerald-700 dark:text-emerald-300 tabular-nums leading-tight">
          {formatPct(cell.purchaseToSalesPct)}
        </span>
      ) : null}
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
  /** 기본: 방콕 당월 — 연간 전체는 조회 부하가 커서 검색 실패하기 쉬움 */
  const [monthFilter, setMonthFilter] = React.useState<string>(defaultMatrixMonth)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [hasQueried, setHasQueried] = React.useState(false)
  const [data, setData] = React.useState<OutboundStoreMonthMatrixResult | null>(null)
  const [error, setError] = React.useState("")
  const reqSeqRef = React.useRef(0)

  const monthParam = monthFilter === "__all__" ? null : Number(monthFilter)

  const fetchMatrix = React.useCallback(async () => {
    const seq = ++reqSeqRef.current
    setLoading(true)
    setError("")
    setHasQueried(true)
    try {
      const res = await getOutboundStoreMonthMatrix({
        year,
        month: monthParam,
        storeFilter: storeFilter || undefined,
      })
      if (seq !== reqSeqRef.current) return
      setData({
        ...res,
        stores: mergeStoresWithKnown(res.stores, storeFilter ? [] : storeTargets),
      })
    } catch (e) {
      if (seq !== reqSeqRef.current) return
      setData(null)
      setError(String(e))
    } finally {
      if (seq === reqSeqRef.current) setLoading(false)
    }
  }, [year, monthParam, storeFilter, storeTargets])

  const monthLabel = React.useCallback(
    (ym: string) => {
      const m = Number(ym.slice(5, 7))
      if (lang === "ko") return `${m}월`
      return ym.slice(5)
    },
    [lang]
  )

  const singleMonthMode = Boolean(data && data.months.length === 1)

  const handleExcel = React.useCallback(() => {
    if (!data) return
    const sep = ","
    const esc = (v: string | number) => {
      const s = String(v)
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const salesHdr = t("outStoreMonthSales") || "POS 매출"
    const ratioHdr = t("outStoreMonthPurchaseRatio") || "매입/매출"
    const headers = singleMonthMode
      ? [
          t("orderColStore"),
          t("outStoreMonthPurchaseCol") || "본사 매입",
          salesHdr,
          ratioHdr,
        ]
      : [
          t("orderColStore"),
          ...data.months.flatMap((m) => [
            `${monthLabel(m)} ${t("inColAmount")}`,
            `${monthLabel(m)} ${t("inv_total")}`,
          ]),
          `${t("outStoreMonthRowTotal")} ${t("inColAmount")}`,
          `${t("outStoreMonthRowTotal")} ${t("inv_total")}`,
          salesHdr,
          ratioHdr,
        ]
    const lines: string[] = [headers.map(esc).join(sep)]
    for (const store of data.stores) {
      if (singleMonthMode) {
        const m = data.months[0]
        const c = data.cells[store]?.[m] || {
          subtotal: 0,
          grandTotal: 0,
          vat: 0,
          salesTotal: 0,
          purchaseToSalesPct: null,
        }
        lines.push(
          [store, c.subtotal, c.grandTotal, c.salesTotal, c.purchaseToSalesPct ?? ""].map(esc).join(sep)
        )
        continue
      }
      const row = data.cells[store] || {}
      const cols: (string | number)[] = [store]
      for (const m of data.months) {
        const c = row[m] || { subtotal: 0, grandTotal: 0, vat: 0, salesTotal: 0, purchaseToSalesPct: null }
        cols.push(c.subtotal, c.grandTotal)
      }
      const rt = data.rowTotals[store] || {
        subtotal: 0,
        grandTotal: 0,
        vat: 0,
        salesTotal: 0,
        purchaseToSalesPct: null,
      }
      cols.push(rt.subtotal, rt.grandTotal, rt.salesTotal, rt.purchaseToSalesPct ?? "")
      lines.push(cols.map(esc).join(sep))
    }
    const foot: (string | number)[] = singleMonthMode
      ? [
          t("outStoreMonthColTotal"),
          data.grandTotal.subtotal,
          data.grandTotal.grandTotal,
          data.grandTotal.salesTotal,
          data.grandTotal.purchaseToSalesPct ?? "",
        ]
      : [t("outStoreMonthColTotal")]
    if (!singleMonthMode) {
      for (const m of data.months) {
        const c = data.colTotals[m] || {
          subtotal: 0,
          grandTotal: 0,
          vat: 0,
          salesTotal: 0,
          purchaseToSalesPct: null,
        }
        foot.push(c.subtotal, c.grandTotal)
      }
      foot.push(data.grandTotal.subtotal, data.grandTotal.grandTotal, data.grandTotal.salesTotal)
      foot.push(data.grandTotal.purchaseToSalesPct ?? "")
    }
    lines.push(foot.map(esc).join(sep))
    const monthSuffix =
      data.month != null ? `_${String(data.month).padStart(2, "0")}` : "_all"
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `outbound_store_month_${data.year}${monthSuffix}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [data, monthLabel, singleMonthMode, t])

  const monthOptions = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const n = i + 1
        const label =
          lang === "ko"
            ? `${n}${t("outStoreMonthMonthSuffix") || "월"}`
            : new Date(2000, i, 1).toLocaleString(lang === "th" ? "th-TH" : "en-US", { month: "short" })
        return { value: String(n), label }
      }),
    [lang, t]
  )

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
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            {t("outStoreMonthMonth") || t("outFilterMonth") || "월"}
          </label>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("outStoreMonthMonthAll") || "전체"}</SelectItem>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <p className="text-[11px] text-muted-foreground">{t("outStoreMonthAmountLegend")}</p>
        {data && !data.salesLoaded ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t("outStoreMonthSalesUnavailable") ||
              "POS 매출 집계를 불러오지 못했습니다. 매입 금액만 표시합니다."}
          </p>
        ) : null}
        {data?.hitRowCap ? (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("outStoreMonthHitRowCap")}</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading && !data ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : !hasQueried ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {t("outStoreMonthClickSearch") || "연도·월을 선택한 뒤 검색을 누르세요."}
          </div>
        ) : !data || data.stores.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t("outNoData")}</div>
        ) : singleMonthMode ? (
          <div className={cn(ADMIN_TABLE_SCROLL_CN, "max-h-[min(70vh,720px)]")}>
            <table className="w-full text-xs border-collapse min-w-[720px]">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr className="border-b">
                  <th className="py-2 px-3 text-left font-semibold min-w-[120px]">{t("orderColStore")}</th>
                  <th className="py-2 px-2 text-right font-semibold min-w-[120px]">{t("outStoreMonthPurchaseCol") || "본사 매입"}</th>
                  <th className="py-2 px-2 text-right font-semibold min-w-[96px]">
                    {t("outStoreMonthSales") || "POS 매출"}
                  </th>
                  <th className="py-2 px-2 text-right font-semibold min-w-[72px]">
                    {t("outStoreMonthPurchaseRatio") || "매입/매출"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.stores.map((store) => {
                  const m = data.months[0]
                  const cell = data.cells[store]?.[m] || {
                    subtotal: 0,
                    vat: 0,
                    grandTotal: 0,
                    salesTotal: 0,
                    purchaseToSalesPct: null,
                  }
                  return (
                    <tr key={store} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 font-medium whitespace-nowrap">{store}</td>
                      <td className="py-2 px-2 align-top">
                        <AmountPair
                          cell={cell}
                          lang={lang}
                          onClick={
                            cell.subtotal > 0 ? () => onDrillToHistory({ store, yearMonth: m }) : undefined
                          }
                        />
                      </td>
                      <td className="py-2 px-2 align-top text-right tabular-nums text-sky-700 dark:text-sky-300">
                        {cell.salesTotal ? formatAmount(cell.salesTotal, lang) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right font-medium tabular-nums align-top text-emerald-700 dark:text-emerald-300">
                        {formatPct(cell.purchaseToSalesPct)}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="py-2 px-3">{t("outStoreMonthColTotal")}</td>
                  <td className="py-2 px-2 align-top">
                    <AmountPair cell={data.grandTotal} lang={lang} />
                  </td>
                  <td className="py-2 px-2 align-top text-right tabular-nums text-sky-700 dark:text-sky-300">
                    {data.grandTotal.salesTotal ? formatAmount(data.grandTotal.salesTotal, lang) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatPct(data.grandTotal.purchaseToSalesPct)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className={cn(ADMIN_TABLE_SCROLL_CN, "max-h-[min(70vh,720px)]")}>
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
                  <th className="py-2 px-2 text-right font-semibold min-w-[88px] bg-muted/80">
                    {t("outStoreMonthSales") || "POS 매출"}
                  </th>
                  <th className="py-2 px-2 text-right font-semibold min-w-[72px] bg-muted/80">
                    {t("outStoreMonthPurchaseRatio") || "매입/매출"}
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
                      const cell = data.cells[store]?.[m] || {
                        subtotal: 0,
                        vat: 0,
                        grandTotal: 0,
                        salesTotal: 0,
                        purchaseToSalesPct: null,
                      }
                      return (
                        <td key={m} className="py-1.5 px-1 align-top">
                          <AmountPair
                            cell={cell}
                            lang={lang}
                            showSales
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
                        cell={data.rowTotals[store] || {
                          subtotal: 0,
                          vat: 0,
                          grandTotal: 0,
                          salesTotal: 0,
                          purchaseToSalesPct: null,
                        }}
                        lang={lang}
                      />
                    </td>
                    <td className="py-1.5 px-2 align-top bg-muted/20 text-right tabular-nums text-sky-700 dark:text-sky-300">
                      {data.rowTotals[store]?.salesTotal
                        ? formatAmount(data.rowTotals[store].salesTotal, lang)
                        : "—"}
                    </td>
                    <td className="py-1.5 px-2 align-top bg-muted/20 text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatPct(data.rowTotals[store]?.purchaseToSalesPct)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-muted/40 font-semibold">
                  <td className="sticky left-0 z-[1] bg-muted/60 py-2 px-3 border-r">{t("outStoreMonthColTotal")}</td>
                  {data.months.map((m) => (
                    <td key={m} className="py-1.5 px-1 align-top">
                      <AmountPair
                        cell={data.colTotals[m] || {
                          subtotal: 0,
                          vat: 0,
                          grandTotal: 0,
                          salesTotal: 0,
                          purchaseToSalesPct: null,
                        }}
                        lang={lang}
                        showSales
                      />
                    </td>
                  ))}
                  <td className="py-1.5 px-2 align-top border-l">
                    <AmountPair cell={data.grandTotal} lang={lang} />
                  </td>
                  <td className="py-1.5 px-2 align-top text-right tabular-nums text-sky-700 dark:text-sky-300">
                    {data.grandTotal.salesTotal ? formatAmount(data.grandTotal.salesTotal, lang) : "—"}
                  </td>
                  <td className="py-1.5 px-2 align-top text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatPct(data.grandTotal.purchaseToSalesPct)}
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
