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
import {
  buildFinancialStatementFranchiseStoreOptions,
  isFinancialStatementStoreNone,
  resolveFinancialStatementStoreLabel,
} from "@/lib/financial-statement-store-options"
import { isAccountingRole, isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { canFranchiseeAggregateAllowedStores } from "@/lib/franchisee-multi-store"
import { useStoreView } from "@/lib/store-view-context"
import {
  useStoreList,
  getBalanceSheet,
  isBalanceSheetData,
  translateTexts,
  type BalanceSheetData,
} from "@/lib/api-client"
import { expandBangkokYearMonthsInclusive, getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  FINANCIAL_COMPARE_MAX_MONTHS,
  pickBalanceSheetLastMonthPerYear,
} from "@/lib/financial-statements-compare"
import { formatBahtInteger as formatBaht } from "@/lib/financial-amount-format"
import {
  accountingBsBalanceCheckOkCn,
  accountingBsBalanceCheckWarnCn,
  accountingBsCompareShellCn,
  accountingBsCompareTdAmountCn,
  accountingBsCompareTdStickyCn,
  accountingBsCompareTheadCn,
  accountingBsCompareThColCn,
  accountingBsCompareThStickyCn,
  accountingBsCompareTotalRowCn,
  accountingBsLineLabelCn,
  accountingBsLineRowCn,
  accountingBsLineValueCn,
  accountingBsSectionAccentClass,
  accountingBsSectionCardCn,
  accountingBsSectionTitleCn,
  accountingBsSubLineLabelCn,
  accountingBsSubLineRowCn,
  accountingBsSubLineValueCn,
  accountingBsTotalRowCn,
  accountingFsDocumentCn,
  accountingFsTitleCn,
} from "@/lib/accounting-result-ui"
import {
  AccountingPeriodChip,
} from "@/components/admin/accounting-result-primitives"

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
  if (!isBalanceSheetData(d)) return null
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
  const { stores: storeList, storeLabels } = useStoreList()
  const { viewStore } = useStoreView()
  const isOffice = isOfficeRole(auth?.role || "") || isAccountingRole(auth?.role || "")
  const isManager = !isOffice && isManagerOrFranchiseeRole(auth?.role || "")
  const canFranchiseeMultiStore = canFranchiseeAggregateAllowedStores(
    auth?.role,
    auth?.allowedStores,
    auth?.store
  )
  const managerStore = (auth?.store || "").trim()
  const scopedStoreChoices = React.useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of [...(auth?.allowedStores || []), managerStore]) {
      const t = String(s || "").trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
    return out
  }, [auth?.allowedStores, managerStore])

  const defaultYm = props.yearMonth || getBangkokRecentYearMonths(1)[0]
  const [yearMonthStart, setYearMonthStart] = React.useState(
    () => props.yearMonthStart ?? props.yearMonth ?? defaultYm
  )
  const [yearMonthEnd, setYearMonthEnd] = React.useState(
    () => props.yearMonthEnd ?? props.yearMonth ?? defaultYm
  )
  const [storeFilter, setStoreFilter] = React.useState(() =>
    props.storeFilter ??
      (canFranchiseeMultiStore
        ? "All"
        : isManager && scopedStoreChoices[0]
          ? scopedStoreChoices[0]
          : "All")
  )
  const parentControlsQuery = Boolean(props.hideControls)
  const queryYearMonthStart = parentControlsQuery
    ? (props.yearMonthStart ?? props.yearMonth ?? yearMonthStart)
    : yearMonthStart
  const queryYearMonthEnd = parentControlsQuery
    ? (props.yearMonthEnd ?? props.yearMonth ?? yearMonthEnd)
    : yearMonthEnd
  const queryStoreFilter =
    parentControlsQuery && props.storeFilter != null ? props.storeFilter : storeFilter
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<BalanceSheetData | null>(null)
  const [fetchError, setFetchError] = React.useState<string | null>(null)
  const [memoTransMap, setMemoTransMap] = React.useState<Record<string, string>>({})
  const [compareBalanceRows, setCompareBalanceRows] = React.useState<{ ym: string; data: BalanceSheetData }[]>([])
  const [compareGranularity, setCompareGranularity] = React.useState<"month" | "year">("month")
  const [balanceCompareFetchId, setBalanceCompareFetchId] = React.useState(0)
  const balanceFetchSeqRef = React.useRef(0)

  const periodMonthsFull = React.useMemo(
    () => expandBangkokYearMonthsInclusive(queryYearMonthStart, queryYearMonthEnd),
    [queryYearMonthStart, queryYearMonthEnd]
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
    if (props.storeFilter) return
    if (!canFranchiseeMultiStore) {
      if (isManager && scopedStoreChoices[0]) setStoreFilter(scopedStoreChoices[0])
      return
    }
    const v = String(viewStore || "").trim()
    if (!v || v === "All") {
      setStoreFilter("All")
      return
    }
    if (scopedStoreChoices.includes(v)) setStoreFilter(v)
  }, [props.storeFilter, canFranchiseeMultiStore, isManager, scopedStoreChoices, viewStore])

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
    const fetchSeq = ++balanceFetchSeqRef.current
    if (isFinancialStatementStoreNone(queryStoreFilter)) {
      setLoading(false)
      setData(null)
      setCompareBalanceRows([])
      setFetchError(t("salesSelectStoreHint") || "매장을 선택하세요.")
      return
    }
    const sf = queryStoreFilter !== "All" ? queryStoreFilter : undefined
    const months = periodMonths
    setFetchError(null)
    if (months.length <= 1) {
      const ym = months[0] ?? queryYearMonthEnd
      setLoading(true)
      setCompareBalanceRows([])
      getBalanceSheet({
        yearMonth: ym,
        storeFilter: sf,
        userStore: auth?.store,
        userRole: auth?.role,
      })
        .then((r) => {
          if (fetchSeq !== balanceFetchSeqRef.current) return
          setData(r)
          setFetchError(null)
        })
        .catch((e) => {
          if (fetchSeq !== balanceFetchSeqRef.current) return
          setData(null)
          setFetchError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (fetchSeq !== balanceFetchSeqRef.current) return
          setLoading(false)
        })
      return
    }
    setLoading(true)
    setData(null)
    Promise.all(
      months.map(async (ym) => {
        try {
          const data = await getBalanceSheet({
            yearMonth: ym,
            storeFilter: sf,
            userStore: auth?.store,
            userRole: auth?.role,
          })
          return { ym, data }
        } catch (e) {
          return {
            ym,
            data: null,
            error: e instanceof Error ? e.message : String(e || "FETCH_FAILED"),
          }
        }
      })
    )
      .then((results) => {
        if (fetchSeq !== balanceFetchSeqRef.current) return
        const rows = results.filter(
          (row): row is { ym: string; data: BalanceSheetData } =>
            row.data != null && isBalanceSheetData(row.data)
        )
        setCompareBalanceRows(rows)
        const firstErr = results.find((r) => r.error)?.error
        if (rows.length === 0) {
          setFetchError(firstErr || t("inNoData") || "No data found.")
        } else if (firstErr) {
          setFetchError(firstErr)
        }
      })
      .catch((e) => {
        if (fetchSeq !== balanceFetchSeqRef.current) return
        setCompareBalanceRows([])
        setFetchError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (fetchSeq !== balanceFetchSeqRef.current) return
        setBalanceCompareFetchId((x) => x + 1)
        setLoading(false)
      })
  }, [periodMonths, queryStoreFilter, auth?.store, auth?.role, queryYearMonthEnd, t])

  const runBalanceFetchRef = React.useRef(runBalanceFetch)
  runBalanceFetchRef.current = runBalanceFetch

  React.useEffect(() => {
    if (!props.hideControls) return
    if (props.queryToken == null) return
    runBalanceFetchRef.current()
  }, [props.hideControls, props.queryToken])

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

  const franchiseStoreOptions = React.useMemo(
    () => buildFinancialStatementFranchiseStoreOptions(storeList, storeLabels),
    [storeList, storeLabels]
  )
  const managerStoreOptions = isManager ? scopedStoreChoices : []

  const storeLabel = resolveFinancialStatementStoreLabel(storeFilter, storeLabels, t, {
    franchiseAggregateAll: canFranchiseeMultiStore && storeFilter === "All",
  })

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
                    disabled={isManager ? managerStoreOptions.length === 0 : false}
                  >
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder={t("pL_store")} />
                    </SelectTrigger>
                    <SelectContent>
                      {isOffice && <SelectItem value="All">{t("all") || "All"}</SelectItem>}
                      {isOffice && (
                        <SelectItem value="본사">{t("pettyScopeOffice") || "본사"}</SelectItem>
                      )}
                      {isOffice &&
                        franchiseStoreOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      {isManager && canFranchiseeMultiStore ? (
                        <SelectItem value="All">{t("store_all_my_franchise_stores")}</SelectItem>
                      ) : null}
                      {isManager &&
                        managerStoreOptions.map((s) => (
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
              {fetchError && (
                <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {fetchError}
                </p>
              )}
              {showBalanceCompareTable && (
                <div className="w-full">
                  <div className={`${accountingFsDocumentCn} space-y-4`}>
                    <div className="space-y-2 border-b border-border/50 pb-4">
                      <div className={accountingFsTitleCn}>{t("adminBalanceSheet")}</div>
                      <AccountingPeriodChip>
                        {yearMonthStart === yearMonthEnd
                          ? yearMonthEnd
                          : `${yearMonthStart} ~ ${yearMonthEnd}`}{" "}
                        · {storeLabel}
                      </AccountingPeriodChip>
                    </div>
                    {periodRangeTruncated && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
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
                    {balanceCompareCols.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t("inNoData") || "No data found."}
                      </p>
                    ) : (
                      <div className={accountingBsCompareShellCn}>
                        <table className="w-full min-w-max text-sm border-collapse">
                          <thead>
                            <tr className={accountingBsCompareTheadCn}>
                              <th className={accountingBsCompareThStickyCn}>{t("pL_colItem")}</th>
                              {balanceCompareCols.map((c) => (
                                <th key={c.key} className={accountingBsCompareThColCn}>
                                  <div>{c.label}</div>
                                  {"sub" in c && c.sub ? (
                                    <div className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground font-sans">
                                      ({String(c.sub)})
                                    </div>
                                  ) : null}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {balanceCompareMetricRows.map((row) => {
                              const isTotal =
                                row.key === "assets" || row.key === "liab" || row.key === "eq"
                              return (
                                <tr
                                  key={row.key}
                                  className={`border-b border-border/40 transition-colors hover:bg-muted/25 last:border-0 ${
                                    isTotal ? accountingBsCompareTotalRowCn : ""
                                  }`}
                                >
                                  <td className={accountingBsCompareTdStickyCn}>{row.label}</td>
                                  {balanceCompareCols.map((c) => {
                                    const m = c.metrics
                                    const v = m ? row.pick(m) : null
                                    const isChk = row.key === "chk"
                                    const ok = v != null && Math.abs(v) < 1
                                    return (
                                      <td
                                        key={c.key}
                                        className={`${accountingBsCompareTdAmountCn} ${
                                          isChk && v != null && !ok ? "text-amber-800 font-semibold" : ""
                                        } ${isChk && v != null && ok ? "text-emerald-700 font-semibold" : ""}`}
                                      >
                                        {v == null || m == null ? "—" : formatBaht(v)}
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
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

              {!isRangeCompare && isBalanceSheetData(data) ? (
                <div className="w-full">
                  <div className={`${accountingFsDocumentCn} space-y-5`}>
                    <div className="space-y-2 border-b border-border/50 pb-4">
                      <div className={accountingFsTitleCn}>{t("adminBalanceSheet")}</div>
                      <AccountingPeriodChip>
                        {data.yearMonth} · {storeLabel}
                      </AccountingPeriodChip>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className={`${accountingBsSectionCardCn} ${accountingBsSectionAccentClass("assets")}`}>
                        <div className={accountingBsSectionTitleCn}>{t("bs_assets")}</div>
                        <div className="flex-1 space-y-0.5">
                          <div className={accountingBsLineRowCn}>
                            <span className={accountingBsLineLabelCn}>{t("bs_cashAndBanks")}</span>
                            <span className={accountingBsLineValueCn}>{formatBaht(data.assets.cashAndBanks)}</span>
                          </div>
                          <div className={accountingBsLineRowCn}>
                            <span className={accountingBsLineLabelCn}>{t("bs_inventory")}</span>
                            <span className={accountingBsLineValueCn}>{formatBaht(data.assets.inventory)}</span>
                          </div>
                          <div className={accountingBsLineRowCn}>
                            <span className={accountingBsLineLabelCn}>{t("bs_receivables")}</span>
                            <span className={accountingBsLineValueCn}>{formatBaht(data.assets.receivables)}</span>
                          </div>
                          {data.ledgerBreakdown ? (
                            <>
                              <div className={accountingBsSubLineRowCn}>
                                <span className={accountingBsSubLineLabelCn}>{t("bs_receivablesGl1130")}</span>
                                <span className={accountingBsSubLineValueCn}>
                                  {formatBaht(data.ledgerBreakdown.glAccount1130)}
                                </span>
                              </div>
                              <div className={accountingBsSubLineRowCn}>
                                <span className={accountingBsSubLineLabelCn}>{t("bs_receivablesSubledger")}</span>
                                <span className={accountingBsSubLineValueCn}>
                                  {formatBaht(data.ledgerBreakdown.subledgerReceivables)}
                                </span>
                              </div>
                            </>
                          ) : null}
                        </div>
                        <div className={accountingBsTotalRowCn}>
                          <span>{t("bs_total")}</span>
                          <span className="font-mono tabular-nums">{formatBaht(data.assets.total)}</span>
                        </div>
                      </div>

                      <div className={`${accountingBsSectionCardCn} ${accountingBsSectionAccentClass("liabilities")}`}>
                        <div className={accountingBsSectionTitleCn}>{t("bs_liabilities")}</div>
                        <div className="flex-1 space-y-0.5">
                          <div className={accountingBsLineRowCn}>
                            <span className={accountingBsLineLabelCn}>{t("bs_payables")}</span>
                            <span className={accountingBsLineValueCn}>{formatBaht(data.liabilities.payables)}</span>
                          </div>
                          {data.ledgerBreakdown ? (
                            <>
                              <div className={accountingBsSubLineRowCn}>
                                <span className={accountingBsSubLineLabelCn}>{t("bs_payablesGl2110")}</span>
                                <span className={accountingBsSubLineValueCn}>
                                  {formatBaht(data.ledgerBreakdown.glAccount2110)}
                                </span>
                              </div>
                              <div className={accountingBsSubLineRowCn}>
                                <span className={accountingBsSubLineLabelCn}>{t("bs_payablesSubledger")}</span>
                                <span className={accountingBsSubLineValueCn}>
                                  {formatBaht(data.ledgerBreakdown.subledgerPayables)}
                                </span>
                              </div>
                            </>
                          ) : null}
                        </div>
                        <div className={accountingBsTotalRowCn}>
                          <span>{t("bs_total")}</span>
                          <span className="font-mono tabular-nums">{formatBaht(data.liabilities.total)}</span>
                        </div>
                      </div>

                      <div className={`${accountingBsSectionCardCn} ${accountingBsSectionAccentClass("equity")}`}>
                        <div className={accountingBsSectionTitleCn}>{t("bs_equity")}</div>
                        <div className="flex-1 space-y-0.5">
                          <div className={accountingBsLineRowCn}>
                            <span className={accountingBsLineLabelCn}>{t("bs_openingCapital")}</span>
                            <span className={accountingBsLineValueCn}>{formatBaht(data.equity.openingCapital)}</span>
                          </div>
                          <div className={accountingBsLineRowCn}>
                            <span className={accountingBsLineLabelCn}>{t("bs_currentPeriodProfit")}</span>
                            <span className={accountingBsLineValueCn}>
                              {formatBaht(data.equity.currentPeriodProfit)}
                            </span>
                          </div>
                          <div className={accountingBsLineRowCn}>
                            <span className={accountingBsLineLabelCn}>{t("bs_retainedEarningsYtd")}</span>
                            <span className={accountingBsLineValueCn}>
                              {formatBaht(data.equity.retainedEarningsYtd)}
                            </span>
                          </div>
                        </div>
                        <div className={accountingBsTotalRowCn}>
                          <span>{t("bs_total")}</span>
                          <span className="font-mono tabular-nums">{formatBaht(data.equity.total)}</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={
                        Math.abs(data.balanceCheckDiff) < 1
                          ? accountingBsBalanceCheckOkCn
                          : accountingBsBalanceCheckWarnCn
                      }
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{t("bs_balanceCheck")}</span>
                        <span className="font-mono text-base font-bold tabular-nums">
                          {formatBaht(data.balanceCheckDiff)}
                        </span>
                      </div>
                    </div>

                    {data.unpostedBankWithdrawals && data.unpostedBankWithdrawals.length > 0 && (
                      <div className="rounded-xl border border-amber-300/70 bg-gradient-to-br from-amber-50/80 via-amber-50/50 to-amber-50/80 px-4 py-4 text-sm shadow-sm dark:from-amber-950/30 dark:via-amber-950/20 dark:to-amber-950/30">
                        <div className="mb-3 font-semibold text-amber-900 dark:text-amber-100">
                          {t("bs_unpostedWithdrawals")} ({data.unpostedBankWithdrawals.length}건, 합계{" "}
                          {formatBaht(data.unpostedBankWithdrawals.reduce((s, x) => s + x.amount, 0))})
                        </div>
                        <div className="overflow-hidden rounded-lg border border-amber-200/80 bg-white/60 dark:bg-background/40">
                          <div className="max-h-48 overflow-x-auto overflow-y-auto text-xs text-amber-900 dark:text-amber-100">
                            <table className="w-full min-w-[320px] border-collapse">
                              <thead>
                                <tr className="border-b border-amber-200/80 bg-amber-100/50 dark:bg-amber-950/30">
                                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">
                                    {t("date")}
                                  </th>
                                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                                    {t("amount")}
                                  </th>
                                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">
                                    {t("visit_col_purpose")}
                                  </th>
                                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide min-w-0">
                                    {t("memo")}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.unpostedBankWithdrawals.map((row) => (
                                  <tr
                                    key={row.id}
                                    className="border-b border-amber-100/80 last:border-0 transition-colors hover:bg-amber-50/60"
                                  >
                                    <td className="px-3 py-2 whitespace-nowrap">{row.transDate}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                                      {formatBaht(row.amount)}
                                    </td>
                                    <td className="px-3 py-2 text-amber-800 dark:text-amber-200">{row.category}</td>
                                    <td
                                      className="px-3 py-2 truncate max-w-[180px]"
                                      title={row.memo ?? row.store ?? ""}
                                    >
                                      {getMemo(row.memo ?? undefined, row.store ?? undefined)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">{t("bs_unpostedWithdrawalsHint")}</p>
                      </div>
                    )}
                  </div>
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
