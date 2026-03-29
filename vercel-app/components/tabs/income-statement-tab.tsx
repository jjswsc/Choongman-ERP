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
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import { useAuth } from "@/lib/auth-context"
import { isManagerOrFranchiseeRole, isOfficeRole } from "@/lib/permissions"
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

export function IncomeStatementTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores: storeList } = useStoreList()

  const isOffice = isOfficeRole(auth?.role || "")
  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()

  const [yearMonth, setYearMonth] = React.useState(() => getBangkokRecentYearMonths(1)[0])
  const [storeFilter, setStoreFilter] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )
  const [data, setData] = React.useState<IncomeStatementData | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showExpenseDetails, setShowExpenseDetails] = React.useState(false)
  const [expandPurchases, setExpandPurchases] = React.useState(false)
  const [expandExpenseAccounts, setExpandExpenseAccounts] = React.useState(false)
  const [manualEnabled, setManualEnabled] = React.useState(false)
  const [manualAmountStr, setManualAmountStr] = React.useState("")
  const [exportingPdf, setExportingPdf] = React.useState(false)

  const printRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (isManager && managerStore) {
      setStoreFilter(managerStore)
    }
  }, [isManager, managerStore])

  React.useEffect(() => {
    setExpandPurchases(false)
    setExpandExpenseAccounts(false)
  }, [yearMonth, storeFilter])

  React.useEffect(() => {
    const o = readIncomeStatementSalesOverride(yearMonth, storeFilter)
    if (o?.enabled) {
      setManualEnabled(true)
      setManualAmountStr(String(o.amount))
    } else {
      setManualEnabled(false)
      setManualAmountStr("")
    }
  }, [yearMonth, storeFilter])

  React.useEffect(() => {
    if (!manualEnabled) {
      writeIncomeStatementSalesOverride(yearMonth, storeFilter, false, 0)
      return
    }
    const p = parseSalesOverrideInput(manualAmountStr)
    if (p == null) return
    writeIncomeStatementSalesOverride(yearMonth, storeFilter, true, p)
  }, [yearMonth, storeFilter, manualEnabled, manualAmountStr])

  const loadData = React.useCallback(() => {
    setLoading(true)
    getIncomeStatement({
      yearMonth,
      storeFilter: storeFilter !== "All" ? storeFilter : undefined,
      userStore: auth?.store,
      userRole: auth?.role,
      includeDebug: showExpenseDetails,
    })
      .then((r) => setData(r))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [yearMonth, storeFilter, auth?.store, auth?.role, showExpenseDetails])

  const yearMonthOptions = getBangkokRecentYearMonths(24).map((value) => {
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
    const cogs = data.cogs ?? 0
    const expenses = data.expenses
    const parsed = parseSalesOverrideInput(manualAmountStr)
    const useManual = manualEnabled && parsed != null
    const sales = useManual ? parsed : data.sales
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
      useManual,
      systemSales: data.sales,
      expenses,
    }
  }, [data, manualEnabled, manualAmountStr])

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
      amount: data.beginningInventory ?? 0,
      pct: view.pct(data.beginningInventory ?? 0),
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
      ...(view.useManual
        ? [`${t("pL_systemSalesLabel")}: ${formatBath(view.systemSales)}`]
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
      const saved = readIncomeStatementSalesOverride(yearMonth, storeFilter)
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
            <Select value={yearMonth} onValueChange={setYearMonth}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder={t("pL_month")} />
              </SelectTrigger>
              <SelectContent>
                {yearMonthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button
              size="sm"
              variant={showExpenseDetails ? "default" : "outline"}
              onClick={() => setShowExpenseDetails((v) => !v)}
            >
              {showExpenseDetails ? t("pL_expenseDetailOn") : t("pL_expenseDetailOff")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || !view || loading}
              onClick={handleDownloadXlsx}
            >
              <Table className="h-4 w-4 mr-1" />
              {t("pL_exportXlsx")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!data || !view || loading || exportingPdf}
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
          ) : data && view ? (
            <div className="overflow-x-auto">
              <div className="flex flex-wrap items-end gap-4 mb-3 pb-3 border-b">
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
                <p className="text-xs text-muted-foreground max-w-md">{t("pL_manualSalesNote")}</p>
              </div>

              <div ref={printRef} className="rounded-md bg-white p-3 text-foreground">
                <div className="text-lg font-semibold mb-1">{t("incomeStatementTitle")}</div>
                <div className="text-sm text-muted-foreground mb-2">
                  {data.yearMonth} · {storeLabel}
                </div>
                {view.useManual && (
                  <div className="text-xs text-muted-foreground mb-2">
                    {t("pL_systemSalesLabel")}: {formatBath(view.systemSales)}
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
                        {formatBath(data.beginningInventory ?? 0)}
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {view.pct(data.beginningInventory ?? 0)}
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
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("msg_click_query") || "조회 버튼을 눌러 주세요."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
