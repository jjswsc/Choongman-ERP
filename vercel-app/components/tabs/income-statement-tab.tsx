"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronRight, FileDown, Search, Table } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getIncomeStatement,
  getIncomeStatementPurchaseDrillDown,
  isIncomeStatementData,
  saveIncomeStatementOverrides,
  useStoreList,
  type IncomeStatementData,
  type IncomeStatementPurchaseDrillDown,
  fetchIncomeStatementOverrides,
} from "@/lib/api-client"
import { formatAccountSubjectLabel } from "@/lib/account-subject-display"
import { expandBangkokYearMonthsInclusive, getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  aggregateIncomeStatementByYear,
  FINANCIAL_COMPARE_MAX_MONTHS,
} from "@/lib/financial-statements-compare"
import { isMaterialHqOutboundOrderDiff } from "@/lib/income-statement-hq-diff"
import { useAuth } from "@/lib/auth-context"
import {
  buildFinancialStatementFranchiseStoreOptions,
  isFinancialStatementStoreNone,
  resolveFinancialStatementStoreLabel,
} from "@/lib/financial-statement-store-options"
import { isAccountingRole, isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { canFranchiseeAggregateAllowedStores } from "@/lib/franchisee-multi-store"
import { useStoreView } from "@/lib/store-view-context"
import {
  readIncomeStatementBeginningInvOverride,
  writeIncomeStatementBeginningInvOverride,
} from "@/lib/income-statement-beginning-inv-override"
import {
  readIncomeStatementOverrideSource,
  writeIncomeStatementOverrideSource,
  type IncomeStatementOverrideSource,
} from "@/lib/income-statement-override-source"
import {
  readIncomeStatementSalesOverride,
  writeIncomeStatementSalesOverride,
  parseSalesOverrideInput,
} from "@/lib/income-statement-sales-override"
import {
  downloadIncomeStatementXlsx,
  sanitizeFilenamePart,
  type IncomeStatementXlsxRow,
} from "@/lib/income-statement-export"
import { formatBahtInteger as formatBath, roundFinancialAmount } from "@/lib/financial-amount-format"
import {
  AccountingEmptyState,
  AccountingPeriodChip,
} from "@/components/admin/accounting-result-primitives"
import {
  buildIncomeStatementViewNumbers,
  pickFranchiseBillingVatAmount,
  readIncomeStatementDisplayPrefs,
  writeIncomeStatementDisplayPrefs,
  type IncomeStatementVatDisplayMode,
} from "@/lib/income-statement-display"
import {
  lineDisplayAmount,
  purchaseVendorRowLabel,
  purchaseVendorLabelForKey,
  purchaseAmountForVendor,
  incomeStatementSalesBreakdown,
  salesBreakdownIsDaily,
  salesBreakdownIsHqOutbound,
  salesBreakdownRowLabel,
  salesAmountForBreakdownKey,
  mergeSalesBreakdownKeysForCompare,
  mergePurchaseVendorKeysForCompare,
  expenseAmountForSubject,
  mergeExpenseSubjectsForCompare,
  yearlyPurchaseVendorAmount,
  yearlySalesBreakdownAmount,
  yearlyExpenseSubjectAmount,
  yearlyExpenseBreakdownField,
} from "./income-statement-tab-utils"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { IncomePlDetailTableContent } from "./income-statement-pl-detail"
import { IncomePurchaseDrillDialog } from "./income-statement-purchase-drill-dialog"

function mapIncomeStatementOverrideSaveError(err: string | undefined, t: (k: string) => string): string {
  const c = String(err || "").trim()
  if (!c) return t("pL_overrideSharedErr")
  if (c.includes("STORE_SCOPE_FORBIDDEN")) return t("pL_overrideErrStoreScope")
  if (c === "FORBIDDEN" || c.includes("ACCOUNTING_FORBIDDEN")) return t("pL_overrideErrForbidden")
  return c
}

function formatOverrideSavedClockBangkok(ms: number, lang: string): string {
  const loc = lang === "ko" ? "ko-KR" : "en-GB"
  return new Date(ms).toLocaleTimeString(loc, {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function incomeMetricsForCompare(
  d: IncomeStatementData | undefined,
  vatMode: IncomeStatementVatDisplayMode
) {
  if (!isIncomeStatementData(d) || d.error) return null
  const v = buildIncomeStatementViewNumbers({ data: d, vatMode })
  return {
    sales: v.sales,
    purchases: v.purchases,
    cogs: v.cogs,
    grossProfit: v.grossProfit,
    expenses: v.expenses,
    netProfit: v.netProfit,
    ebitda: v.ebitda,
  }
}

type IncomeStatementTabProps = {
  /** @deprecated 시작·종료월을 쓰세요. 있으면 시작=종료로 동기화 */
  yearMonth?: string
  yearMonthStart?: string
  yearMonthEnd?: string
  storeFilter?: string
  hideControls?: boolean
  queryToken?: number
}

export function IncomeStatementTab(props: IncomeStatementTabProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
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
  /** 상위 재무제표 페이지가 필터를 제어할 때는 props를 즉시 반영(로컬 state 1틱 지연 방지) */
  const parentControlsQuery = Boolean(props.hideControls)
  const queryYearMonthStart = parentControlsQuery
    ? (props.yearMonthStart ?? props.yearMonth ?? yearMonthStart)
    : yearMonthStart
  const queryYearMonthEnd = parentControlsQuery
    ? (props.yearMonthEnd ?? props.yearMonth ?? yearMonthEnd)
    : yearMonthEnd
  const queryStoreFilter =
    parentControlsQuery && props.storeFilter != null ? props.storeFilter : storeFilter
  const [data, setData] = React.useState<IncomeStatementData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showExpenseDetails, setShowExpenseDetails] = React.useState(false)
  const [displayPrefs, setDisplayPrefs] = React.useState(() => readIncomeStatementDisplayPrefs())
  const vatDisplayMode = displayPrefs.vatMode
  const showEbitda = displayPrefs.showEbitda
  const [expandSales, setExpandSales] = React.useState(false)
  const [expandPurchases, setExpandPurchases] = React.useState(false)
  const [expandExpenseAccounts, setExpandExpenseAccounts] = React.useState(false)
  const [compareUnifiedExpandSales, setCompareUnifiedExpandSales] = React.useState(false)
  const [compareUnifiedExpandPurchases, setCompareUnifiedExpandPurchases] = React.useState(false)
  const [compareUnifiedExpandExpenses, setCompareUnifiedExpandExpenses] = React.useState(false)
  const [compareDrillOpen, setCompareDrillOpen] = React.useState(false)
  const [compareDrillLoading, setCompareDrillLoading] = React.useState(false)
  const [compareDrillData, setCompareDrillData] = React.useState<IncomeStatementPurchaseDrillDown | null>(null)
  const [compareDrillTitle, setCompareDrillTitle] = React.useState("")
  const [manualEnabled, setManualEnabled] = React.useState(false)
  const [manualAmountStr, setManualAmountStr] = React.useState("")
  const [begInvManualEnabled, setBegInvManualEnabled] = React.useState(false)
  const [begInvAmountStr, setBegInvAmountStr] = React.useState("")
  const [exportingPdf, setExportingPdf] = React.useState(false)
  const [overrideSource, setOverrideSource] = React.useState<IncomeStatementOverrideSource>(() =>
    readIncomeStatementOverrideSource()
  )
  const [sharedLoading, setSharedLoading] = React.useState(false)
  const [sharedReady, setSharedReady] = React.useState(false)
  const [sharedSaveError, setSharedSaveError] = React.useState<string | null>(null)
  const [overridePersistAt, setOverridePersistAt] = React.useState<number | null>(null)
  const [overrideSaveBusy, setOverrideSaveBusy] = React.useState(false)
  const [overrideButtonHint, setOverrideButtonHint] = React.useState<string | null>(null)
  const overridePersistBumpTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleOverridePersistBump = React.useCallback(() => {
    if (overridePersistBumpTimer.current) clearTimeout(overridePersistBumpTimer.current)
    overridePersistBumpTimer.current = setTimeout(() => {
      overridePersistBumpTimer.current = null
      setOverridePersistAt(Date.now())
    }, 450)
  }, [])

  React.useEffect(
    () => () => {
      if (overridePersistBumpTimer.current) clearTimeout(overridePersistBumpTimer.current)
    },
    []
  )

  const printRef = React.useRef<HTMLDivElement | null>(null)

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

  React.useEffect(() => {
    setExpandSales(false)
    setExpandPurchases(false)
    setExpandExpenseAccounts(false)
  }, [yearMonthStart, yearMonthEnd, storeFilter])

  React.useEffect(() => {
    writeIncomeStatementOverrideSource(overrideSource)
  }, [overrideSource])

  React.useEffect(() => {
    let cancelled = false
    if (overrideSource === "local") {
      setSharedLoading(false)
      setSharedReady(true)
      const s = readIncomeStatementSalesOverride(yearMonthEnd, storeFilter)
      if (s?.enabled) {
        setManualEnabled(true)
        setManualAmountStr(String(s.amount))
      } else {
        setManualEnabled(false)
        setManualAmountStr("")
      }
      const b = readIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter)
      if (b?.enabled) {
        setBegInvManualEnabled(true)
        setBegInvAmountStr(String(b.amount))
      } else {
        setBegInvManualEnabled(false)
        setBegInvAmountStr("")
      }
      return () => {
        cancelled = true
      }
    }

    setSharedReady(false)
    setSharedLoading(true)
    setSharedSaveError(null)

    void fetchIncomeStatementOverrides({
      yearMonth: yearMonthEnd,
      storeFilter,
      userStore: auth?.store,
      userRole: auth?.role,
    }).then((r) => {
      if (cancelled) return
      if (!r.success || !r.row) {
        setSharedSaveError(r.error || "LOAD_FAILED")
        setManualEnabled(false)
        setManualAmountStr("")
        setBegInvManualEnabled(false)
        setBegInvAmountStr("")
        setSharedLoading(false)
        setSharedReady(true)
        return
      }
      const row = r.row
      setManualEnabled(row.sales_override_enabled)
      setManualAmountStr(row.sales_override_enabled ? String(row.sales_override_amount) : "")
      setBegInvManualEnabled(row.beginning_inv_override_enabled)
      setBegInvAmountStr(
        row.beginning_inv_override_enabled ? String(row.beginning_inv_override_amount) : ""
      )
      setSharedLoading(false)
      setSharedReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [overrideSource, yearMonthEnd, storeFilter, auth?.store, auth?.role])

  React.useEffect(() => {
    if (overrideSource !== "local") return
    if (!manualEnabled) {
      writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, false, 0)
      scheduleOverridePersistBump()
      return
    }
    const p = parseSalesOverrideInput(manualAmountStr)
    if (p == null) return
    writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, true, p)
    scheduleOverridePersistBump()
  }, [overrideSource, yearMonthEnd, storeFilter, manualEnabled, manualAmountStr, scheduleOverridePersistBump])

  React.useEffect(() => {
    if (overrideSource !== "local") return
    if (!begInvManualEnabled) {
      writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, false, 0)
      scheduleOverridePersistBump()
      return
    }
    const p = parseSalesOverrideInput(begInvAmountStr)
    if (p == null) return
    writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, true, p)
    scheduleOverridePersistBump()
  }, [overrideSource, yearMonthEnd, storeFilter, begInvManualEnabled, begInvAmountStr, scheduleOverridePersistBump])

  React.useEffect(() => {
    if (overrideSource !== "shared" || !sharedReady || sharedLoading) return
    if (manualEnabled && parseSalesOverrideInput(manualAmountStr) == null) return
    if (begInvManualEnabled && parseSalesOverrideInput(begInvAmountStr) == null) return

    const salesAmt = parseSalesOverrideInput(manualAmountStr) ?? 0
    const begAmt = parseSalesOverrideInput(begInvAmountStr) ?? 0
    const salesOn = manualEnabled && parseSalesOverrideInput(manualAmountStr) != null
    const begOn = begInvManualEnabled && parseSalesOverrideInput(begInvAmountStr) != null

    const h = setTimeout(() => {
      void saveIncomeStatementOverrides({
        yearMonth: yearMonthEnd,
        storeFilter,
        userStore: auth?.store,
        userRole: auth?.role,
        updatedBy: auth?.user,
        salesOverrideEnabled: salesOn,
        salesOverrideAmount: salesOn ? salesAmt : 0,
        beginningInvOverrideEnabled: begOn,
        beginningInvOverrideAmount: begOn ? begAmt : 0,
      }).then((r) => {
        if (!r.success) setSharedSaveError(r.error || "SAVE_FAILED")
        else {
          setSharedSaveError(null)
          scheduleOverridePersistBump()
        }
      })
    }, 750)
    return () => clearTimeout(h)
  }, [
    overrideSource,
    sharedReady,
    sharedLoading,
    yearMonthEnd,
    storeFilter,
    manualEnabled,
    manualAmountStr,
    begInvManualEnabled,
    begInvAmountStr,
    auth?.store,
    auth?.role,
    auth?.user,
    scheduleOverridePersistBump,
  ])

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

  const [compareIncomeRows, setCompareIncomeRows] = React.useState<
    { ym: string; data: IncomeStatementData }[]
  >([])
  const [compareFetchError, setCompareFetchError] = React.useState<string | null>(null)
  const [compareGranularity, setCompareGranularity] = React.useState<"month" | "year">("month")
  const [incomeCompareFetchId, setIncomeCompareFetchId] = React.useState(0)
  const incomeFetchSeqRef = React.useRef(0)

  React.useEffect(() => {
    setCompareUnifiedExpandSales(false)
    setCompareUnifiedExpandPurchases(false)
    setCompareUnifiedExpandExpenses(false)
  }, [incomeCompareFetchId])

  const runIncomeFetch = React.useCallback(() => {
    const fetchSeq = ++incomeFetchSeqRef.current
    if (isFinancialStatementStoreNone(queryStoreFilter)) {
      setLoading(false)
      setData(null)
      setCompareIncomeRows([])
      setCompareFetchError(t("salesSelectStoreHint") || "매장을 선택하세요.")
      return
    }
    const sf = queryStoreFilter !== "All" ? queryStoreFilter : undefined
    const months = periodMonths
    setCompareFetchError(null)

    const emptyIncomeOnFetchError = (ym: string, message: string): IncomeStatementData => ({
      yearMonth: ym,
      startStr: "",
      endStr: "",
      storeFilter: sf ?? "All",
      sales: 0,
      purchases: 0,
      expenses: 0,
      grossProfit: 0,
      netProfit: 0,
      error: message,
    })

    if (months.length <= 1) {
      const ym = months[0] ?? queryYearMonthEnd
      setLoading(true)
      setCompareIncomeRows([])
      getIncomeStatement({
        yearMonth: ym,
        storeFilter: sf,
        userStore: auth?.store,
        userRole: auth?.role,
        includeDebug: showExpenseDetails,
      })
        .then((r) => {
          if (fetchSeq !== incomeFetchSeqRef.current) return
          setData(r)
        })
        .catch((e) => {
          if (fetchSeq !== incomeFetchSeqRef.current) return
          setData(
            emptyIncomeOnFetchError(
              ym,
              e instanceof Error ? e.message : String(e || "FETCH_FAILED")
            )
          )
        })
        .finally(() => {
          if (fetchSeq !== incomeFetchSeqRef.current) return
          setLoading(false)
        })
      return
    }

    setLoading(true)
    setData(null)
    Promise.all(
      months.map(async (ym) => {
        try {
          const row = await getIncomeStatement({
            yearMonth: ym,
            storeFilter: sf,
            userStore: auth?.store,
            userRole: auth?.role,
            includeDebug: showExpenseDetails,
          })
          return { ym, data: row }
        } catch (e) {
          return {
            ym,
            data: emptyIncomeOnFetchError(
              ym,
              e instanceof Error ? e.message : String(e || "FETCH_FAILED")
            ),
          }
        }
      })
    )
      .then((rows) => {
        if (fetchSeq !== incomeFetchSeqRef.current) return
        const ok = rows.filter((r) => isIncomeStatementData(r.data))
        setCompareIncomeRows(ok)
        const err = rows
          .map((r) => (r.data as IncomeStatementData | undefined)?.error)
          .find((m) => typeof m === "string" && m.trim())
        setCompareFetchError(err?.trim() || (ok.length === 0 ? t("inNoData") || "No data found." : null))
      })
      .catch(() => {
        if (fetchSeq !== incomeFetchSeqRef.current) return
        setCompareIncomeRows([])
        setCompareFetchError(t("inNoData") || "No data found.")
      })
      .finally(() => {
        if (fetchSeq !== incomeFetchSeqRef.current) return
        setIncomeCompareFetchId((x) => x + 1)
        setLoading(false)
      })
  }, [
    periodMonths,
    queryStoreFilter,
    auth?.store,
    auth?.role,
    showExpenseDetails,
    queryYearMonthEnd,
    t,
  ])

  const runIncomeFetchRef = React.useRef(runIncomeFetch)
  runIncomeFetchRef.current = runIncomeFetch

  React.useEffect(() => {
    if (!props.hideControls) return
    // 부모(재무제표) queryToken: 0=미검색. 검색 버튼으로만 조회.
    if (props.queryToken == null || props.queryToken <= 0) return
    runIncomeFetchRef.current()
  }, [props.hideControls, props.queryToken])

  const loadData = React.useCallback(() => {
    runIncomeFetch()
  }, [runIncomeFetch])

  const incomeYearCompare = React.useMemo(
    () => aggregateIncomeStatementByYear(compareIncomeRows),
    [compareIncomeRows]
  )

  const compareYearHqOutboundDiagnostics = React.useMemo(
    () => incomeYearCompare.filter((y) => y.purchaseHqOutboundBasis != null),
    [incomeYearCompare]
  )

  const showIncomeCompareTable =
    isRangeCompare && !loading && compareIncomeRows.length > 0

  type IncomeCompareMetrics = NonNullable<ReturnType<typeof incomeMetricsForCompare>>

  const incomeComparePlRows = React.useMemo(
    () => [
      { key: "sales", label: t("pL_sales"), pick: (m: IncomeCompareMetrics) => m.sales },
      { key: "purchases", label: t("pL_purchases"), pick: (m: IncomeCompareMetrics) => m.purchases },
      { key: "cogs", label: t("pL_cogs"), pick: (m: IncomeCompareMetrics) => m.cogs },
      { key: "gross", label: t("pL_grossProfit"), pick: (m: IncomeCompareMetrics) => m.grossProfit },
      { key: "expenses", label: t("pL_expenses"), pick: (m: IncomeCompareMetrics) => m.expenses },
      { key: "net", label: t("pL_netProfit"), pick: (m: IncomeCompareMetrics) => m.netProfit },
      ...(showEbitda
        ? [{ key: "ebitda", label: t("pL_ebitda"), pick: (m: IncomeCompareMetrics) => m.ebitda ?? 0 }]
        : []),
    ],
    [t, showEbitda]
  )

  const incomeCompareCols = React.useMemo(() => {
    if (compareGranularity === "month") {
      return compareIncomeRows.map(({ ym, data }) => ({
        key: ym,
        label: ym,
        metrics: incomeMetricsForCompare(data, vatDisplayMode),
      }))
    }
    const years = [...new Set(compareIncomeRows.map((r) => r.ym.slice(0, 4)))].sort()
    return years.map((year) => {
      const rows = compareIncomeRows.filter((r) => r.ym.startsWith(year))
      const agg = {
        sales: 0,
        purchases: 0,
        cogs: 0,
        grossProfit: 0,
        expenses: 0,
        netProfit: 0,
        ebitda: 0,
      }
      let hasEbitda = false
      for (const { data: rowData } of rows) {
        const m = incomeMetricsForCompare(rowData, vatDisplayMode)
        if (!m) continue
        agg.sales += m.sales
        agg.purchases += m.purchases
        agg.cogs += m.cogs
        agg.grossProfit += m.grossProfit
        agg.expenses += m.expenses
        agg.netProfit += m.netProfit
        if (m.ebitda != null) {
          hasEbitda = true
          agg.ebitda += m.ebitda
        }
      }
      return {
        key: year,
        label: year,
        metrics: {
          ...agg,
          ebitda: hasEbitda ? agg.ebitda : null,
        } satisfies IncomeCompareMetrics,
      }
    })
  }, [compareGranularity, compareIncomeRows, vatDisplayMode])

  const compareMergedPurchaseVendors = React.useMemo(
    () => mergePurchaseVendorKeysForCompare(compareIncomeRows),
    [compareIncomeRows]
  )

  const compareMergedSalesBreakdown = React.useMemo(
    () => mergeSalesBreakdownKeysForCompare(compareIncomeRows),
    [compareIncomeRows]
  )
  const compareSalesBreakdownDaily = React.useMemo(
    () => compareIncomeRows.some(({ data }) => salesBreakdownIsDaily(data)),
    [compareIncomeRows]
  )

  const compareMergedExpenseSubjects = React.useMemo(
    () => mergeExpenseSubjectsForCompare(compareIncomeRows),
    [compareIncomeRows]
  )

  const compareMergedOverlapKeys = React.useMemo(() => {
    const s = new Set<string>()
    for (const { data } of compareIncomeRows) {
      for (const k of data.diagnostics?.purchaseInboundBankOverlapVendorKeys || []) s.add(k)
    }
    return [...s].sort()
  }, [compareIncomeRows])

  /** 기간 내 월별 — 본사 출고 vs 승인 발주 진단 */
  const compareMonthHqOutboundDiagnostics = React.useMemo(() => {
    return compareIncomeRows
      .filter(({ data }) => !data.error && data.diagnostics?.purchaseHqOutboundBasis != null)
      .map(({ ym, data }) => ({
        ym,
        basis: data.diagnostics!.purchaseHqOutboundBasis!,
      }))
  }, [compareIncomeRows])

  /** 기간 전체 — 본사 유형 통장 매입지급 제외액을 거래처별 합산 */
  const compareMergedExcludedHqBank = React.useMemo(() => {
    const byKey = new Map<string, { amount: number; label?: string }>()
    for (const { data } of compareIncomeRows) {
      if (data.error) continue
      for (const row of data.diagnostics?.purchaseExcludedHqBankPayments || []) {
        const prev = byKey.get(row.key)
        byKey.set(row.key, {
          amount: (prev?.amount ?? 0) + row.amount,
          label: row.label || prev?.label,
        })
      }
    }
    return [...byKey.entries()]
      .map(([key, v]) => ({ key, amount: v.amount, label: v.label }))
      .sort((a, b) => b.amount - a.amount)
  }, [compareIncomeRows])

  const compareMonthHqOutboundAnyMaterial = React.useMemo(
    () =>
      compareMonthHqOutboundDiagnostics.some(({ basis }) => isMaterialHqOutboundOrderDiff(basis)),
    [compareMonthHqOutboundDiagnostics]
  )

  const compareMergedWarnings = React.useMemo(() => {
    const lines = new Set<string>()
    for (const { data } of compareIncomeRows) {
      for (const w of data.diagnostics?.warnings || []) lines.add(w)
    }
    return [...lines]
  }, [compareIncomeRows])

  const openComparePurchaseDrill = React.useCallback(
    (ym: string, row: { key: string; label?: string }) => {
      setCompareDrillTitle(purchaseVendorRowLabel(row, t))
      setCompareDrillOpen(true)
      setCompareDrillLoading(true)
      setCompareDrillData(null)
      void getIncomeStatementPurchaseDrillDown({
        yearMonth: ym,
        storeFilter: storeFilter !== "All" ? storeFilter : undefined,
        userStore: auth?.store,
        userRole: auth?.role,
        vendorKey: row.key,
      })
        .then((d) => setCompareDrillData(d))
        .finally(() => setCompareDrillLoading(false))
    },
    [storeFilter, auth?.store, auth?.role, t]
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

  const view = React.useMemo(() => {
    if (!isIncomeStatementData(data) || data.error) return null
    const parsedSales = parseSalesOverrideInput(manualAmountStr)
    const useManualSales = manualEnabled && parsedSales != null
    const parsedBeg = parseSalesOverrideInput(begInvAmountStr)
    const useManualBegInv = begInvManualEnabled && parsedBeg != null
    const sysBeg = data.beginningInventory ?? 0

    const nums = buildIncomeStatementViewNumbers({
      data,
      vatMode: vatDisplayMode,
      manualSales: useManualSales ? parsedSales : null,
      manualBeginningInventory: useManualBegInv ? parsedBeg : null,
    })
    const pctBase = nums.sales > 0 ? nums.sales : 0
    const pct = (n: number) => (pctBase > 0 ? `${((n / pctBase) * 100).toFixed(1)}%` : "—")
    return {
      ...nums,
      pct,
      useManualSales,
      systemSales: data.sales,
      useManualBegInv,
      systemBeginningInventory: sysBeg,
    }
  }, [
    data,
    manualEnabled,
    manualAmountStr,
    begInvManualEnabled,
    begInvAmountStr,
    vatDisplayMode,
  ])

  const storeLabel = resolveFinancialStatementStoreLabel(storeFilter, storeLabels, t, {
    franchiseAggregateAll: canFranchiseeMultiStore && storeFilter === "All",
  })

  const buildXlsxRows = React.useCallback((): IncomeStatementXlsxRow[] => {
    if (!data || !view) return []
    const q = roundFinancialAmount
    const rows: IncomeStatementXlsxRow[] = []
    rows.push({ label: t("pL_sales"), amount: q(view.sales), pct: "100.0%" })
    if (incomeStatementSalesBreakdown(data).length > 0) {
      const daily = salesBreakdownIsDaily(data)
      for (const row of incomeStatementSalesBreakdown(data)) {
        rows.push({
          label: `      ${salesBreakdownRowLabel(row, t, daily)}`,
          amount: q(
            lineDisplayAmount(
              row,
              vatDisplayMode,
              salesBreakdownIsHqOutbound(data) ? data.displayAmounts?.salesStockVatBuckets : null,
              data.displayAmounts
            )
          ),
          pct: view.pct(
            lineDisplayAmount(
              row,
              vatDisplayMode,
              salesBreakdownIsHqOutbound(data) ? data.displayAmounts?.salesStockVatBuckets : null,
              data.displayAmounts
            )
          ),
        })
      }
    }
    rows.push({
      label: `  + ${t("pL_beginningInv")}`,
      amount: q(view.beginningInventory),
      pct: view.pct(view.beginningInventory),
    })
    rows.push({
      label: `  + ${t("pL_purchases")}`,
      amount: q(view.purchases),
      pct: view.pct(view.purchases),
    })
    if ((data.purchaseByVendor?.length || 0) > 0) {
      for (const row of data.purchaseByVendor!) {
        rows.push({
          label: `      ${purchaseVendorRowLabel(row, t)}`,
          amount: q(
            lineDisplayAmount(row, vatDisplayMode, data.displayAmounts?.purchasesStockVatBuckets)
          ),
          pct: view.pct(
            lineDisplayAmount(row, vatDisplayMode, data.displayAmounts?.purchasesStockVatBuckets)
          ),
        })
      }
    }
    rows.push({
      label: `  - ${t("pL_endingInv")}`,
      amount: q(view.endingInventory),
      pct: view.pct(-view.endingInventory),
    })
    rows.push({
      label: `= ${t("pL_cogs")}`,
      amount: q(view.cogs),
      pct: view.pct(view.cogs),
    })
    rows.push({
      label: t("pL_grossProfit"),
      amount: q(view.grossProfit),
      pct: view.pct(view.grossProfit),
    })
    rows.push({
      label: `- ${t("pL_expenses")}`,
      amount: q(view.expenses),
      pct: view.pct(view.expenses),
    })
    if ((data.expenseByAccountSubject?.length || 0) > 0) {
      for (const row of data.expenseByAccountSubject!) {
        const label =
          row.accountSubjectId == null
            ? t("pL_accountUnclassified") || "Unclassified account"
            : formatAccountSubjectLabel(lang, {
                code: row.code,
                name: row.name,
                nameEn: row.nameEn,
                nameTh: row.nameTh,
              }) || (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")
        rows.push({
          label: `      ${label}`,
          amount: q(row.amount),
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `    - ${t("pL_expenseSourcePetty") || "Petty Cash"}`,
      amount: q(data.expenseBreakdown?.pettyCash ?? 0),
      pct: view.pct(data.expenseBreakdown?.pettyCash ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceBank") || "Bank Withdrawal"}`,
      amount: q(data.expenseBreakdown?.bankWithdraw ?? 0),
      pct: view.pct(data.expenseBreakdown?.bankWithdraw ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceDeliveryApps")}`,
      amount: q(data.expenseBreakdown?.deliveryAppFees ?? 0),
      pct: view.pct(data.expenseBreakdown?.deliveryAppFees ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceCardFees")}`,
      amount: q(data.expenseBreakdown?.cardFees ?? 0),
      pct: view.pct(data.expenseBreakdown?.cardFees ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFixed") || "Fixed Cost"}`,
      amount: q(data.expenseBreakdown?.fixedExpenses ?? 0),
      pct: view.pct(data.expenseBreakdown?.fixedExpenses ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceStockInbound") || "Inbound expense items"}`,
      amount: q(data.expenseBreakdown?.stockInboundExpense ?? 0),
      pct: view.pct(data.expenseBreakdown?.stockInboundExpense ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourcePayroll") || "Payroll"}`,
      amount: q(data.expenseBreakdown?.payrollExpense ?? 0),
      pct: view.pct(data.expenseBreakdown?.payrollExpense ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceDepreciation") || "Depreciation"}`,
      amount: q(data.expenseBreakdown?.depreciationExpense ?? 0),
      pct: view.pct(data.expenseBreakdown?.depreciationExpense ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFranchiseRoyalty")}`,
      amount: q(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseRoyaltyGross ?? data.expenseBreakdown?.franchiseRoyalty,
          data.displayAmounts?.franchiseRoyaltyNet,
          vatDisplayMode
        )
      ),
      pct: view.pct(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseRoyaltyGross ?? data.expenseBreakdown?.franchiseRoyalty,
          data.displayAmounts?.franchiseRoyaltyNet,
          vatDisplayMode
        )
      ),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFranchiseDeliveryGp")}`,
      amount: q(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseDeliveryGpGross ?? data.expenseBreakdown?.franchiseDeliveryGp,
          data.displayAmounts?.franchiseDeliveryGpNet,
          vatDisplayMode
        )
      ),
      pct: view.pct(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseDeliveryGpGross ?? data.expenseBreakdown?.franchiseDeliveryGp,
          data.displayAmounts?.franchiseDeliveryGpNet,
          vatDisplayMode
        )
      ),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFranchiseGrabGp")}`,
      amount: q(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseGrabGpGross ?? data.expenseBreakdown?.franchiseGrabGp,
          data.displayAmounts?.franchiseGrabGpNet,
          vatDisplayMode
        )
      ),
      pct: view.pct(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseGrabGpGross ?? data.expenseBreakdown?.franchiseGrabGp,
          data.displayAmounts?.franchiseGrabGpNet,
          vatDisplayMode
        )
      ),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFranchiseBillingCombined")}`,
      amount: q(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseBillingCombinedGross ??
            data.expenseBreakdown?.franchiseBillingCombined,
          data.displayAmounts?.franchiseBillingCombinedNet,
          vatDisplayMode
        )
      ),
      pct: view.pct(
        pickFranchiseBillingVatAmount(
          data.displayAmounts?.franchiseBillingCombinedGross ??
            data.expenseBreakdown?.franchiseBillingCombined,
          data.displayAmounts?.franchiseBillingCombinedNet,
          vatDisplayMode
        )
      ),
    })
    rows.push({
      label: t("pL_netProfit"),
      amount: q(view.netProfit),
      pct: view.pct(view.netProfit),
    })
    if (showEbitda && view.ebitda != null) {
      if ((data.ebitdaBridge?.depreciation ?? 0) > 0) {
        rows.push({
          label: `  + ${t("pL_ebitdaDepreciation")}`,
          amount: q(data.ebitdaBridge!.depreciation),
          pct: view.pct(data.ebitdaBridge!.depreciation),
        })
      }
      if ((data.ebitdaBridge?.interest ?? 0) > 0) {
        rows.push({
          label: `  + ${t("pL_ebitdaInterest")}`,
          amount: q(data.ebitdaBridge!.interest),
          pct: view.pct(data.ebitdaBridge!.interest),
        })
      }
      if ((data.ebitdaBridge?.incomeTax ?? 0) > 0) {
        rows.push({
          label: `  + ${t("pL_ebitdaIncomeTax")}`,
          amount: q(data.ebitdaBridge!.incomeTax),
          pct: view.pct(data.ebitdaBridge!.incomeTax),
        })
      }
      rows.push({
        label: `= ${t("pL_ebitda")}`,
        amount: q(view.ebitda),
        pct: view.pct(view.ebitda),
      })
    }
    return rows
  }, [data, view, lang, t, vatDisplayMode, showEbitda])

  const handleDownloadXlsx = React.useCallback(async () => {
    if (!data || !view) return
    const headerLines = [
      t("incomeStatementTitle"),
      `${data.yearMonth} · ${storeLabel}`,
      ...(view.useManualSales
        ? [`${t("pL_systemSalesLabel")}: ${formatBath(view.systemSales)}`]
        : []),
      ...(view.useManualBegInv
        ? [`${t("pL_systemBegInvLabel")}: ${formatBath(view.systemBeginningInventory)}`]
        : []),
    ]
    const fname = `income-statement-${sanitizeFilenamePart(data.yearMonth)}-${sanitizeFilenamePart(storeFilter)}.xlsx`
    await downloadIncomeStatementXlsx(fname, headerLines, [t("pL_colItem"), t("pL_colAmount") || "Amount", t("pL_pctOfSales")], buildXlsxRows())
  }, [data, view, storeLabel, storeFilter, t, buildXlsxRows])

  const handleDownloadPdf = React.useCallback(async () => {
    const el = printRef.current
    if (!el || !data || !view) return
    setExportingPdf(true)
    /** 모바일 max-sm 카드형 CSS는 html2canvas에 그대로 잡혀 PDF가 깨짐 — 캡처 동안 테이블 레이아웃 강제 */
    const captureStyle = document.createElement("style")
    captureStyle.setAttribute("data-accounting-pdf-capture", "1")
    captureStyle.textContent = `
      .accounting-pdf-capture table { display: table !important; width: 100% !important; }
      .accounting-pdf-capture thead { display: table-header-group !important; }
      .accounting-pdf-capture tbody { display: table-row-group !important; }
      .accounting-pdf-capture tr { display: table-row !important; }
      .accounting-pdf-capture th, .accounting-pdf-capture td { display: table-cell !important; }
    `
    document.head.appendChild(captureStyle)
    el.classList.add("accounting-pdf-capture")
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ])
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      })
      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 10
      const imgW = pageW - margin * 2
      const imgH = (canvas.height * imgW) / canvas.width
      const usableH = pageH - margin * 2
      let heightLeft = imgH
      let y = margin
      pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
      heightLeft -= usableH
      while (heightLeft > 0) {
        y = margin - (imgH - heightLeft)
        pdf.addPage()
        pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
        heightLeft -= usableH
      }
      const fname = `income-statement-${sanitizeFilenamePart(data.yearMonth)}-${sanitizeFilenamePart(storeFilter)}.pdf`
      pdf.save(fname)
    } finally {
      el.classList.remove("accounting-pdf-capture")
      captureStyle.remove()
      setExportingPdf(false)
    }
  }, [data, view, storeFilter])

  const onManualCheckedChange = (checked: boolean) => {
    setManualEnabled(checked)
    if (checked && data) {
      if (overrideSource === "local") {
        const saved = readIncomeStatementSalesOverride(yearMonthEnd, storeFilter)
        setManualAmountStr(saved?.enabled ? String(saved.amount) : String(data.sales))
      } else {
        const p = parseSalesOverrideInput(manualAmountStr)
        setManualAmountStr(p != null ? String(p) : String(data.sales))
      }
    }
    if (!checked) {
      setManualAmountStr("")
    }
  }

  const handlePlOverridesSaveNow = React.useCallback(async () => {
    setOverrideButtonHint(null)
    if (manualEnabled) {
      if (!manualAmountStr.trim()) {
        setOverrideButtonHint(t("pL_overrideAmountRequiredWhenChecked"))
        return
      }
      if (parseSalesOverrideInput(manualAmountStr) == null) {
        setOverrideButtonHint(t("pL_overrideInvalidAmount"))
        return
      }
    }
    if (begInvManualEnabled) {
      if (!begInvAmountStr.trim()) {
        setOverrideButtonHint(t("pL_overrideAmountRequiredWhenChecked"))
        return
      }
      if (parseSalesOverrideInput(begInvAmountStr) == null) {
        setOverrideButtonHint(t("pL_overrideInvalidAmount"))
        return
      }
    }

    if (overrideSource === "local") {
      if (!manualEnabled) {
        writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, false, 0)
      } else {
        const p = parseSalesOverrideInput(manualAmountStr)!
        writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, true, p)
      }
      if (!begInvManualEnabled) {
        writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, false, 0)
      } else {
        const p = parseSalesOverrideInput(begInvAmountStr)!
        writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, true, p)
      }
      setOverridePersistAt(Date.now())
      return
    }

    if (sharedLoading || !sharedReady) return
    const salesAmt = parseSalesOverrideInput(manualAmountStr) ?? 0
    const begAmt = parseSalesOverrideInput(begInvAmountStr) ?? 0
    const salesOn = manualEnabled && parseSalesOverrideInput(manualAmountStr) != null
    const begOn = begInvManualEnabled && parseSalesOverrideInput(begInvAmountStr) != null

    setOverrideSaveBusy(true)
    try {
      const r = await saveIncomeStatementOverrides({
        yearMonth: yearMonthEnd,
        storeFilter,
        userStore: auth?.store,
        userRole: auth?.role,
        updatedBy: auth?.user,
        salesOverrideEnabled: salesOn,
        salesOverrideAmount: salesOn ? salesAmt : 0,
        beginningInvOverrideEnabled: begOn,
        beginningInvOverrideAmount: begOn ? begAmt : 0,
      })
      if (!r.success) {
        setSharedSaveError(r.error || "SAVE_FAILED")
        setOverrideButtonHint(mapIncomeStatementOverrideSaveError(r.error, t))
      } else {
        setSharedSaveError(null)
        setOverridePersistAt(Date.now())
      }
    } finally {
      setOverrideSaveBusy(false)
    }
  }, [
    overrideSource,
    yearMonthEnd,
    storeFilter,
    manualEnabled,
    manualAmountStr,
    begInvManualEnabled,
    begInvAmountStr,
    sharedLoading,
    sharedReady,
    auth?.store,
    auth?.role,
    auth?.user,
    t,
  ])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {!props.hideControls && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t("fs_periodStartMonth")}
                  </span>
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
                  <span className="text-xs text-muted-foreground shrink-0">~</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t("fs_periodEndMonth")}
                  </span>
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
            <Button
              size="sm"
              variant={showExpenseDetails ? "default" : "outline"}
              onClick={() => setShowExpenseDetails((v) => !v)}
            >
              {showExpenseDetails ? t("pL_expenseDetailOn") : t("pL_expenseDetailOff")}
            </Button>
            <Select
              value={vatDisplayMode}
              onValueChange={(v: IncomeStatementVatDisplayMode) => {
                const next = { ...displayPrefs, vatMode: v }
                setDisplayPrefs(next)
                writeIncomeStatementDisplayPrefs(next)
              }}
            >
              <SelectTrigger className="w-[168px] h-9" title={t("pL_vatDisplayMode")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="included">{t("pL_vatDisplayIncluded")}</SelectItem>
                <SelectItem value="excluded">{t("pL_vatDisplayExcluded")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant={showEbitda ? "default" : "outline"}
              onClick={() => {
                const next = { ...displayPrefs, showEbitda: !showEbitda }
                setDisplayPrefs(next)
                writeIncomeStatementDisplayPrefs(next)
              }}
            >
              {showEbitda ? t("pL_showEbitdaOn") : t("pL_showEbitdaOff")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || !view || loading || isRangeCompare}
              title={isRangeCompare ? t("fs_multiPeriodExportsNote") : undefined}
              onClick={handleDownloadXlsx}
            >
              <Table className="h-4 w-4 mr-1" />
              {t("pL_exportXlsx")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || !view || loading || exportingPdf || isRangeCompare}
              title={isRangeCompare ? t("fs_multiPeriodExportsNote") : undefined}
              onClick={() => void handleDownloadPdf()}
            >
              <FileDown className="h-4 w-4 mr-1" />
              {exportingPdf ? t("pL_exportBusy") : t("pL_exportPdf")}
            </Button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("loadingItems") || "Loading..."}
            </p>
          ) : (
            <>
              {showIncomeCompareTable && (
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
                  <AccountingPeriodChip>
                    {yearMonthStart === yearMonthEnd
                      ? yearMonthEnd
                      : `${yearMonthStart} ~ ${yearMonthEnd}`}{" "}
                    · {storeLabel}
                  </AccountingPeriodChip>
                  {incomeCompareCols.length === 0 ? (
                    <p
                      className={
                        compareFetchError
                          ? "text-sm text-destructive text-center py-4"
                          : "text-sm text-muted-foreground text-center py-4"
                      }
                    >
                      {compareFetchError || t("inNoData") || "No data found."}
                    </p>
                  ) : (
                    <>
                      {showExpenseDetails && compareMergedWarnings.length > 0 && (
                        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {compareMergedWarnings.join(" / ")}
                        </div>
                      )}
                      {compareMergedOverlapKeys.length > 0 && (
                        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <p className="mb-1.5 leading-relaxed">{t("pL_diagInboundBankOverlap")}</p>
                          <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                            {compareMergedOverlapKeys.map((vk) => {
                              let lbl: string | undefined
                              for (const { data } of compareIncomeRows) {
                                lbl = purchaseVendorLabelForKey(vk, data.purchaseByVendor)
                                if (lbl) break
                              }
                              return (
                                <li key={vk}>
                                  {vk}
                                  {lbl ? (
                                    <span className="text-amber-950/80 font-sans not-italic"> — {lbl}</span>
                                  ) : null}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                      {compareGranularity === "month" && compareMonthHqOutboundDiagnostics.length > 0 && (
                        <div
                          className={`rounded border px-3 py-2 text-xs overflow-x-auto ${
                            compareMonthHqOutboundAnyMaterial
                              ? "border-amber-400 bg-amber-50 text-amber-950"
                              : "border-sky-300 bg-sky-50 text-sky-950"
                          }`}
                        >
                          <p className="mb-2 font-medium leading-relaxed">{t("pL_diagHqOutboundBasis")}</p>
                          <table className="w-full text-[11px] border-collapse min-w-[280px]">
                            <thead>
                              <tr className="border-b border-sky-200/80">
                                <th className="text-left p-1.5 font-medium text-muted-foreground w-[100px]">
                                  {t("pL_colItem")}
                                </th>
                                {compareMonthHqOutboundDiagnostics.map(({ ym }) => (
                                  <th key={ym} className="text-right p-1.5 font-mono whitespace-nowrap">
                                    {ym}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOutbound")}</td>
                                {compareMonthHqOutboundDiagnostics.map(({ ym, basis }) => (
                                  <td key={`o-${ym}`} className="text-right p-1.5 font-mono">
                                    {formatBath(basis.outboundTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOrdersRef")}</td>
                                {compareMonthHqOutboundDiagnostics.map(({ ym, basis }) => (
                                  <td key={`a-${ym}`} className="text-right p-1.5 font-mono">
                                    {formatBath(basis.approvedOrdersTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-t border-sky-200/60">
                                <td className="p-1.5 font-medium">Δ</td>
                                {compareMonthHqOutboundDiagnostics.map(({ ym, basis }) => (
                                  <td
                                    key={`d-${ym}`}
                                    className={`text-right p-1.5 font-mono font-medium ${
                                      isMaterialHqOutboundOrderDiff(basis) ? "bg-amber-200/80" : ""
                                    }`}
                                  >
                                    {formatBath(basis.diff)}
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                      {compareGranularity === "year" && compareYearHqOutboundDiagnostics.length > 0 && (
                        <div
                          className={`rounded border px-3 py-2 text-xs overflow-x-auto ${
                            compareYearHqOutboundDiagnostics.some(({ purchaseHqOutboundBasis: b }) =>
                              b ? isMaterialHqOutboundOrderDiff(b) : false
                            )
                              ? "border-amber-400 bg-amber-50 text-amber-950"
                              : "border-sky-300 bg-sky-50 text-sky-950"
                          }`}
                        >
                          <p className="mb-2 font-medium leading-relaxed">{t("pL_diagHqOutboundYearAgg")}</p>
                          <table className="w-full text-[11px] border-collapse min-w-[200px]">
                            <thead>
                              <tr className="border-b border-sky-200/80">
                                <th className="text-left p-1.5 font-medium text-muted-foreground w-[100px]">
                                  {t("pL_colItem")}
                                </th>
                                {compareYearHqOutboundDiagnostics.map(({ year }) => (
                                  <th key={year} className="text-right p-1.5 font-mono whitespace-nowrap">
                                    {year}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOutbound")}</td>
                                {compareYearHqOutboundDiagnostics.map(({ year, purchaseHqOutboundBasis }) => (
                                  <td key={`yo-${year}`} className="text-right p-1.5 font-mono">
                                    {formatBath(purchaseHqOutboundBasis!.outboundTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr>
                                <td className="p-1.5 text-muted-foreground">{t("pL_purchaseDrillHqOrdersRef")}</td>
                                {compareYearHqOutboundDiagnostics.map(({ year, purchaseHqOutboundBasis }) => (
                                  <td key={`ya-${year}`} className="text-right p-1.5 font-mono">
                                    {formatBath(purchaseHqOutboundBasis!.approvedOrdersTotal)}
                                  </td>
                                ))}
                              </tr>
                              <tr className="border-t border-sky-200/60">
                                <td className="p-1.5 font-medium">Δ</td>
                                {compareYearHqOutboundDiagnostics.map(({ year, purchaseHqOutboundBasis }) => {
                                  const b = purchaseHqOutboundBasis!
                                  return (
                                    <td
                                      key={`yd-${year}`}
                                      className={`text-right p-1.5 font-mono font-medium ${
                                        isMaterialHqOutboundOrderDiff(b) ? "bg-amber-200/80" : ""
                                      }`}
                                    >
                                      {formatBath(b.diff)}
                                    </td>
                                  )
                                })}
                              </tr>
                            </tbody>
                          </table>
                          <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                            {t("pL_diagHqCompareYearAggNote")}
                          </p>
                        </div>
                      )}
                      {compareGranularity === "year" &&
                        compareMonthHqOutboundDiagnostics.length > 0 &&
                        compareYearHqOutboundDiagnostics.length === 0 && (
                        <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded px-3 py-2">
                          {t("pL_diagHqCompareYearOnlyHint")}
                        </p>
                      )}
                      {compareMergedExcludedHqBank.length > 0 && (
                        <div className="rounded border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-950">
                          <p className="mb-1 font-medium">{t("pL_diagExcludedHqBankTitle")}</p>
                          <p className="mb-1.5 leading-relaxed text-[11px] opacity-90">{t("pL_diagExcludedHqBankHint")}</p>
                          <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
                            {compareMergedExcludedHqBank.map((row) => (
                              <li key={row.key}>
                                {row.key}
                                {row.label ? <span className="font-sans not-italic"> — {row.label}</span> : null}:{" "}
                                {formatBath(row.amount)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {compareGranularity === "year" && (
                        <p className="text-xs text-muted-foreground">{t("fs_compareYearOnlySummaryNote")}</p>
                      )}
                      <AdminTableScroll className="rounded-md border" hint={false}>
                        <table className="text-sm w-full min-w-max">
                          <caption className="caption-top text-left text-sm font-semibold text-foreground py-2 px-2 border-b border-border">
                            {t("incomeStatementTitle")}
                          </caption>
                          <thead>
                            <tr className="border-b bg-muted/40">
                              <th className="text-left p-2 font-medium sticky left-0 z-10 min-w-[120px] sm:min-w-[160px] bg-muted/40 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                {t("pL_colItem")}
                              </th>
                              {incomeCompareCols.map((c) => (
                                <th
                                  key={c.key}
                                  className="text-right p-2 font-medium font-mono whitespace-nowrap"
                                >
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {compareGranularity === "year" ? (
                              <>
                                {incomeComparePlRows.map((row) => {
                                  const salesExpandable =
                                    row.key === "sales" && compareMergedSalesBreakdown.length > 0
                                  return (
                                  <React.Fragment key={row.key}>
                                    <tr
                                      className={`border-b last:border-0 ${
                                        row.key === "purchases" ||
                                        row.key === "expenses" ||
                                        salesExpandable
                                          ? "cursor-pointer hover:bg-muted/40 select-none"
                                          : ""
                                      }`}
                                      onClick={
                                        row.key === "purchases"
                                          ? () => setCompareUnifiedExpandPurchases((v) => !v)
                                          : row.key === "expenses"
                                            ? () => setCompareUnifiedExpandExpenses((v) => !v)
                                            : salesExpandable
                                              ? () => setCompareUnifiedExpandSales((v) => !v)
                                              : undefined
                                      }
                                    >
                                      <td className="p-2 font-medium sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        {row.key === "purchases" || row.key === "expenses" || salesExpandable ? (
                                          <span className="inline-flex items-center gap-1">
                                            {row.key === "purchases" ? (
                                              compareUnifiedExpandPurchases ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                              )
                                            ) : row.key === "expenses" ? (
                                              compareUnifiedExpandExpenses ? (
                                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                              ) : (
                                                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                              )
                                            ) : compareUnifiedExpandSales ? (
                                              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                            )}
                                            {row.label}
                                          </span>
                                        ) : (
                                          row.label
                                        )}
                                      </td>
                                      {incomeCompareCols.map((c) => {
                                        const m = c.metrics
                                        const v = m ? row.pick(m) : null
                                        const isNet = row.key === "net"
                                        return (
                                          <td
                                            key={c.key}
                                            className={`p-2 text-right font-mono whitespace-nowrap ${
                                              isNet && v != null && v < 0 ? "text-destructive" : ""
                                            } ${isNet && v != null && v >= 0 ? "font-semibold text-primary" : ""}`}
                                          >
                                            {v == null || m == null ? "—" : formatBath(v)}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                    {row.key === "sales" &&
                                      compareUnifiedExpandSales &&
                                      compareMergedSalesBreakdown.map((sc) => (
                                        <tr
                                          key={`y-sc-${sc.key}`}
                                          className="border-b bg-muted/10 last:border-0"
                                        >
                                          <td className="p-1.5 pl-10 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                            {salesBreakdownRowLabel(
                                              { key: sc.key, label: sc.label },
                                              t,
                                              compareSalesBreakdownDaily
                                            )}
                                          </td>
                                          {incomeCompareCols.map((c) => (
                                            <td
                                              key={c.key}
                                              className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                              title={t("fs_compareYearAggregateHint")}
                                            >
                                              {formatBath(
                                                yearlySalesBreakdownAmount(
                                                  compareIncomeRows,
                                                  c.key,
                                                  sc.key
                                                )
                                              )}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    {row.key === "purchases" &&
                                      compareUnifiedExpandPurchases &&
                                      compareMergedPurchaseVendors.map((pv) => (
                                        <tr
                                          key={`y-pv-${pv.key}`}
                                          className="border-b bg-muted/10 last:border-0"
                                        >
                                          <td className="p-1.5 pl-10 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                            {purchaseVendorRowLabel(pv, t)}
                                          </td>
                                          {incomeCompareCols.map((c) => (
                                            <td
                                              key={c.key}
                                              className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                              title={t("fs_compareYearAggregateHint")}
                                            >
                                              {formatBath(
                                                yearlyPurchaseVendorAmount(compareIncomeRows, c.key, pv.key)
                                              )}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    {row.key === "purchases" && compareUnifiedExpandPurchases && (
                                      <tr className="border-b bg-muted/10 last:border-0">
                                        <td
                                          colSpan={incomeCompareCols.length + 1}
                                          className="py-2 pl-6 pr-2 text-sm text-muted-foreground leading-relaxed"
                                        >
                                          {salesBreakdownIsHqOutbound(data ?? undefined)
                                            ? t("pL_purchaseCompositionNoteHq")
                                            : t("pL_purchaseCompositionNote")}
                                        </td>
                                      </tr>
                                    )}
                                    {row.key === "expenses" &&
                                      compareUnifiedExpandExpenses &&
                                      compareMergedExpenseSubjects.map((sub) => (
                                        <tr
                                          key={`y-es-${sub.accountSubjectId ?? "u"}`}
                                          className="border-b bg-muted/10 last:border-0"
                                        >
                                          <td className="p-1.5 pl-10 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                            {sub.accountSubjectId == null
                                              ? t("pL_accountUnclassified") || "Unclassified account"
                                              : formatAccountSubjectLabel(lang, {
                                                  code: sub.code,
                                                  name: sub.name,
                                                  nameEn: sub.nameEn,
                                                  nameTh: sub.nameTh,
                                                }) ||
                                                (sub.accountSubjectId != null
                                                  ? `#${sub.accountSubjectId}`
                                                  : "")}
                                          </td>
                                          {incomeCompareCols.map((c) => (
                                            <td
                                              key={c.key}
                                              className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                              title={t("fs_compareYearAggregateHint")}
                                            >
                                              {formatBath(
                                                yearlyExpenseSubjectAmount(
                                                  compareIncomeRows,
                                                  c.key,
                                                  sub.accountSubjectId
                                                )
                                              )}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    {row.key === "expenses" &&
                                      compareUnifiedExpandExpenses &&
                                      showExpenseDetails && (
                                        <>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourcePetty")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "pettyCash"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceBank")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "bankWithdraw"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceDeliveryApps")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "deliveryAppFees"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceCardFees")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "cardFees"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceFixed")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "fixedExpenses"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceStockInbound")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "stockInboundExpense"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourcePayroll")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "payrollExpense"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceDepreciation")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "depreciationExpense"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceFranchiseRoyalty")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "franchiseRoyalty"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceFranchiseDeliveryGp")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "franchiseDeliveryGp"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceFranchiseGrabGp")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "franchiseGrabGp"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                          <tr className="border-b bg-muted/10 last:border-0">
                                            <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                              - {t("pL_expenseSourceFranchiseBillingCombined")}
                                            </td>
                                            {incomeCompareCols.map((c) => (
                                              <td
                                                key={c.key}
                                                className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                                title={t("fs_compareYearAggregateHint")}
                                              >
                                                {formatBath(
                                                  yearlyExpenseBreakdownField(
                                                    compareIncomeRows,
                                                    c.key,
                                                    "franchiseBillingCombined"
                                                  )
                                                )}
                                              </td>
                                            ))}
                                          </tr>
                                        </>
                                      )}
                                  </React.Fragment>
                                  )
                                })}
                              </>
                            ) : (
                              <>
                                {compareMergedSalesBreakdown.length > 0 ? (
                                  <tr
                                    className="border-b cursor-pointer hover:bg-muted/40 select-none"
                                    onClick={() => setCompareUnifiedExpandSales((v) => !v)}
                                  >
                                    <td className="p-2 font-medium sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                      <span className="inline-flex items-center gap-1">
                                        {compareUnifiedExpandSales ? (
                                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                        )}
                                        {t("pL_sales")}
                                      </span>
                                    </td>
                                    {compareIncomeRows.map(({ ym, data: rowData }) => (
                                      <td
                                        key={ym}
                                        className="p-2 text-right font-mono whitespace-nowrap"
                                      >
                                        {rowData.error
                                          ? "—"
                                          : formatBath(
                                              incomeMetricsForCompare(rowData, vatDisplayMode)?.sales ?? 0
                                            )}
                                      </td>
                                    ))}
                                  </tr>
                                ) : (
                                  <tr className="border-b">
                                    <td className="p-2 font-medium sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                      {t("pL_sales")}
                                    </td>
                                    {compareIncomeRows.map(({ ym, data: rowData }) => (
                                      <td
                                        key={ym}
                                        className="p-2 text-right font-mono whitespace-nowrap"
                                      >
                                        {rowData.error
                                          ? "—"
                                          : formatBath(
                                              incomeMetricsForCompare(rowData, vatDisplayMode)?.sales ?? 0
                                            )}
                                      </td>
                                    ))}
                                  </tr>
                                )}
                                {compareUnifiedExpandSales &&
                                  compareMergedSalesBreakdown.map((sc) => (
                                    <tr key={`m-sc-${sc.key}`} className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-10 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        {salesBreakdownRowLabel(
                                          { key: sc.key, label: sc.label },
                                          t,
                                          compareSalesBreakdownDaily
                                        )}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => {
                                        const amt = salesAmountForBreakdownKey(rowData, sc.key)
                                        return (
                                          <td
                                            key={ym}
                                            className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                          >
                                            {rowData.error ? "—" : formatBath(amt)}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                <tr className="border-b">
                                  <td className="p-2 text-muted-foreground pl-4 sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                    + {t("pL_beginningInv")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error
                                        ? "—"
                                        : formatBath(Number(rowData.beginningInventory) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                <tr
                                  className="border-b cursor-pointer hover:bg-muted/40 select-none"
                                  onClick={() => setCompareUnifiedExpandPurchases((v) => !v)}
                                >
                                  <td className="p-2 text-muted-foreground pl-4 sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                    <span className="inline-flex items-center gap-1">
                                      {compareUnifiedExpandPurchases ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                      )}
                                      + {t("pL_purchases")}
                                    </span>
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error ? "—" : formatBath(Number(rowData.purchases) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                {compareUnifiedExpandPurchases &&
                                  compareMergedPurchaseVendors.map((pv) => (
                                    <tr key={pv.key} className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-10 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        {purchaseVendorRowLabel(pv, t)}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => {
                                        const amt = purchaseAmountForVendor(rowData, pv.key)
                                        const canDrill = !rowData.error && amt > 0
                                        return (
                                          <td
                                            key={ym}
                                            className={`p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap ${
                                              canDrill ? "cursor-pointer hover:bg-muted/50 underline-offset-2" : ""
                                            }`}
                                            title={canDrill ? t("pL_purchaseDrillClickHint") : undefined}
                                            onClick={
                                              canDrill
                                                ? (e) => {
                                                    e.stopPropagation()
                                                    openComparePurchaseDrill(ym, pv)
                                                  }
                                                : undefined
                                            }
                                          >
                                            {rowData.error ? "—" : formatBath(amt)}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                {compareUnifiedExpandPurchases && (
                                  <tr className="border-b bg-muted/10">
                                    <td
                                      colSpan={compareIncomeRows.length + 1}
                                      className="py-2 pl-6 pr-2 text-sm text-muted-foreground leading-relaxed"
                                    >
                                      {salesBreakdownIsHqOutbound(data ?? undefined)
                                        ? t("pL_purchaseCompositionNoteHq")
                                        : t("pL_purchaseCompositionNote")}
                                    </td>
                                  </tr>
                                )}
                                <tr className="border-b">
                                  <td className="p-2 text-muted-foreground pl-4 sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                    - {t("pL_endingInv")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error
                                        ? "—"
                                        : formatBath(Number(rowData.endingInventory) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                <tr className="border-b">
                                  <td className="p-2 text-muted-foreground sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                    = {t("pL_cogs")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error
                                        ? "—"
                                        : formatBath(
                                            incomeMetricsForCompare(rowData, vatDisplayMode)?.cogs ?? 0
                                          )}
                                    </td>
                                  ))}
                                </tr>
                                <tr className="border-b">
                                  <td className="p-2 font-medium text-primary sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                    {t("pL_grossProfit")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => {
                                    const m = incomeMetricsForCompare(rowData, vatDisplayMode)
                                    const v = m?.grossProfit ?? null
                                    return (
                                      <td
                                        key={ym}
                                        className={`p-2 text-right font-mono font-medium whitespace-nowrap ${
                                          v != null && v < 0 ? "text-destructive" : "text-primary"
                                        }`}
                                      >
                                        {v == null ? "—" : formatBath(v)}
                                      </td>
                                    )
                                  })}
                                </tr>
                                <tr
                                  className="border-b cursor-pointer hover:bg-muted/40 select-none"
                                  onClick={() => setCompareUnifiedExpandExpenses((v) => !v)}
                                >
                                  <td className="p-2 text-muted-foreground sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                    <span className="inline-flex items-center gap-1">
                                      {compareUnifiedExpandExpenses ? (
                                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                                      )}
                                      - {t("pL_expenses")}
                                    </span>
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => (
                                    <td
                                      key={ym}
                                      className="p-2 text-right font-mono text-muted-foreground whitespace-nowrap"
                                    >
                                      {rowData.error ? "—" : formatBath(Number(rowData.expenses) || 0)}
                                    </td>
                                  ))}
                                </tr>
                                {compareUnifiedExpandExpenses &&
                                  compareMergedExpenseSubjects.map((sub) => (
                                    <tr key={String(sub.accountSubjectId ?? "u")} className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-10 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        {sub.accountSubjectId == null
                                          ? t("pL_accountUnclassified") || "Unclassified account"
                                          : formatAccountSubjectLabel(lang, {
                                              code: sub.code,
                                              name: sub.name,
                                              nameEn: sub.nameEn,
                                              nameTh: sub.nameTh,
                                            }) ||
                                            (sub.accountSubjectId != null
                                              ? `#${sub.accountSubjectId}`
                                              : "")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(
                                                expenseAmountForSubject(rowData, sub.accountSubjectId)
                                              )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                {compareUnifiedExpandExpenses && showExpenseDetails && (
                                  <>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourcePetty")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.pettyCash ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceBank")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.bankWithdraw ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceDeliveryApps")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.deliveryAppFees ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceCardFees")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.cardFees ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceFixed")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.fixedExpenses ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceStockInbound")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.stockInboundExpense ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourcePayroll")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.payrollExpense ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceDepreciation")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(rowData.expenseBreakdown?.depreciationExpense ?? 0)}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceFranchiseRoyalty")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(
                                                pickFranchiseBillingVatAmount(
                                                  rowData.displayAmounts?.franchiseRoyaltyGross ??
                                                    rowData.expenseBreakdown?.franchiseRoyalty,
                                                  rowData.displayAmounts?.franchiseRoyaltyNet,
                                                  vatDisplayMode
                                                )
                                              )}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceFranchiseDeliveryGp")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(
                                                pickFranchiseBillingVatAmount(
                                                  rowData.displayAmounts?.franchiseDeliveryGpGross ??
                                                    rowData.expenseBreakdown?.franchiseDeliveryGp,
                                                  rowData.displayAmounts?.franchiseDeliveryGpNet,
                                                  vatDisplayMode
                                                )
                                              )}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceFranchiseGrabGp")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(
                                                pickFranchiseBillingVatAmount(
                                                  rowData.displayAmounts?.franchiseGrabGpGross ??
                                                    rowData.expenseBreakdown?.franchiseGrabGp,
                                                  rowData.displayAmounts?.franchiseGrabGpNet,
                                                  vatDisplayMode
                                                )
                                              )}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr className="border-b bg-muted/10">
                                      <td className="p-1.5 pl-8 text-sm text-muted-foreground sticky left-0 z-10 bg-muted/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                        - {t("pL_expenseSourceFranchiseBillingCombined")}
                                      </td>
                                      {compareIncomeRows.map(({ ym, data: rowData }) => (
                                        <td
                                          key={ym}
                                          className="p-1.5 text-right font-mono text-sm text-muted-foreground whitespace-nowrap"
                                        >
                                          {rowData.error
                                            ? "—"
                                            : formatBath(
                                                pickFranchiseBillingVatAmount(
                                                  rowData.displayAmounts?.franchiseBillingCombinedGross ??
                                                    rowData.expenseBreakdown?.franchiseBillingCombined,
                                                  rowData.displayAmounts?.franchiseBillingCombinedNet,
                                                  vatDisplayMode
                                                )
                                              )}
                                        </td>
                                      ))}
                                    </tr>
                                  </>
                                )}
                                <tr className="border-b last:border-0">
                                  <td className="p-2 font-bold sticky left-0 z-10 bg-background shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                                    {t("pL_netProfit")}
                                  </td>
                                  {compareIncomeRows.map(({ ym, data: rowData }) => {
                                    const m = incomeMetricsForCompare(rowData, vatDisplayMode)
                                    const v = m?.netProfit ?? null
                                    return (
                                      <td
                                        key={ym}
                                        className={`p-2 text-right font-mono font-bold whitespace-nowrap ${
                                          v != null && v < 0 ? "text-destructive" : ""
                                        } ${v != null && v >= 0 ? "text-primary" : ""}`}
                                      >
                                        {v == null ? "—" : formatBath(v)}
                                      </td>
                                    )
                                  })}
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </AdminTableScroll>
                      <IncomePurchaseDrillDialog
                        open={compareDrillOpen}
                        onOpenChange={(o) => {
                          setCompareDrillOpen(o)
                          if (!o) {
                            setCompareDrillData(null)
                            setCompareDrillLoading(false)
                          }
                        }}
                        purchaseDrillTitle={compareDrillTitle}
                        purchaseDrillLoading={compareDrillLoading}
                        purchaseDrillData={compareDrillData}
                        t={t}
                      />
                    </>
                  )}
                </div>
              )}
              {isRangeCompare &&
                !showIncomeCompareTable &&
                !loading &&
                incomeCompareFetchId > 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("inNoData") || "No data found."}
                  </p>
                )}
              {isRangeCompare &&
                !showIncomeCompareTable &&
                !loading &&
                incomeCompareFetchId === 0 &&
                (!props.hideControls || (props.queryToken ?? 0) <= 0) && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("msg_click_query") || "Click Query button."}
                  </p>
                )}
              {!isRangeCompare && (
                <div className="space-y-3 mb-4 pb-4 border-b">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">{t("pL_overrideStorageLabel")}</span>
                    <Select
                      value={overrideSource}
                      onValueChange={(v) => setOverrideSource(v as IncomeStatementOverrideSource)}
                      disabled={sharedLoading}
                    >
                      <SelectTrigger className="w-[220px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">{t("pL_overrideSourceLocal")}</SelectItem>
                        <SelectItem value="shared">{t("pL_overrideSourceShared")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {overrideSource === "shared" && sharedLoading && (
                      <span className="text-xs text-muted-foreground">{t("pL_overrideSharedLoading")}</span>
                    )}
                    {overrideSource === "shared" && sharedSaveError && !sharedLoading && (
                      <span className="text-xs text-destructive">
                        {mapIncomeStatementOverrideSaveError(sharedSaveError, t)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground max-w-3xl">{t("pL_overrideStorageNote")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9"
                      disabled={
                        overrideSaveBusy ||
                        (overrideSource === "shared" && (sharedLoading || !sharedReady))
                      }
                      onClick={() => void handlePlOverridesSaveNow()}
                    >
                      {overrideSaveBusy ? t("pL_overrideSavingShort") : t("pL_overrideSaveNow")}
                    </Button>
                    {overridePersistAt != null && (
                      <span className="text-xs text-muted-foreground">
                        {t("pL_overrideLastSavedBangkok").replace(
                          "{time}",
                          formatOverrideSavedClockBangkok(overridePersistAt, lang)
                        )}
                      </span>
                    )}
                    {overrideButtonHint ? (
                      <span className="text-xs text-destructive">{overrideButtonHint}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="pl-manual-sales"
                        checked={manualEnabled}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                        onCheckedChange={(v) => onManualCheckedChange(v === true)}
                      />
                      <Label htmlFor="pl-manual-sales" className="text-sm font-normal cursor-pointer">
                        {t("pL_manualSalesUse")}
                      </Label>
                    </div>
                    {manualEnabled && (
                      <Input
                        className="w-40 h-9 font-mono"
                        inputMode="decimal"
                        placeholder={t("pL_manualSalesPlaceholder")}
                        value={manualAmountStr}
                        onChange={(e) => setManualAmountStr(e.target.value)}
                        onFocus={() => setOverrideButtonHint(null)}
                        aria-label={t("pL_manualSalesPlaceholder")}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                      />
                    )}
                    <p className="text-xs text-muted-foreground max-w-md shrink-0">
                      {overrideSource === "local" ? t("pL_manualSalesNote") : t("pL_manualSalesNoteShared")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="pl-manual-beg-inv"
                        checked={begInvManualEnabled}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                        onCheckedChange={(v) => {
                          const checked = v === true
                          setBegInvManualEnabled(checked)
                          if (checked) {
                            if (overrideSource === "local") {
                              const saved = readIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter)
                              if (saved?.enabled) setBegInvAmountStr(String(saved.amount))
                              else if (data) setBegInvAmountStr(String(data.beginningInventory ?? 0))
                              else setBegInvAmountStr("")
                            } else {
                              const p = parseSalesOverrideInput(begInvAmountStr)
                              if (p != null) setBegInvAmountStr(String(p))
                              else if (data) setBegInvAmountStr(String(data.beginningInventory ?? 0))
                              else setBegInvAmountStr("")
                            }
                          } else setBegInvAmountStr("")
                        }}
                      />
                      <Label htmlFor="pl-manual-beg-inv" className="text-sm font-normal cursor-pointer">
                        {t("pL_manualBegInvUse")}
                      </Label>
                    </div>
                    {begInvManualEnabled && (
                      <Input
                        className="w-40 h-9 font-mono"
                        inputMode="decimal"
                        placeholder={t("pL_manualBegInvPlaceholder")}
                        value={begInvAmountStr}
                        onChange={(e) => setBegInvAmountStr(e.target.value)}
                        onFocus={() => setOverrideButtonHint(null)}
                        aria-label={t("pL_manualBegInvPlaceholder")}
                        disabled={overrideSource === "shared" && (sharedLoading || !sharedReady)}
                      />
                    )}
                    <p className="text-xs text-muted-foreground max-w-xl">
                      {overrideSource === "local" ? t("pL_manualBegInvNote") : t("pL_manualBegInvNoteShared")}
                    </p>
                  </div>
                  {!data && (
                    <p className="text-xs text-muted-foreground">{t("pL_manualOverridesAfterQuery")}</p>
                  )}
                </div>
              )}

              {!isRangeCompare && data?.error ? (
                <p className="text-sm text-destructive py-4 px-1">{data.error}</p>
              ) : null}
              {!isRangeCompare && (data?.diagnostics?.warnings?.length ?? 0) > 0 ? (
                <div className="mb-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {data!.diagnostics!.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              ) : null}
              {!isRangeCompare && isIncomeStatementData(data) && !data.error && view ? (
                <div className="w-full">
                  <IncomePlDetailTableContent
                    data={data}
                    view={view}
                    vatMode={vatDisplayMode}
                    showEbitda={showEbitda}
                    periodLine={
                      data.startStr && data.endStr
                        ? `${data.yearMonth} · ${storeLabel} · ${data.startStr}~${data.endStr} (방콕)`
                        : `${data.yearMonth} · ${storeLabel}`
                    }
                    showExpenseDetails={showExpenseDetails}
                    expandSales={expandSales}
                    onToggleSales={() => setExpandSales((v) => !v)}
                    expandPurchases={expandPurchases}
                    onTogglePurchases={() => setExpandPurchases((v) => !v)}
                    expandExpenseAccounts={expandExpenseAccounts}
                    onToggleExpenseAccounts={() => setExpandExpenseAccounts((v) => !v)}
                    printRef={printRef}
                    purchaseDrillContext={{
                      yearMonth: data.yearMonth,
                      storeFilter: storeFilter !== "All" ? storeFilter : undefined,
                      userStore: auth?.store,
                      userRole: auth?.role,
                    }}
                  />
                </div>
              ) : !isRangeCompare && !data ? (
                <AccountingEmptyState>{t("msg_click_query") || "Click Query button."}</AccountingEmptyState>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
