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
import { getIncomeStatement, useStoreList, type IncomeStatementData } from "@/lib/api-client"
import { formatAccountSubjectLabel } from "@/lib/account-subject-display"
import { expandBangkokYearMonthsInclusive, getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import {
  aggregateIncomeStatementByYear,
  FINANCIAL_COMPARE_MAX_MONTHS,
  incomeStatementCogs,
} from "@/lib/financial-statements-compare"
import { useAuth } from "@/lib/auth-context"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import {
  readIncomeStatementBeginningInvOverride,
  writeIncomeStatementBeginningInvOverride,
} from "@/lib/income-statement-beginning-inv-override"
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

function incomeMetricsForCompare(d: IncomeStatementData | undefined) {
  if (!d || d.error) return null
  const sales = Number(d.sales) || 0
  const purchases = Number(d.purchases) || 0
  const expenses = Number(d.expenses) || 0
  const cogs = incomeStatementCogs(d)
  const grossProfit =
    d.grossProfit != null && Number.isFinite(Number(d.grossProfit))
      ? Number(d.grossProfit)
      : sales - cogs
  const netProfit =
    d.netProfit != null && Number.isFinite(Number(d.netProfit))
      ? Number(d.netProfit)
      : grossProfit - expenses
  return { sales, purchases, cogs, grossProfit, expenses, netProfit }
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
  const [data, setData] = React.useState<IncomeStatementData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showExpenseDetails, setShowExpenseDetails] = React.useState(false)
  const [expandPurchases, setExpandPurchases] = React.useState(false)
  const [expandExpenseAccounts, setExpandExpenseAccounts] = React.useState(false)
  const [manualEnabled, setManualEnabled] = React.useState(false)
  const [manualAmountStr, setManualAmountStr] = React.useState("")
  const [begInvManualEnabled, setBegInvManualEnabled] = React.useState(false)
  const [begInvAmountStr, setBegInvAmountStr] = React.useState("")
  const [exportingPdf, setExportingPdf] = React.useState(false)

  const printRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (isManager && managerStore) {
      setStoreFilter(managerStore)
    }
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

  React.useEffect(() => {
    setExpandPurchases(false)
    setExpandExpenseAccounts(false)
  }, [yearMonthStart, yearMonthEnd, storeFilter])

  React.useEffect(() => {
    const o = readIncomeStatementSalesOverride(yearMonthEnd, storeFilter)
    if (o?.enabled) {
      setManualEnabled(true)
      setManualAmountStr(String(o.amount))
    } else {
      setManualEnabled(false)
      setManualAmountStr("")
    }
  }, [yearMonthEnd, storeFilter])

  React.useEffect(() => {
    const o = readIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter)
    if (o?.enabled) {
      setBegInvManualEnabled(true)
      setBegInvAmountStr(String(o.amount))
    } else {
      setBegInvManualEnabled(false)
      setBegInvAmountStr("")
    }
  }, [yearMonthEnd, storeFilter])

  React.useEffect(() => {
    if (!manualEnabled) {
      writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, false, 0)
      return
    }
    const p = parseSalesOverrideInput(manualAmountStr)
    if (p == null) return
    writeIncomeStatementSalesOverride(yearMonthEnd, storeFilter, true, p)
  }, [yearMonthEnd, storeFilter, manualEnabled, manualAmountStr])

  React.useEffect(() => {
    if (!begInvManualEnabled) {
      writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, false, 0)
      return
    }
    const p = parseSalesOverrideInput(begInvAmountStr)
    if (p == null) return
    writeIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter, true, p)
  }, [yearMonthEnd, storeFilter, begInvManualEnabled, begInvAmountStr])

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

  const [compareIncomeRows, setCompareIncomeRows] = React.useState<
    { ym: string; data: IncomeStatementData }[]
  >([])
  const [compareGranularity, setCompareGranularity] = React.useState<"month" | "year">("month")
  const [incomeCompareFetchId, setIncomeCompareFetchId] = React.useState(0)

  const runIncomeFetch = React.useCallback(() => {
    const sf = storeFilter !== "All" ? storeFilter : undefined
    const months = periodMonths

    if (months.length <= 1) {
      const ym = months[0] ?? yearMonthEnd
      setLoading(true)
      setCompareIncomeRows([])
      getIncomeStatement({
        yearMonth: ym,
        storeFilter: sf,
        userStore: auth?.store,
        userRole: auth?.role,
        includeDebug: showExpenseDetails,
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
        getIncomeStatement({
          yearMonth: ym,
          storeFilter: sf,
          userStore: auth?.store,
          userRole: auth?.role,
          includeDebug: false,
        })
      )
    )
      .then((arr) =>
        setCompareIncomeRows(
          months.map((ym, i) => ({
            ym,
            data: arr[i] as IncomeStatementData,
          }))
        )
      )
      .catch(() => setCompareIncomeRows([]))
      .finally(() => {
        setIncomeCompareFetchId((x) => x + 1)
        setLoading(false)
      })
  }, [
    periodMonths,
    storeFilter,
    auth?.store,
    auth?.role,
    showExpenseDetails,
    yearMonthEnd,
  ])

  React.useEffect(() => {
    if (!props.hideControls) return
    if (props.queryToken == null) return
    runIncomeFetch()
  }, [props.hideControls, props.queryToken, runIncomeFetch])

  const loadData = React.useCallback(() => {
    runIncomeFetch()
  }, [runIncomeFetch])

  const incomeYearCompare = React.useMemo(
    () => aggregateIncomeStatementByYear(compareIncomeRows),
    [compareIncomeRows]
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
    ],
    [t]
  )

  const incomeCompareCols = React.useMemo(() => {
    if (compareGranularity === "month") {
      return compareIncomeRows.map(({ ym, data }) => ({
        key: ym,
        label: ym,
        metrics: incomeMetricsForCompare(data),
      }))
    }
    return incomeYearCompare.map((y) => ({
      key: y.year,
      label: y.year,
      metrics: {
        sales: y.sales,
        purchases: y.purchases,
        cogs: y.cogs,
        grossProfit: y.grossProfit,
        expenses: y.expenses,
        netProfit: y.netProfit,
      } satisfies IncomeCompareMetrics,
    }))
  }, [compareGranularity, compareIncomeRows, incomeYearCompare])

  const yearMonthOptions = getBangkokRecentYearMonths(60).map((value) => {
    const [y, m] = value.split("-").map(Number)
    return { value, label: `${y}년 ${m}월` }
  })

  const storeOptions = isOffice
    ? ["본사", ...(storeList || []).filter((s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office"))]
    : isManager && managerStore
      ? [managerStore]
      : []

  const formatBath = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  const view = React.useMemo(() => {
    if (!data) return null
    const expenses = data.expenses
    const purchases = data.purchases
    const endingInv = data.endingInventory ?? 0
    const sysBeg = data.beginningInventory ?? 0

    const parsedSales = parseSalesOverrideInput(manualAmountStr)
    const useManualSales = manualEnabled && parsedSales != null
    const sales = useManualSales ? parsedSales : data.sales

    const parsedBeg = parseSalesOverrideInput(begInvAmountStr)
    const useManualBegInv = begInvManualEnabled && parsedBeg != null
    const beginningInventory = useManualBegInv ? parsedBeg : sysBeg

    const cogs = beginningInventory + purchases - endingInv
    const grossProfit = sales - cogs
    const netProfit = grossProfit - expenses
    const pctBase = sales > 0 ? sales : 0
    const pct = (n: number) => (pctBase > 0 ? `${((n / pctBase) * 100).toFixed(1)}%` : "—")
    return {
      sales,
      grossProfit,
      netProfit,
      pct,
      cogs,
      beginningInventory,
      useManualSales,
      systemSales: data.sales,
      useManualBegInv,
      systemBeginningInventory: sysBeg,
      expenses,
    }
  }, [data, manualEnabled, manualAmountStr, begInvManualEnabled, begInvAmountStr])

  const storeLabel =
    storeFilter === "All"
      ? t("all") || "전체"
      : ["본사", "Office", "오피스", "본점"].includes(storeFilter) || storeFilter.toLowerCase().includes("office")
        ? t("pettyScopeOffice") || "본사"
        : storeFilter

  const purchaseVendorLabel = (key: string) => {
    if (key === "__pl_hq_orders__") return t("pL_purchaseHqOrders") || "본사·물류 발주"
    if (key === "__pl_vendor_unknown__") return t("pL_vendorUnknown") || "거래처 미지정"
    return key
  }

  const buildXlsxRows = React.useCallback((): IncomeStatementXlsxRow[] => {
    if (!data || !view) return []
    const vendorLabel = (key: string) => {
      if (key === "__pl_hq_orders__") return t("pL_purchaseHqOrders") || "본사·물류 발주"
      if (key === "__pl_vendor_unknown__") return t("pL_vendorUnknown") || "거래처 미지정"
      return key
    }
    const rows: IncomeStatementXlsxRow[] = []
    rows.push({ label: t("pL_sales"), amount: view.sales, pct: "100.0%" })
    rows.push({
      label: `  + ${t("pL_beginningInv")}`,
      amount: view.beginningInventory,
      pct: view.pct(view.beginningInventory),
    })
    rows.push({
      label: `  + ${t("pL_purchases")}`,
      amount: data.purchases,
      pct: view.pct(data.purchases),
    })
    if ((data.purchaseByVendor?.length || 0) > 0) {
      for (const row of data.purchaseByVendor!) {
        rows.push({
          label: `      ${vendorLabel(row.key)}`,
          amount: row.amount,
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `  - ${t("pL_endingInv")}`,
      amount: data.endingInventory ?? 0,
      pct: view.pct(-(data.endingInventory ?? 0)),
    })
    rows.push({
      label: `= ${t("pL_cogs")}`,
      amount: view.cogs,
      pct: view.pct(view.cogs),
    })
    rows.push({
      label: t("pL_grossProfit"),
      amount: view.grossProfit,
      pct: view.pct(view.grossProfit),
    })
    rows.push({
      label: `- ${t("pL_expenses")}`,
      amount: data.expenses,
      pct: view.pct(data.expenses),
    })
    if ((data.expenseByAccountSubject?.length || 0) > 0) {
      for (const row of data.expenseByAccountSubject!) {
        const label =
          row.accountSubjectId == null
            ? t("pL_accountUnclassified") || "계정 미지정"
            : formatAccountSubjectLabel(lang, {
                code: row.code,
                name: row.name,
                nameEn: row.nameEn,
                nameTh: row.nameTh,
              }) || (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")
        rows.push({
          label: `      ${label}`,
          amount: row.amount,
          pct: view.pct(row.amount),
        })
      }
    }
    rows.push({
      label: `    - ${t("pL_expenseSourcePetty") || "현금시재(패티캐시)"}`,
      amount: data.expenseBreakdown?.pettyCash ?? 0,
      pct: view.pct(data.expenseBreakdown?.pettyCash ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceBank") || "통장 출금"}`,
      amount: data.expenseBreakdown?.bankWithdraw ?? 0,
      pct: view.pct(data.expenseBreakdown?.bankWithdraw ?? 0),
    })
    rows.push({
      label: `    - ${t("pL_expenseSourceFixed") || "고정비"}`,
      amount: data.expenseBreakdown?.fixedExpenses ?? 0,
      pct: view.pct(data.expenseBreakdown?.fixedExpenses ?? 0),
    })
    rows.push({
      label: t("pL_netProfit"),
      amount: view.netProfit,
      pct: view.pct(view.netProfit),
    })
    return rows
  }, [data, view, lang, t])

  const handleDownloadXlsx = React.useCallback(() => {
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
    downloadIncomeStatementXlsx(fname, headerLines, [t("pL_colItem"), t("pL_colAmount") || "금액", t("pL_pctOfSales")], buildXlsxRows())
  }, [data, view, storeLabel, storeFilter, t, buildXlsxRows])

  const handleDownloadPdf = React.useCallback(async () => {
    const el = printRef.current
    if (!el || !data || !view) return
    setExportingPdf(true)
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
      setExportingPdf(false)
    }
  }, [data, view, storeFilter])

  const onManualCheckedChange = (checked: boolean) => {
    setManualEnabled(checked)
    if (checked && data) {
      const saved = readIncomeStatementSalesOverride(yearMonthEnd, storeFilter)
      setManualAmountStr(saved?.enabled ? String(saved.amount) : String(data.sales))
    }
    if (!checked) {
      setManualAmountStr("")
    }
  }

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
                    disabled={isManager || !storeOptions.length}
                  >
                    <SelectTrigger className="w-[160px] h-9">
                      <SelectValue placeholder={t("pL_store")} />
                    </SelectTrigger>
                    <SelectContent>
                      {isOffice && <SelectItem value="All">{t("all") || "전체"}</SelectItem>}
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
            <Button
              size="sm"
              variant={showExpenseDetails ? "default" : "outline"}
              disabled={isRangeCompare}
              title={isRangeCompare ? t("fs_multiPeriodExportsNote") : undefined}
              onClick={() => setShowExpenseDetails((v) => !v)}
            >
              {showExpenseDetails ? t("pL_expenseDetailOn") : t("pL_expenseDetailOff")}
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
              {t("loadingItems") || "불러오는 중..."}
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
                  {compareGranularity === "year" && (
                    <p className="text-xs text-muted-foreground">{t("fs_compareYearPlNote")}</p>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {yearMonthStart === yearMonthEnd
                      ? yearMonthEnd
                      : `${yearMonthStart} ~ ${yearMonthEnd}`}{" "}
                    · {storeLabel}
                  </div>
                  {incomeCompareCols.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t("inNoData") || "조회된 내역이 없습니다."}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <table className="text-sm w-full min-w-max">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="text-left p-2 font-medium sticky left-0 bg-muted/40 z-10 min-w-[140px]">
                              {t("pL_colItem")}
                            </th>
                            {incomeCompareCols.map((c) => (
                              <th key={c.key} className="text-right p-2 font-medium font-mono whitespace-nowrap">
                                {c.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {incomeComparePlRows.map((row) => (
                            <tr key={row.key} className="border-b last:border-0">
                              <td className="p-2 font-medium sticky left-0 bg-background z-10">{row.label}</td>
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
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {isRangeCompare &&
                !showIncomeCompareTable &&
                !loading &&
                incomeCompareFetchId > 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("inNoData") || "조회된 내역이 없습니다."}
                  </p>
                )}
              {isRangeCompare &&
                !showIncomeCompareTable &&
                !loading &&
                incomeCompareFetchId === 0 &&
                !props.hideControls && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("msg_click_query") || "조회 버튼을 눌러 주세요."}
                  </p>
                )}
              {!isRangeCompare && (
                <div className="space-y-3 mb-4 pb-4 border-b">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="pl-manual-sales"
                        checked={manualEnabled}
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
                        aria-label={t("pL_manualSalesPlaceholder")}
                      />
                    )}
                    <p className="text-xs text-muted-foreground max-w-md shrink-0">{t("pL_manualSalesNote")}</p>
                  </div>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="pl-manual-beg-inv"
                        checked={begInvManualEnabled}
                        onCheckedChange={(v) => {
                          const checked = v === true
                          setBegInvManualEnabled(checked)
                          if (checked) {
                            const saved = readIncomeStatementBeginningInvOverride(yearMonthEnd, storeFilter)
                            if (saved?.enabled) setBegInvAmountStr(String(saved.amount))
                            else if (data) setBegInvAmountStr(String(data.beginningInventory ?? 0))
                            else setBegInvAmountStr("")
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
                        aria-label={t("pL_manualBegInvPlaceholder")}
                      />
                    )}
                    <p className="text-xs text-muted-foreground max-w-xl">{t("pL_manualBegInvNote")}</p>
                  </div>
                  {!data && (
                    <p className="text-xs text-muted-foreground">{t("pL_manualOverridesAfterQuery")}</p>
                  )}
                </div>
              )}

              {!isRangeCompare && data && view ? (
            <div className="overflow-x-auto">
              <div ref={printRef} className="rounded-md bg-white p-3 text-foreground">
                <div className="text-lg font-semibold mb-1">{t("incomeStatementTitle")}</div>
                <div className="text-sm text-muted-foreground mb-2">
                  {data.yearMonth} · {storeLabel}
                </div>
                {view.useManualSales && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {t("pL_systemSalesLabel")}: {formatBath(view.systemSales)}
                  </div>
                )}
                {view.useManualBegInv && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {t("pL_systemBegInvLabel")}: {formatBath(view.systemBeginningInventory)}
                  </div>
                )}
                {showExpenseDetails && (data.diagnostics?.warnings?.length || 0) > 0 && (
                  <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {data.diagnostics?.warnings?.join(" / ")}
                  </div>
                )}
                <table className="w-full max-w-md text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 text-left font-medium"></th>
                      <th className="py-2 text-right font-medium pr-2">{t("pL_colAmount") || "금액"}</th>
                      <th className="py-2 text-right font-medium w-14">{t("pL_pctOfSales")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 font-medium">{t("pL_sales")}</td>
                      <td className="py-2 text-right font-mono pr-2">{formatBath(view.sales)}</td>
                      <td className="py-2 text-right text-muted-foreground">100.0%</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 text-muted-foreground pl-4">+ {t("pL_beginningInv")}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                        {formatBath(view.beginningInventory)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {view.pct(view.beginningInventory)}
                      </td>
                    </tr>
                    <tr
                      className="border-b cursor-pointer hover:bg-muted/40 select-none"
                      onClick={() => setExpandPurchases((v) => !v)}
                      title={t("pL_clickToExpand") || ""}
                    >
                      <td className="py-2 text-muted-foreground pl-4">
                        <span className="inline-flex items-center gap-1">
                          {expandPurchases ? (
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                          )}
                          + {t("pL_purchases")}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                        {formatBath(data.purchases)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{view.pct(data.purchases)}</td>
                    </tr>
                    {expandPurchases &&
                      (data.purchaseByVendor?.length || 0) > 0 &&
                      data.purchaseByVendor!.map((row) => (
                        <tr key={row.key} className="border-b bg-muted/20">
                          <td className="py-1.5 text-muted-foreground pl-10 text-xs">
                            {purchaseVendorLabel(row.key)}
                          </td>
                          <td className="py-1.5 text-right font-mono text-muted-foreground pr-2 text-xs">
                            {formatBath(row.amount)}
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground text-xs">
                            {view.pct(row.amount)}
                          </td>
                        </tr>
                      ))}
                    {expandPurchases && !(data.purchaseByVendor?.length || 0) && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={3} className="py-2 pl-10 text-xs text-muted-foreground">
                          {t("inNoData") || "조회된 내역이 없습니다."}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b">
                      <td className="py-2 text-muted-foreground pl-4">- {t("pL_endingInv")}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                        {formatBath(data.endingInventory ?? 0)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {view.pct(-(data.endingInventory ?? 0))}
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 text-muted-foreground">= {t("pL_cogs")}</td>
                      <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                        {formatBath(view.cogs)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{view.pct(view.cogs)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 font-medium text-primary">{t("pL_grossProfit")}</td>
                      <td className="py-2 text-right font-mono font-medium text-primary pr-2">
                        {formatBath(view.grossProfit)}
                      </td>
                      <td className="py-2 text-right text-primary font-medium">
                        {view.pct(view.grossProfit)}
                      </td>
                    </tr>
                    <tr
                      className="border-b cursor-pointer hover:bg-muted/40 select-none"
                      onClick={() => setExpandExpenseAccounts((v) => !v)}
                      title={t("pL_clickToExpand") || ""}
                    >
                      <td className="py-2 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {expandExpenseAccounts ? (
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                          )}
                          - {t("pL_expenses")}
                        </span>
                      </td>
                      <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                        {formatBath(data.expenses)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{view.pct(data.expenses)}</td>
                    </tr>
                    {expandExpenseAccounts &&
                      (data.expenseByAccountSubject?.length || 0) > 0 &&
                      data.expenseByAccountSubject!.map((row, idx) => (
                        <tr
                          key={`${row.accountSubjectId ?? "u"}-${idx}`}
                          className="border-b bg-muted/20"
                        >
                          <td className="py-1.5 text-muted-foreground pl-10 text-xs">
                            {row.accountSubjectId == null
                              ? t("pL_accountUnclassified") || "계정 미지정"
                              : formatAccountSubjectLabel(lang, {
                                  code: row.code,
                                  name: row.name,
                                  nameEn: row.nameEn,
                                  nameTh: row.nameTh,
                                }) ||
                                (row.accountSubjectId != null ? `#${row.accountSubjectId}` : "")}
                          </td>
                          <td className="py-1.5 text-right font-mono text-muted-foreground pr-2 text-xs">
                            {formatBath(row.amount)}
                          </td>
                          <td className="py-1.5 text-right text-muted-foreground text-xs">
                            {view.pct(row.amount)}
                          </td>
                        </tr>
                      ))}
                    {expandExpenseAccounts && !(data.expenseByAccountSubject?.length || 0) && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={3} className="py-2 pl-10 text-xs text-muted-foreground">
                          {t("inNoData") || "조회된 내역이 없습니다."}
                        </td>
                      </tr>
                    )}
                    {showExpenseDetails && (
                      <>
                        <tr className="border-b">
                          <td className="py-2 text-muted-foreground pl-4">
                            - {t("pL_expenseSourcePetty") || "현금시재(패티캐시)"}
                          </td>
                          <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                            {formatBath(data.expenseBreakdown?.pettyCash ?? 0)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {view.pct(data.expenseBreakdown?.pettyCash ?? 0)}
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-2 text-muted-foreground pl-4">
                            - {t("pL_expenseSourceBank") || "통장 출금"}
                          </td>
                          <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                            {formatBath(data.expenseBreakdown?.bankWithdraw ?? 0)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {view.pct(data.expenseBreakdown?.bankWithdraw ?? 0)}
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-2 text-muted-foreground pl-4">
                            - {t("pL_expenseSourceFixed") || "고정비"}
                          </td>
                          <td className="py-2 text-right font-mono text-muted-foreground pr-2">
                            {formatBath(data.expenseBreakdown?.fixedExpenses ?? 0)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {view.pct(data.expenseBreakdown?.fixedExpenses ?? 0)}
                          </td>
                        </tr>
                      </>
                    )}
                    <tr>
                      <td className="py-3 font-bold">{t("pL_netProfit")}</td>
                      <td
                        className={`py-3 text-right font-mono font-bold pr-2 ${
                          view.netProfit >= 0 ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {formatBath(view.netProfit)}
                      </td>
                      <td
                        className={`py-3 text-right font-bold ${
                          view.netProfit >= 0 ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {view.pct(view.netProfit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
              ) : !isRangeCompare ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("msg_click_query") || "조회 버튼을 눌러 주세요."}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
