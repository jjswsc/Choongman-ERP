"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { useStoreList, getBalanceSheet, translateTexts, type BalanceSheetData } from "@/lib/api-client"
import { expandBangkokYearMonthsInclusive, getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  FINANCIAL_COMPARE_MAX_MONTHS,
  pickBalanceSheetLastMonthPerYear,
} from "@/lib/financial-statements-compare"
import { formatBahtInteger as formatBaht } from "@/lib/financial-amount-format"

type BalanceSheetTabProps = {
  /** @deprecated 시작·종료월을 쓰세요 */
  yearMonth?: string
  yearMonthStart?: string
  yearMonthEnd?: string
  storeFilter?: string
  hideControls?: boolean
  queryToken?: number
}

type BsMetrics = {
  cash: number
  inv: number
  rec: number
  assets: number
  pay: number
  liab: number
  eq: number
  chk: number
}

function metricsFromBalance(d: BalanceSheetData | undefined): BsMetrics | null {
  if (!d) return null
  return {
    cash: d.assets.cashAndBanks,
    inv: d.assets.inventory,
    rec: d.assets.receivables,
    assets: d.assets.total,
    pay: d.liabilities.payables,
    liab: d.liabilities.total,
    eq: d.equity.total,
    chk: d.balanceCheckDiff,
  }
}

export function BalanceSheetTab(props: BalanceSheetTabProps = {}) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores: storeList } = useStoreList()
  const isOffice = isOfficeRole(auth?.role || "")
  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()

  const defaultYm = props.yearMonth || getBangkokRecentYearMonths(1)[0]
  const [yearMonthStart, setYearMonthStart] = React.useState(
    () => props.yearMonthStart ?? props.yearMonth ?? defaultYm
  )
  const [yearMonthEnd, setYearMonthEnd] = React.useState(
    () => props.yearMonthEnd ?? props.yearMonth ?? defaultYm
  )
  const [storeFilter, setStoreFilter] = React.useState(() =>
    props.storeFilter ?? (isManager && managerStore ? managerStore : "All")
  )
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<BalanceSheetData | null>(null)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})
  const [compareBalanceRows, setCompareBalanceRows] = React.useState<{ ym: string; data: BalanceSheetData }[]>([])
  const [compareGranularity, setCompareGranularity] = React.useState<"month" | "year">("month")
  const [balanceCompareFetchId, setBalanceCompareFetchId] = React.useState(0)

  const periodMonthsFull = React.useMemo(
    () => expandBangkokYearMonthsInclusive(yearMonthStart, yearMonthEnd),
    [yearMonthStart, yearMonthEnd]
  )
  const periodMonths = React.useMemo(() => {
    if (periodMonthsFull.length <= FINANCIAL_COMPARE_MAX_MONTHS) return periodMonthsFull
    return periodMonthsFull.slice(-FINANCIAL_COMPARE_MAX_MONTHS)
  }, [periodMonthsFull])
  const periodRangeTruncated = periodMonthsFull.length > periodMonths.length
  const isRangeCompare = periodMonths.length > 1

  const withdrawals = data?.unpostedBankWithdrawals || []
  React.useEffect(() => {
    const memos = [...new Set(withdrawals.map((row) => (row.memo || row.store || "").trim()).filter(Boolean))]
    if (memos.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(memos, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        memos.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => {
      cancelled = true
    }
  }, [data?.unpostedBankWithdrawals, lang])

  const getMemo = React.useCallback(
    (memo: string | undefined | null, store?: string | null) => {
      const raw = (memo || store || "").trim() || "—"
      if (raw === "—") return "—"
      return (memoTransMap[raw] || memoTransMap[store || ""]) || raw
    },
    [memoTransMap]
  )

  React.useEffect(() => {
    if (isManager && managerStore) setStoreFilter(managerStore)
  }, [isManager, managerStore])

  React.useEffect(() => {
    if (props.yearMonth) {
      setYearMonthStart(props.yearMonth)
      setYearMonthEnd(props.yearMonth)
    }
  }, [props.yearMonth])

  React.useEffect(() => {
    if (props.yearMonthStart) setYearMonthStart(props.yearMonthStart)
  }, [props.yearMonthStart])

  React.useEffect(() => {
    if (props.yearMonthEnd) setYearMonthEnd(props.yearMonthEnd)
  }, [props.yearMonthEnd])

  React.useEffect(() => {
    if (props.storeFilter) setStoreFilter(props.storeFilter)
  }, [props.storeFilter])

  const runBalanceFetch = React.useCallback(() => {
    const sf = storeFilter !== "All" ? storeFilter : undefined
    const months = periodMonths
    if (months.length <= 1) {
      const ym = months[0] ?? yearMonthEnd
      setLoading(true)
      setCompareBalanceRows([])
      getBalanceSheet({
        yearMonth: ym,
        storeFilter: sf,
        userStore: auth?.store,
        userRole: auth?.role,
      })
        .then((r) => setData(r))
        .catch(() => setData(null))
        .finally(() => setLoading(false))
      return
    }
    setLoading(true)
    setData(null)
    Promise.all(
      months.map((ym) =>
        getBalanceSheet({
          yearMonth: ym,
          storeFilter: sf,
          userStore: auth?.store,
          userRole: auth?.role,
        })
      )
    )
      .then((arr) =>
        setCompareBalanceRows(
          months.map((ym, i) => ({
            ym,
            data: arr[i] as BalanceSheetData,
          }))
        )
      )
      .catch(() => setCompareBalanceRows([]))
      .finally(() => {
        setBalanceCompareFetchId((x) => x + 1)
        setLoading(false)
      })
  }, [periodMonths, storeFilter, auth?.store, auth?.role, yearMonthEnd])

  React.useEffect(() => {
    if (!props.hideControls) return
    if (props.queryToken == null) return
    runBalanceFetch()
  }, [props.hideControls, props.queryToken, runBalanceFetch])

  const loadData = React.useCallback(() => {
    runBalanceFetch()
  }, [runBalanceFetch])

  const balanceYearSnaps = React.useMemo(
    () => pickBalanceSheetLastMonthPerYear(compareBalanceRows),
    [compareBalanceRows]
  )

  const showBalanceCompareTable = isRangeCompare && !loading && compareBalanceRows.length > 0

  const balanceCompareCols = React.useMemo(() => {
    if (compareGranularity === "month") {
      return compareBalanceRows.map(({ ym, data: d }) => ({
        key: ym,
        label: ym,
        metrics: metricsFromBalance(d),
      }))
    }
    return balanceYearSnaps.map((s) => ({
      key: s.year,
      label: s.year,
      sub: s.ym,
      metrics: metricsFromBalance(s.data),
    }))
  }, [compareGranularity, compareBalanceRows, balanceYearSnaps])

  const balanceCompareMetricRows = React.useMemo(
    () => [
      { key: "cash", label: t("bs_cashAndBanks"), pick: (m: BsMetrics) => m.cash },
      { key: "inv", label: t("bs_inventory"), pick: (m: BsMetrics) => m.inv },
      { key: "rec", label: t("bs_receivables"), pick: (m: BsMetrics) => m.rec },
      { key: "assets", label: `${t("bs_assets")} (${t("bs_total")})`, pick: (m: BsMetrics) => m.assets },
      { key: "pay", label: t("bs_payables"), pick: (m: BsMetrics) => m.pay },
      { key: "liab", label: `${t("bs_liabilities")} (${t("bs_total")})`, pick: (m: BsMetrics) => m.liab },
      { key: "eq", label: `${t("bs_equity")} (${t("bs_total")})`, pick: (m: BsMetrics) => m.eq },
      { key: "chk", label: t("bs_balanceCheck"), pick: (m: BsMetrics) => m.chk },
    ],
    [t]
  )

  const yearMonthOptions = getBangkokRecentYearMonths(60).map((value) => {
    const [y, m] = value.split("-").map(Number)
    return { value, label: `${y}년 ${m}월` }
  })

  const storeOptions = isOffice
    ? [
        "본사",
        ...(storeList || []).filter(
          (s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office")
        ),
      ]
    : isManager && managerStore
      ? [managerStore]
      : []

  const storeLabel =
    storeFilter === "All"
      ? t("all") || "All"
      : ["본사", "Office", "오피스", "본점"].includes(storeFilter) || storeFilter.toLowerCase().includes("office")
        ? t("pettyScopeOffice") || "Office"
        : storeFilter

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {!props.hideControls && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">{t("fs_periodStartMonth")}</span>
                  <Select
                    value={yearMonthStart}
                    onValueChange={(v) => {
                      setYearMonthStart(v)
                      if (v > yearMonthEnd) setYearMonthEnd(v)
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder={t("fs_periodStartMonth")} />
                    </SelectTrigger>
                    <SelectContent>
                      {yearMonthOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">~</span>
                  <span className="text-xs text-muted-foreground shrink-0">{t("fs_periodEndMonth")}</span>
                  <Select
                    value={yearMonthEnd}
                    onValueChange={(v) => {
                      setYearMonthEnd(v)
                      if (v < yearMonthStart) setYearMonthStart(v)
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder={t("fs_periodEndMonth")} />
                    </SelectTrigger>
                    <SelectContent>
                      {yearMonthOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(isOffice || isManager) && (
                  <Select
                    value={storeFilter}
                    onValueChange={setStoreFilter}
                    disabled={isManager || !storeOptions.length}
                  >
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder={t("pL_store")} />
                    </SelectTrigger>
                    <SelectContent>
                      {isOffice && <SelectItem value="All">{t("all") || "All"}</SelectItem>}
                      {storeOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button size="sm" onClick={loadData} disabled={loading}>
                  <Search className="h-4 w-4 mr-1" />
                  {t("btn_query")}
                </Button>
              </>
            )}
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            <>
              {showBalanceCompareTable && (
                <div className="mb-6 space-y-3">
                  {periodRangeTruncated && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                      {t("fs_periodTruncated").replace("{n}", String(FINANCIAL_COMPARE_MAX_MONTHS))}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant={compareGranularity === "month" ? "default" : "outline"}
                      onClick={() => setCompareGranularity("month")}
                    >
                      {t("fs_compareByMonth")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={compareGranularity === "year" ? "default" : "outline"}
                      onClick={() => setCompareGranularity("year")}
                    >
                      {t("fs_compareByYear")}
                    </Button>
                  </div>
                  {compareGranularity === "year" && (
                    <p className="text-xs text-muted-foreground">{t("fs_compareYearBsNote")}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {yearMonthStart === yearMonthEnd
                      ? yearMonthEnd
                      : `${yearMonthStart} ~ ${yearMonthEnd}`}{" "}
                    · {storeLabel}
                  </div>
                  {balanceCompareCols.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t("inNoData") || "No data found."}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="text-sm w-full min-w-max">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="text-left p-2 font-medium sticky left-0 bg-muted/40 z-10 min-w-[160px]">
                              {t("pL_colItem")}
                            </th>
                            {balanceCompareCols.map((c) => (
                              <th
                                key={c.key}
                                className="text-right p-2 font-medium font-mono whitespace-nowrap align-bottom"
                              >
                                <div>{c.label}</div>
                                {("sub" in c && c.sub) ? (
                                  <div className="text-[10px] font-normal text-muted-foreground font-sans">
                                    ({String(c.sub)})
                                  </div>
                                ) : null}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {balanceCompareMetricRows.map((row) => (
                            <tr key={row.key} className="border-b last:border-0">
                              <td className="p-2 font-medium sticky left-0 bg-background z-10">{row.label}</td>
                              {balanceCompareCols.map((c) => {
                                const m = c.metrics
                                const v = m ? row.pick(m) : null
                                const isChk = row.key === "chk"
                                const ok = v != null && Math.abs(v) < 1
                                return (
                                  <td
                                    key={c.key}
                                    className={`p-2 text-right font-mono whitespace-nowrap ${
                                      isChk && v != null && !ok ? "text-amber-800 font-medium" : ""
                                    } ${isChk && v != null && ok ? "text-emerald-800" : ""}`}
                                  >
                                    {v == null || m == null ? "—" : formatBaht(v)}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {isRangeCompare &&
                !showBalanceCompareTable &&
                !loading &&
                balanceCompareFetchId > 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("inNoData") || "No data found."}
                  </p>
                )}
              {isRangeCompare &&
                !showBalanceCompareTable &&
                !loading &&
                balanceCompareFetchId === 0 &&
                !props.hideControls && (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query")}</p>
                )}

              {!isRangeCompare && data ? (
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {data.yearMonth} · {data.storeFilter}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-semibold mb-2">{t("bs_assets")}</div>
                      <div className="text-xs text-muted-foreground">{t("bs_cashAndBanks")}</div>
                      <div className="font-mono text-right">{formatBaht(data.assets.cashAndBanks)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t("bs_inventory")}</div>
                      <div className="font-mono text-right">{formatBaht(data.assets.inventory)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t("bs_receivables")}</div>
                      <div className="font-mono text-right">{formatBaht(data.assets.receivables)}</div>
                      <div className="border-t mt-2 pt-2 text-sm font-semibold flex justify-between">
                        <span>{t("bs_total")}</span>
                        <span className="font-mono">{formatBaht(data.assets.total)}</span>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-semibold mb-2">{t("bs_liabilities")}</div>
                      <div className="text-xs text-muted-foreground">{t("bs_payables")}</div>
                      <div className="font-mono text-right">{formatBaht(data.liabilities.payables)}</div>
                      <div className="border-t mt-2 pt-2 text-sm font-semibold flex justify-between">
                        <span>{t("bs_total")}</span>
                        <span className="font-mono">{formatBaht(data.liabilities.total)}</span>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="text-sm font-semibold mb-2">{t("bs_equity")}</div>
                      <div className="text-xs text-muted-foreground">{t("bs_openingCapital")}</div>
                      <div className="font-mono text-right">{formatBaht(data.equity.openingCapital)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t("bs_currentPeriodProfit")}</div>
                      <div className="font-mono text-right">{formatBaht(data.equity.currentPeriodProfit)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{t("bs_retainedEarningsYtd")}</div>
                      <div className="font-mono text-right">{formatBaht(data.equity.retainedEarningsYtd)}</div>
                      <div className="border-t mt-2 pt-2 text-sm font-semibold flex justify-between">
                        <span>{t("bs_total")}</span>
                        <span className="font-mono">{formatBaht(data.equity.total)}</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      Math.abs(data.balanceCheckDiff) < 1
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                        : "border-amber-300 bg-amber-50 text-amber-900"
                    }`}
                  >
                    {t("bs_balanceCheck")}:{" "}
                    <span className="font-mono font-semibold">{formatBaht(data.balanceCheckDiff)}</span>
                  </div>

                  {data.unpostedBankWithdrawals && data.unpostedBankWithdrawals.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-sm">
                      <div className="font-semibold text-amber-900 mb-2">
                        {t("bs_unpostedWithdrawals")} ({data.unpostedBankWithdrawals.length}건, 합계{" "}
                        {formatBaht(data.unpostedBankWithdrawals.reduce((s, x) => s + x.amount, 0))})
                      </div>
                      <div className="text-xs text-amber-800 overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="w-full min-w-[320px]">
                          <thead>
                            <tr className="border-b border-amber-200">
                              <th className="text-left py-1 pr-2">날짜</th>
                              <th className="text-right py-1 pr-2">금액</th>
                              <th className="text-left py-1 pr-2">용도</th>
                              <th className="text-left py-1 min-w-0">적요</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.unpostedBankWithdrawals.map((row) => (
                              <tr key={row.id} className="border-b border-amber-100 last:border-0">
                                <td className="py-1 pr-2">{row.transDate}</td>
                                <td className="font-mono text-right py-1 pr-2">{formatBaht(row.amount)}</td>
                                <td className="py-1 pr-2 text-amber-700">{row.category}</td>
                                <td
                                  className="py-1 truncate max-w-[180px]"
                                  title={row.memo ?? row.store ?? ""}
                                >
                                  {getMemo(row.memo ?? undefined, row.store ?? undefined)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-amber-700 mt-2">{t("bs_unpostedWithdrawalsHint")}</p>
                    </div>
                  )}
                </div>
              ) : !isRangeCompare ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("msg_click_query")}</p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
