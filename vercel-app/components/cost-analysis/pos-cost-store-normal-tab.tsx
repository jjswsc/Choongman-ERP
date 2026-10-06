"use client"

import * as React from "react"
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { tOr, useT } from "@/lib/i18n"
import { getPosStoreNormalCost } from "@/lib/api-client"
import {
  listStoreNormalPurchaseVendors,
  resolveStoreNormalAccounting,
  resolveStoreNormalBom,
  resolveStoreNormalPosSales,
  type StoreNormalCostReport,
  type StoreNormalCostRow,
  type StoreNormalVatMode,
} from "@/lib/pos-store-normal-cost"
import { purchaseVendorRowLabel } from "@/components/tabs/income-statement-tab-utils"
import { readIncomeStatementDisplayPrefs } from "@/lib/income-statement-display"
import { useErpPageActive } from "@/lib/erp-page-visibility"
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
import { formatMoney2 } from "@/lib/financial-amount-format"
import { patchPosCostViewSession, readPosCostViewSession } from "@/lib/pos-cost-view-session"

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `฿${formatMoney2(n)}`
}

function signedPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const sign = n > 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

function shareOfGross(part: number, gross: number, given?: number | null): number | null {
  if (given != null && Number.isFinite(given)) return given
  if (!(gross > 0.0001) || !Number.isFinite(part)) return null
  return (part / gross) * 100
}

function actualCostPct(row: StoreNormalCostRow, vatMode: StoreNormalVatMode): number | null {
  return resolveStoreNormalAccounting(row, vatMode).costPct
}

function plCogsAmount(row: StoreNormalCostRow, vatMode: StoreNormalVatMode): number | null {
  return resolveStoreNormalAccounting(row, vatMode).cogs
}

function theoryPct(row: StoreNormalCostRow, vatMode: StoreNormalVatMode): number | null {
  const net = resolveStoreNormalPosSales(row, vatMode).net
  const bom = resolveStoreNormalBom(row.bomCost, vatMode)
  if (!(net > 0.0001) || !Number.isFinite(bom)) return null
  return (bom / net) * 100
}

function gapPct(row: StoreNormalCostRow, vatMode: StoreNormalVatMode): number | null {
  const actual = actualCostPct(row, vatMode)
  const theory = theoryPct(row, vatMode)
  if (actual == null || theory == null) return null
  return Math.round((actual - theory) * 100) / 100
}

const USAGE_WARN_KEY: Record<string, string> = {
  ACCOUNTING_LOAD_FAILED: "posCostStoreNormalWarnAccounting",
}

export function PosCostStoreNormalTab() {
  const pageActive = useErpPageActive()
  const [plVatMode, setPlVatMode] = React.useState<StoreNormalVatMode>("included")
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, storeLabels } = useStoreList()

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

  const defaultMonth = React.useMemo(() => getBangkokMonthRange(), [])
  const [startStr, setStartStr] = React.useState(defaultMonth.startStr)
  const [endStr, setEndStr] = React.useState(getBangkokTodayDateString())
  const [storeFilter, setStoreFilter] = React.useState(defaultStoreFilter)
  const [queryToken, setQueryToken] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<StoreNormalCostReport | null>(null)
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [viewReady, setViewReady] = React.useState(false)

  React.useEffect(() => {
    setPlVatMode(readIncomeStatementDisplayPrefs().vatMode)
  }, [pageActive])

  React.useLayoutEffect(() => {
    const saved = readPosCostViewSession().storeNormal
    if (saved) {
      setStartStr(saved.startStr)
      setEndStr(saved.endStr)
      if (saved.storeFilter) setStoreFilter(saved.storeFilter)
      setResult(saved.result)
    }
    setViewReady(true)
  }, [])

  React.useEffect(() => {
    if (!viewReady) return
    setStoreFilter((prev) => (prev !== FINANCIAL_STATEMENT_STORE_NONE ? prev : defaultStoreFilter))
  }, [defaultStoreFilter, viewReady])

  React.useEffect(() => {
    if (!viewReady) return
    patchPosCostViewSession({
      storeNormal: { startStr, endStr, storeFilter, result },
    })
  }, [viewReady, startStr, endStr, storeFilter, result])

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
    let plSales = 0
    let plCogs = 0
    let higherPl = 0
    for (const row of rows) {
      net += resolveStoreNormalPosSales(row, plVatMode).net
      bom += resolveStoreNormalBom(row.bomCost, plVatMode)
      const pl = resolveStoreNormalAccounting(row, plVatMode)
      if (pl.sales != null && pl.sales > 0.0001 && pl.cogs != null) {
        plSales += pl.sales
        plCogs += pl.cogs
      }
      if ((gapPct(row, plVatMode) ?? 0) > 0.5) higherPl += 1
    }
    return {
      normalPct: net > 0.0001 ? (bom / net) * 100 : null,
      plPct: plSales > 0.0001 ? (plCogs / plSales) * 100 : null,
      higherPl,
      stores: rows.length,
    }
  }, [result, plVatMode])

  const holdLabel = () => t("posCostStoreNormalHoldBom")

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">{t("posCostTabStoreNormal")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("posCostStoreNormalHint")}</p>
        </div>
        <div className="flex flex-nowrap items-end gap-3 overflow-x-auto">
          <div className="space-y-1.5 shrink-0">
            <Label className="text-xs">{t("posCostActualPeriodStart")}</Label>
            <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1.5 shrink-0">
            <Label className="text-xs">{t("posCostActualPeriodEnd")}</Label>
            <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1.5 shrink-0">
            <Label className="text-xs">{tOr(t, "posCostStoreNormalColStore", "매장")}</Label>
            <FinancialStatementStorePicker
              value={storeFilter}
              onChange={setStoreFilter}
              franchiseStoreOptions={franchiseStoreOptions}
              allLabel={tOr(t, "all", "전체")}
              className="w-[200px]"
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
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
              label={t("posCostStoreNormalKpiPlPct")}
              value={pct(kpi.plPct)}
              subLabel={t("posCostStoreNormalKpiPlPctSub").replace("{n}", String(kpi.stores))}
            />
            <MetricCard
              label={t("posCostStoreNormalKpiHigherPl")}
              value={String(kpi.higherPl)}
              variant={kpi.higherPl > 0 ? "warning" : "default"}
            />
          </div>

          <div className="max-h-[70vh] overflow-auto rounded-xl border bg-card">
            <table className="w-full min-w-[1100px] text-xs">
              <thead className="sticky top-0 z-10 bg-muted [&_th]:bg-muted">
                <tr className="border-b text-left">
                  <th className="px-2 py-2 w-8" />
                  <th className="px-2 py-2">{t("posCostStoreNormalColStore")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColGross")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColDiscount")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColDiscountPct")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColNet")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColBom")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColTheoryPct")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColCogs")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColActualPct")}</th>
                  <th className="px-2 py-2 text-right whitespace-nowrap">{t("posCostStoreNormalColVsPct")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const open = expanded === row.storeCode
                  const storeName = labelForStore(storeLabels, row.storeCode)
                  const sales = resolveStoreNormalPosSales(row, plVatMode)
                  const discPct = shareOfGross(sales.discount, sales.gross)
                  const bom = resolveStoreNormalBom(row.bomCost, plVatMode)
                  const theory = theoryPct(row, plVatMode)
                  const vendors = listStoreNormalPurchaseVendors(row, plVatMode)
                  const actual = actualCostPct(row, plVatMode)
                  const gap = gapPct(row, plVatMode)
                  const plHot = gap != null && gap > 0.5
                  return (
                    <React.Fragment key={row.storeCode}>
                      <tr
                        className={cn(
                          "border-b border-border/60",
                          plHot && "bg-amber-50/80 dark:bg-amber-950/25"
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
                          {row.holdReasons.includes("bom_unmatched") ? (
                            <span className="ml-1 text-[10px] font-normal text-amber-700 dark:text-amber-300">
                              {t("posCostStoreNormalHeld")}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{money(sales.gross)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{money(sales.discount)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{pct(discPct)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{money(sales.net)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{money(bom)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{pct(theory)}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{money(plCogsAmount(row, plVatMode))}</td>
                        <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{pct(actual)}</td>
                        <td
                          className={cn(
                            "px-2 py-2 text-right tabular-nums whitespace-nowrap",
                            plHot && "text-amber-800 dark:text-amber-200",
                            gap != null && gap < -0.5 && "text-emerald-700 dark:text-emerald-300"
                          )}
                        >
                          {signedPct(gap)}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={11} className="px-4 py-3 space-y-2">
                            {row.holdReasons.length > 0 ? (
                              <ul className="list-disc pl-4 text-amber-800 dark:text-amber-200">
                                {row.holdReasons.map((reason) => (
                                  <li key={reason}>{holdLabel()}</li>
                                ))}
                              </ul>
                            ) : null}
                            {vendors.length > 0 ? (
                              <table className="w-full max-w-xl text-xs">
                                <thead>
                                  <tr className="border-b">
                                    <th className="py-1 text-left">{t("posCostStoreNormalVendor")}</th>
                                    <th className="py-1 text-right">{t("posCostStoreNormalVendorAmount")}</th>
                                    <th className="py-1 text-right">{t("posCostStoreNormalVendorShare")}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {vendors.map((vendor) => (
                                    <tr key={vendor.key} className="border-b border-border/40">
                                      <td className="py-1">{purchaseVendorRowLabel(vendor, t)}</td>
                                      <td className="py-1 text-right tabular-nums whitespace-nowrap">{money(vendor.amount)}</td>
                                      <td className="py-1 text-right tabular-nums whitespace-nowrap">{pct(vendor.sharePct)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="text-muted-foreground">{t("posCostStoreNormalNoVendor")}</p>
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
