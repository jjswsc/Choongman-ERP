"use client"

import * as React from "react"
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosStoreNormalCost } from "@/lib/api-client"
import type { StoreNormalCostReport, StoreNormalCostRow } from "@/lib/pos-store-normal-cost"
import { getBangkokMonthRange, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { resolveStockTakeKpiMonth } from "@/lib/stock-take-kpi"
import { cn } from "@/lib/utils"
import { MetricCard } from "@/components/cost-analysis/metric-card"
import { FinancialStatementStorePicker } from "@/components/financial-statements/financial-statement-store-picker"
import {
  buildFinancialStatementFranchiseStoreOptions,
  FINANCIAL_STATEMENT_STORE_NONE,
  isFinancialStatementStoreNone,
} from "@/lib/financial-statement-store-options"
import { useStoreList } from "@/lib/use-store-list"
import { labelForStore } from "@/lib/store-list-keys"
import { formatBahtInteger as formatBaht } from "@/lib/financial-amount-format"
import {
  combinedKindLabel,
  type SalesDiscountTr,
} from "@/lib/sales-discount-analytics-labels"

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `฿${formatBaht(n)}`
}

const USAGE_WARN_KEY: Record<string, string> = {
  USAGE_LOAD_FAILED: "posCostStoreNormalWarnUsage",
  ACCOUNTING_LOAD_FAILED: "posCostStoreNormalWarnAccounting",
  NO_LOCATION: "posCostStoreNormalWarnNoLocation",
  ACTUAL_RPC_FALLBACK: "posCostStoreNormalWarnRpc",
  STORE_ONLY: "posCostStoreNormalWarnStoreOnly",
  TENANT_BLOCKED: "posCostStoreNormalWarnTenant",
  BAD_RANGE: "posCostStoreNormalWarnRange",
}

export function PosCostStoreNormalTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, storeLabels } = useStoreList()
  const tr = React.useCallback<SalesDiscountTr>(
    (key, fallback) => {
      const value = t(key)
      return value && value !== key ? value : fallback
    },
    [t]
  )

  const franchiseStoreOptions = React.useMemo(
    () => buildFinancialStatementFranchiseStoreOptions(stores, storeLabels),
    [stores, storeLabels]
  )

  const defaultStoreFilter = React.useMemo(() => {
    const userStore = String(auth?.store || "").trim()
    if (userStore && franchiseStoreOptions.some((o) => o.value === userStore)) return userStore
    if (franchiseStoreOptions.length > 0) return "All"
    return FINANCIAL_STATEMENT_STORE_NONE
  }, [auth?.store, franchiseStoreOptions])

  const countMonth = React.useMemo(() => resolveStockTakeKpiMonth(), [])
  const [startStr, setStartStr] = React.useState(countMonth.startYmd)
  const [endStr, setEndStr] = React.useState(countMonth.endYmd)
  const [storeFilter, setStoreFilter] = React.useState(defaultStoreFilter)
  const [queryToken, setQueryToken] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<StoreNormalCostReport | null>(null)
  const [expanded, setExpanded] = React.useState<string | null>(null)

  React.useEffect(() => {
    setStoreFilter((prev) => (prev !== FINANCIAL_STATEMENT_STORE_NONE ? prev : defaultStoreFilter))
  }, [defaultStoreFilter])

  React.useEffect(() => {
    if (queryToken <= 0) return
    if (isFinancialStatementStoreNone(storeFilter)) {
      setError(t("posCostActualSelectStore"))
      setResult(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void getPosStoreNormalCost({ startStr, endStr, storeFilter })
      .then((data) => {
        if (!cancelled) {
          setResult(data)
          setExpanded(null)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setResult(null)
          setError(String(e?.message || e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [queryToken, startStr, endStr, storeFilter, t])

  const warningMessages = React.useMemo(() => {
    if (!result?.warnings?.length) return [] as string[]
    const msgs: string[] = []
    if (result.warnings.includes("STORE_NOT_SELECTED")) msgs.push(t("posCostActualSelectStore"))
    if (result.warnings.includes("OFFICE_SCOPE_NO_POS")) msgs.push(t("posCostActualOfficeNoPos"))
    if (result.warnings.includes("POS_TRUNCATED")) msgs.push(t("posCostActualTruncated"))
    if (result.warnings.includes("ACCOUNTING_FULL_MONTH")) msgs.push(t("posCostStoreNormalAccountingMonthHint"))
    return msgs
  }, [result, t])

  const kpi = React.useMemo(() => {
    const rows = result?.rows ?? []
    let net = 0
    let bom = 0
    let gapStores = 0
    let held = 0
    for (const row of rows) {
      net += row.netSales
      bom += row.bomCost
      if (row.gapHeld || row.foodScoreHeld) held += 1
      if (row.storeGap != null && row.storeGap > 0.5) gapStores += 1
    }
    return {
      normalPct: net > 0.0001 ? (bom / net) * 100 : null,
      gapStores,
      held,
      stores: rows.length,
    }
  }, [result])

  const holdLabel = (reason: StoreNormalCostRow["holdReasons"][number]) => {
    if (reason === "bom_unmatched") return t("posCostStoreNormalHoldBom")
    if (reason === "no_ending_count") return t("posCostStoreNormalHoldCount")
    return t("posCostStoreNormalHoldEngine")
  }

  const bucketLabel = (bucket: StoreNormalCostRow["discountLines"][number]["bucket"]) => {
    if (bucket === "hq") return t("posCostStoreNormalBucketHq")
    if (bucket === "store") return t("posCostStoreNormalBucketStore")
    return t("posCostStoreNormalBucketOther")
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">{t("posCostTabStoreNormal")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("posCostStoreNormalHint")}</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("posCostActualPeriodStart")}</Label>
            <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("posCostActualPeriodEnd")}</Label>
            <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("salesStore") || "매장"}</Label>
            <FinancialStatementStorePicker
              value={storeFilter}
              onChange={setStoreFilter}
              franchiseStoreOptions={franchiseStoreOptions}
              allLabel={t("all") || "전체"}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const cycle = resolveStockTakeKpiMonth()
                setStartStr(cycle.startYmd)
                setEndStr(cycle.endYmd)
              }}
            >
              {t("posCostStoreNormalPresetCount")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const month = getBangkokMonthRange()
                setStartStr(month.startStr)
                setEndStr(getBangkokTodayDateString())
              }}
            >
              {t("posCostActualPresetMonth")}
            </Button>
            <Button type="button" size="sm" onClick={() => setQueryToken((n) => n + 1)} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Search className="mr-1.5 h-4 w-4" />}
              {t("posCostStoreNormalQuery")}
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {warningMessages.map((msg) => (
        <p key={msg} className="text-xs text-amber-800 dark:text-amber-200">
          {msg}
        </p>
      ))}

      {result && result.rows.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label={t("posCostStoreNormalKpiNormalPct")}
              value={pct(kpi.normalPct)}
              subLabel={t("posCostStoreNormalKpiNormalPctSub").replace("{n}", String(kpi.stores))}
            />
            <MetricCard
              label={t("posCostStoreNormalKpiGapStores")}
              value={String(kpi.gapStores)}
              variant={kpi.gapStores > 0 ? "warning" : "default"}
            />
            <MetricCard label={t("posCostStoreNormalKpiHeld")} value={String(kpi.held)} />
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
            <table className="w-full min-w-[1280px] text-xs">
              <thead className="sticky top-0 z-10 bg-muted [&_th]:bg-muted">
                <tr className="border-b text-left">
                  <th className="px-2 py-2 w-8" />
                  <th className="px-2 py-2">{t("posCostStoreNormalColStore")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColGross")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColHqDiscount")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColStoreDiscount")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColOtherDiscount")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColNet")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColBom")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColPctGross")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColPctNet")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColIngredient")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColActual")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColFoodVar")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColCogs")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColCogsGap")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColGap")}</th>
                  <th className="px-2 py-2 text-right">{t("posCostStoreNormalColGapPct")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const open = expanded === row.storeCode
                  const storeName = labelForStore(storeLabels, row.storeCode)
                  const gapHot = row.storeGap != null && row.storeGap > 0.5
                  return (
                    <React.Fragment key={row.storeCode}>
                      <tr
                        className={cn(
                          "border-b border-border/60",
                          gapHot && "bg-amber-50/80 dark:bg-amber-950/25"
                        )}
                      >
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="text-muted-foreground"
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : row.storeCode)}
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-2 py-2 font-medium whitespace-nowrap" title={storeName !== row.storeCode ? row.storeCode : undefined}>
                          {storeName}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.grossSales)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.hqDiscount)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.storeDiscount)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.unclassifiedDiscount)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.netSales)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.bomCost)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{pct(row.normalCostPctOfGross)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{pct(row.normalCostPctOfNet)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.ingredientTheoryCost)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.actualUsageCost)}</td>
                        <td
                          className={cn(
                            "px-2 py-2 text-right tabular-nums",
                            row.foodVariance > 0.5 && "text-amber-800 dark:text-amber-200",
                            row.foodVariance < -0.5 && "text-emerald-700 dark:text-emerald-300"
                          )}
                        >
                          {money(row.foodVariance)}
                          {row.foodVariance < -0.5 ? (
                            <span className="ml-1 text-[10px]">{t("posCostStoreNormalSavings")}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.accountingCogs)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{money(row.accountingGap)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {row.storeGap == null ? (
                            <span className="text-amber-700 dark:text-amber-300">{t("posCostStoreNormalHeld")}</span>
                          ) : (
                            <span>
                              {money(row.storeGap)}
                              {row.foodScoreHeld ? (
                                <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-300">
                                  {t("posCostStoreNormalFoodHeld")}
                                </span>
                              ) : null}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{pct(row.storeGapPctOfNet)}</td>
                      </tr>
                      {open ? (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={17} className="px-4 py-3 space-y-2">
                            {row.holdReasons.length > 0 ? (
                              <ul className="list-disc pl-4 text-amber-800 dark:text-amber-200">
                                {row.holdReasons.map((reason) => (
                                  <li key={reason}>{holdLabel(reason)}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-muted-foreground">{t("posCostStoreNormalNoHold")}</p>
                            )}
                            {row.engineGapPct != null ? (
                              <p className="tabular-nums text-muted-foreground">
                                {t("posCostStoreNormalEngineGap").replace("{pct}", row.engineGapPct.toFixed(1))}
                              </p>
                            ) : null}
                            {row.discountLines.length > 0 ? (
                              <table className="w-full max-w-xl text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="py-1 text-left">{t("posCostStoreNormalDiscountKind")}</th>
                                    <th className="py-1 text-left">{t("posCostStoreNormalDiscountBucket")}</th>
                                    <th className="py-1 text-right">{t("posCostStoreNormalDiscountAmount")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {row.discountLines.map((line) => (
                                    <tr key={`${line.layer}-${line.kind}`} className="border-b border-border/40">
                                      <td className="py-1">{combinedKindLabel(line, tr)}</td>
                                      <td className="py-1">{bucketLabel(line.bucket)}</td>
                                      <td className="py-1 text-right tabular-nums">{money(line.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-muted-foreground">{t("posCostStoreNormalNoDiscount")}</p>
                            )}
                            {row.usageWarnings.length > 0 ? (
                              <ul className="list-disc pl-4 text-muted-foreground">
                                {row.usageWarnings.map((code) => {
                                  const key = USAGE_WARN_KEY[code]
                                  const label = key ? t(key) : code
                                  return <li key={code}>{label && label !== key ? label : code}</li>
                                })}
                              </ul>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : result && !loading ? (
        <p className="text-sm text-muted-foreground">{t("posCostStoreNormalEmpty")}</p>
      ) : null}
    </div>
  )
}
