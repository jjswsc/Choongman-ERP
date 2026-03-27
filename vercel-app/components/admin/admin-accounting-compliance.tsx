"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Landmark, ExternalLink, Save, Plus, Trash2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { canManageAccountingCompliance } from "@/lib/accounting-auth"
import { THAI_FILING_DEFINITIONS, type ThaiFilingType } from "@/lib/thai-filing-scope"
import { THAI_GOV_FILING_CHANNELS, GOV_INTEGRATION_PHASES } from "@/lib/thai-gov-filing-channels"
import { CHART_OF_ACCOUNTS_BY_CODE } from "@/lib/chart-of-accounts-mapping"
import {
  useStoreList,
  getAccountingFilingPreferences,
  saveAccountingFilingPreferences,
  getAccountingPeriods,
  setAccountingPeriodClosed,
  getTrialBalance,
  getVatLedger,
  saveVatLedgerEntry,
  deleteVatLedgerEntry,
  getWithholdingTaxLedger,
  saveWithholdingTaxLedgerEntry,
  deleteWithholdingTaxLedgerEntry,
  getExportVatLedgerCsvUrl,
  getExportWithholdingTaxLedgerCsvUrl,
  getThaiTaxFilingSummary,
  type ThaiTaxFilingSummary,
  getCorporateTaxComputation,
  type CorporateTaxComputationData,
  getExportCorporateTaxPackageCsvUrl,
  getAccountingWorkflowStatus,
  saveAccountingWorkflowStatus,
  type AccountingWorkflowStatusRow,
  type ThaiFilingResponsibility,
  type TrialBalanceRow,
} from "@/lib/api-client"
import { isOfficeRole, isManagerOrFranchiseeRole } from "@/lib/permissions"
import { appAlert } from "@/lib/app-message"

type VatDraft = {
  id?: number
  doc_date: string
  tax_month: string
  direction: "output" | "input"
  counterparty_name: string
  counterparty_tax_id: string
  invoice_number: string
  net_amount: string
  vat_amount: string
  total_amount: string
  vat_status: string
  memo: string
  store_name: string
}

type WhtDraft = {
  id?: number
  payment_date: string
  tax_month: string
  payee_name: string
  payee_tax_id: string
  income_type: string
  gross_amount: string
  wht_rate: string
  wht_amount: string
  form_hint: string
  certificate_no: string
  memo: string
}

function ymNow(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}

function emptyVat(taxMonth: string): VatDraft {
  return {
    doc_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    direction: "output",
    counterparty_name: "",
    counterparty_tax_id: "",
    invoice_number: "",
    net_amount: "",
    vat_amount: "",
    total_amount: "",
    vat_status: "",
    memo: "",
    store_name: "",
  }
}

function emptyWht(taxMonth: string): WhtDraft {
  return {
    payment_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    payee_name: "",
    payee_tax_id: "",
    income_type: "",
    gross_amount: "",
    wht_rate: "",
    wht_amount: "",
    form_hint: "",
    certificate_no: "",
    memo: "",
  }
}

export function AdminAccountingCompliance() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const role = auth?.role || ""
  const canUse = canManageAccountingCompliance(role)
  const { stores: storeList } = useStoreList()
  const isOffice = isOfficeRole(role)
  const isManager = isManagerOrFranchiseeRole(role)
  const managerStore = (auth?.store || "").trim()

  const [tab, setTab] = React.useState("scope")
  const [taxMonth, setTaxMonth] = React.useState(ymNow)
  const [yearMonthTb, setYearMonthTb] = React.useState(ymNow)
  const [storeTb, setStoreTb] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )

  const [resp, setResp] = React.useState<Record<string, ThaiFilingResponsibility>>({})
  const [notes, setNotes] = React.useState("")
  const [periods, setPeriods] = React.useState<
    { yearMonth: string; isClosed: boolean; closedAt: string | null; closedBy: string | null }[]
  >([])
  const [tbRows, setTbRows] = React.useState<TrialBalanceRow[]>([])
  const [tbTotals, setTbTotals] = React.useState({ debit: 0, credit: 0, diff: 0 })
  const [vatRows, setVatRows] = React.useState<VatDraft[]>([])
  const [whtRows, setWhtRows] = React.useState<WhtDraft[]>([])
  const [periodType, setPeriodType] = React.useState<"monthly" | "half_year" | "annual">("monthly")
  const [taxSummary, setTaxSummary] = React.useState<ThaiTaxFilingSummary | null>(null)
  const [citData, setCitData] = React.useState<CorporateTaxComputationData | null>(null)
  const [workflowRows, setWorkflowRows] = React.useState<AccountingWorkflowStatusRow[]>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (isManager && managerStore) setStoreTb(managerStore)
  }, [isManager, managerStore])

  const loadPrefs = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    try {
      const data = await getAccountingFilingPreferences({ userRole: role })
      setResp((data.responsibilities || {}) as Record<string, ThaiFilingResponsibility>)
      setNotes(data.notes || "")
    } catch {
      appAlert(t("accCompLoadFail"))
    }
  }, [canUse, auth?.user, role, t])

  const loadPeriods = React.useCallback(async () => {
    if (!canUse) return
    try {
      const data = await getAccountingPeriods({ userRole: role })
      setPeriods(data.periods || [])
    } catch {
      setPeriods([])
    }
  }, [canUse, role])

  const loadTrial = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getTrialBalance({
        userRole: role,
        yearMonth: yearMonthTb,
        storeFilter: storeTb,
        userStore: auth?.store,
      })
      setTbRows(data.rows || [])
      setTbTotals({ debit: data.totalDebit, credit: data.totalCredit, diff: data.diff })
    } catch {
      setTbRows([])
      appAlert(t("accCompLoadFail"))
    } finally {
      setLoading(false)
    }
  }, [canUse, role, yearMonthTb, storeTb, auth?.store, t])

  const mapVat = React.useCallback(
    (entries: Record<string, unknown>[]): VatDraft[] =>
      entries.map((r) => ({
        id: r.id != null ? Number(r.id) : undefined,
        doc_date: String(r.doc_date || "").slice(0, 10),
        tax_month: String(r.tax_month || taxMonth).slice(0, 7),
        direction: r.direction === "input" ? "input" : "output",
        counterparty_name: String(r.counterparty_name || ""),
        counterparty_tax_id: String(r.counterparty_tax_id || ""),
        invoice_number: String(r.invoice_number || ""),
        net_amount: String(r.net_amount ?? ""),
        vat_amount: String(r.vat_amount ?? ""),
        total_amount: String(r.total_amount ?? ""),
        vat_status: String(r.vat_status || ""),
        memo: String(r.memo || ""),
        store_name: String(r.store_name || ""),
      })),
    [taxMonth]
  )

  const loadVat = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getVatLedger({ userRole: role, taxMonth })
      setVatRows(mapVat(data.entries || []))
    } catch {
      setVatRows([])
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, mapVat])

  const mapWht = React.useCallback(
    (entries: Record<string, unknown>[]): WhtDraft[] =>
      entries.map((r) => ({
        id: r.id != null ? Number(r.id) : undefined,
        payment_date: String(r.payment_date || "").slice(0, 10),
        tax_month: String(r.tax_month || taxMonth).slice(0, 7),
        payee_name: String(r.payee_name || ""),
        payee_tax_id: String(r.payee_tax_id || ""),
        income_type: String(r.income_type || ""),
        gross_amount: String(r.gross_amount ?? ""),
        wht_rate: String(r.wht_rate ?? ""),
        wht_amount: String(r.wht_amount ?? ""),
        form_hint: String(r.form_hint || ""),
        certificate_no: String(r.certificate_no || ""),
        memo: String(r.memo || ""),
      })),
    [taxMonth]
  )

  const loadWht = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getWithholdingTaxLedger({ userRole: role, taxMonth })
      setWhtRows(mapWht(data.entries || []))
    } catch {
      setWhtRows([])
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, mapWht])

  const loadTaxSummary = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getThaiTaxFilingSummary({
        userRole: role,
        yearMonth: taxMonth,
        periodType,
      })
      setTaxSummary(data)
    } catch {
      setTaxSummary(null)
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType])

  const loadCit = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getCorporateTaxComputation({
        userRole: role,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeTb,
        userStore: auth?.store,
      })
      setCitData(data)
    } catch {
      setCitData(null)
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeTb, auth?.store])

  const loadWorkflow = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getAccountingWorkflowStatus({ userRole: role, yearMonth: taxMonth })
      setWorkflowRows(data.rows || [])
    } catch {
      setWorkflowRows([])
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth])

  React.useEffect(() => {
    if (canUse) void loadPrefs()
  }, [canUse, loadPrefs])

  React.useEffect(() => {
    if (canUse && tab === "period") void loadPeriods()
  }, [canUse, tab, loadPeriods])

  React.useEffect(() => {
    if (canUse && tab === "trial") void loadTrial()
  }, [canUse, tab, loadTrial])

  React.useEffect(() => {
    if (canUse && tab === "vat") void loadVat()
  }, [canUse, tab, loadVat])

  React.useEffect(() => {
    if (canUse && tab === "wht") void loadWht()
  }, [canUse, tab, loadWht])

  React.useEffect(() => {
    if (canUse && tab === "summary") void loadTaxSummary()
  }, [canUse, tab, loadTaxSummary])

  React.useEffect(() => {
    if (canUse && tab === "cit") void loadCit()
  }, [canUse, tab, loadCit])

  React.useEffect(() => {
    if (canUse && tab === "workflow") void loadWorkflow()
  }, [canUse, tab, loadWorkflow])

  const savePrefs = async () => {
    if (!canUse) return
    try {
      await saveAccountingFilingPreferences({
        userRole: role,
        responsibilities: resp as Record<string, ThaiFilingResponsibility>,
        notes,
      })
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const togglePeriod = async (yearMonth: string, closed: boolean) => {
    if (!canUse || !auth?.user) return
    try {
      await setAccountingPeriodClosed({
        userRole: role,
        yearMonth,
        closed,
        closedBy: auth.user,
      })
      await loadPeriods()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const saveVatRow = async (row: VatDraft) => {
    if (!canUse) return
    try {
      const res = await saveVatLedgerEntry({
        userRole: role,
        id: row.id,
        docDate: row.doc_date,
        taxMonth: row.tax_month,
        direction: row.direction,
        counterpartyName: row.counterparty_name || null,
        counterpartyTaxId: row.counterparty_tax_id || null,
        invoiceNumber: row.invoice_number || null,
        netAmount: Number(row.net_amount) || 0,
        vatAmount: Number(row.vat_amount) || 0,
        totalAmount: Number(row.total_amount) || 0,
        vatStatus: row.vat_status || null,
        memo: row.memo || null,
        storeName: row.store_name || null,
        createdBy: auth?.user,
      })
      if (!res.success) throw new Error(res.error)
      await loadVat()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const removeVat = async (row: VatDraft) => {
    if (!row.id) {
      setVatRows((prev) => prev.filter((r) => r !== row))
      return
    }
    if (!canUse) return
    try {
      await deleteVatLedgerEntry({ userRole: role, id: row.id })
      await loadVat()
    } catch {
      appAlert(t("msg_delete_fail"))
    }
  }

  const saveWhtRow = async (row: WhtDraft) => {
    if (!canUse) return
    try {
      const res = await saveWithholdingTaxLedgerEntry({
        userRole: role,
        id: row.id,
        paymentDate: row.payment_date,
        taxMonth: row.tax_month,
        payeeName: row.payee_name || null,
        payeeTaxId: row.payee_tax_id || null,
        incomeType: row.income_type || null,
        grossAmount: row.gross_amount ? Number(row.gross_amount) : null,
        whtRate: row.wht_rate ? Number(row.wht_rate) : null,
        whtAmount: Number(row.wht_amount) || 0,
        formHint: row.form_hint || null,
        certificateNo: row.certificate_no || null,
        memo: row.memo || null,
        createdBy: auth?.user,
      })
      if (!res.success) throw new Error(res.error)
      await loadWht()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const removeWht = async (row: WhtDraft) => {
    if (!row.id) {
      setWhtRows((prev) => prev.filter((r) => r !== row))
      return
    }
    if (!canUse) return
    try {
      await deleteWithholdingTaxLedgerEntry({ userRole: role, id: row.id })
      await loadWht()
    } catch {
      appAlert(t("msg_delete_fail"))
    }
  }

  const upsertWorkflowStatus = async (
    filingType: string,
    status: "todo" | "in_progress" | "review" | "done"
  ) => {
    if (!canUse) return
    try {
      const cur = workflowRows.find((r) => r.filing_type === filingType)
      await saveAccountingWorkflowStatus({
        userRole: role,
        yearMonth: taxMonth,
        filingType,
        status,
        note: cur?.note || null,
        owner: cur?.owner || null,
        updatedBy: auth?.user || null,
      })
      await loadWorkflow()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const chartList = React.useMemo(
    () => Object.values(CHART_OF_ACCOUNTS_BY_CODE).sort((a, b) => a.code.localeCompare(b.code)),
    []
  )

  const storeOptions = React.useMemo(() => {
    if (!isOffice) return isManager && managerStore ? [managerStore] : []
    return [
      "All",
      ...((storeList || []).filter(
        (s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office")
      ) || []),
    ]
  }, [isOffice, isManager, managerStore, storeList])

  if (!canUse) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">{t("accCompOfficeOnly")}</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
        <div className={adminTabsBarCn}>
          <div className={adminTabsScrollCn}>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="scope" className={adminTabsTriggerCn}>
                {t("accCompTabScope")}
              </TabsTrigger>
              <TabsTrigger value="channels" className={adminTabsTriggerCn}>
                {t("accCompTabChannels")}
              </TabsTrigger>
              <TabsTrigger value="resp" className={adminTabsTriggerCn}>
                {t("accCompTabResp")}
              </TabsTrigger>
              <TabsTrigger value="period" className={adminTabsTriggerCn}>
                {t("accCompTabPeriod")}
              </TabsTrigger>
              <TabsTrigger value="trial" className={adminTabsTriggerCn}>
                {t("accCompTabTrial")}
              </TabsTrigger>
              <TabsTrigger value="vat" className={adminTabsTriggerCn}>
                {t("accCompTabVat")}
              </TabsTrigger>
              <TabsTrigger value="wht" className={adminTabsTriggerCn}>
                {t("accCompTabWht")}
              </TabsTrigger>
              <TabsTrigger value="summary" className={adminTabsTriggerCn}>
                Tax Summary
              </TabsTrigger>
              <TabsTrigger value="cit" className={adminTabsTriggerCn}>
                CIT(PND50/51)
              </TabsTrigger>
              <TabsTrigger value="workflow" className={adminTabsTriggerCn}>
                Workflow
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="scope" className={cn(adminTabsContentCn, "space-y-3")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                {t("accCompTabScope")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{t("accCompPhaseNote")}</p>
              <ul className="list-disc pl-5 space-y-2">
                {THAI_FILING_DEFINITIONS.map((d) => (
                  <li key={d.id}>
                    <span className="font-medium">
                      {lang === "th" ? d.labelTh : lang === "ko" ? d.labelKo : d.labelEn}
                    </span>
                    {d.rdFormHint ? (
                      <span className="text-muted-foreground"> ({d.rdFormHint})</span>
                    ) : null}
                    <div className="text-muted-foreground text-xs mt-0.5">{d.frequencyKo}</div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("accCompChartTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">KO</th>
                    <th className="text-left p-2">EN</th>
                    <th className="text-left p-2">TFRS (참고)</th>
                  </tr>
                </thead>
                <tbody>
                  {chartList.map((c) => (
                    <tr key={c.code} className="border-b border-border/60">
                      <td className="p-2 font-mono">{c.code}</td>
                      <td className="p-2">{c.nameKo}</td>
                      <td className="p-2">{c.nameEn}</td>
                      <td className="p-2 text-muted-foreground">{c.tfrsNpaesGroupKo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className={cn(adminTabsContentCn, "space-y-3")}>
          <Card>
            <CardContent className="pt-6 text-sm space-y-4">
              <p className="text-muted-foreground">{GOV_INTEGRATION_PHASES.phase1}</p>
              <p className="text-muted-foreground">{GOV_INTEGRATION_PHASES.phase2}</p>
              <p className="text-muted-foreground">{GOV_INTEGRATION_PHASES.phase3}</p>
              {THAI_GOV_FILING_CHANNELS.map((ch) => (
                <div key={ch.id} className="border rounded-lg p-3 space-y-2">
                  <div className="font-medium">
                    {lang === "ko" ? ch.agencyKo : ch.agencyEn}
                  </div>
                  <div className="text-muted-foreground text-xs">{ch.purposeKo}</div>
                  <div className="text-xs">{ch.integrationKo}</div>
                  {ch.envHints?.length ? (
                    <div className="text-xs font-mono text-muted-foreground">{ch.envHints.join(", ")}</div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {ch.urls.map((u) => (
                      <a
                        key={u.href}
                        href={u.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary text-xs underline"
                      >
                        {u.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground px-1">{t("accCompBankReconcileHint")}</p>
        </TabsContent>

        <TabsContent value="resp" className={cn(adminTabsContentCn, "space-y-3")}>
          <Card>
            <CardContent className="pt-6 space-y-4">
              {THAI_FILING_DEFINITIONS.map((d) => {
                const id = d.id as ThaiFilingType
                const v = resp[id] || "tbd"
                return (
                  <div key={d.id} className="flex flex-col sm:flex-row sm:items-center gap-2 border-b pb-3">
                    <div className="flex-1 text-sm font-medium">
                      {lang === "th" ? d.labelTh : lang === "ko" ? d.labelKo : d.labelEn}
                    </div>
                    <Select
                      value={v}
                      onValueChange={(nv) =>
                        setResp((prev) => ({
                          ...prev,
                          [id]: nv as ThaiFilingResponsibility,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_house">{t("accCompInHouse")}</SelectItem>
                        <SelectItem value="tax_agent">{t("accCompTaxAgent")}</SelectItem>
                        <SelectItem value="tbd">{t("accCompTbd")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )
              })}
              <div>
                <div className="text-sm font-medium mb-1">{t("accCompNotesPlaceholder")}</div>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
              </div>
              <Button type="button" onClick={() => void savePrefs()}>
                <Save className="h-4 w-4 mr-2" />
                {t("accCompSave")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="period" className={adminTabsContentCn}>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{t("accCompTabPeriod")}</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.yearMonth} className="border-b border-border/60">
                      <td className="p-2 font-mono">{p.yearMonth}</td>
                      <td className="p-2">
                        {p.isClosed ? (
                          <span className="text-amber-600">{t("accCompPeriodClosedLabel")}</span>
                        ) : (
                          <span className="text-muted-foreground">{t("accCompPeriodProgress")}</span>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={p.isClosed ? "secondary" : "default"}
                          onClick={() => void togglePeriod(p.yearMonth, !p.isClosed)}
                        >
                          {p.isClosed ? t("accCompPeriodOpen") : t("accCompPeriodClose")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial" className={cn(adminTabsContentCn, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">YYYY-MM</div>
              <Input
                className="w-[140px]"
                value={yearMonthTb}
                onChange={(e) => setYearMonthTb(e.target.value.slice(0, 7))}
              />
            </div>
            {isOffice && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Store</div>
                <Select value={storeTb} onValueChange={setStoreTb}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button type="button" variant="secondary" onClick={() => void loadTrial()} disabled={loading}>
              {t("search")}
            </Button>
          </div>
          <div className="text-sm flex flex-wrap gap-4">
            <span>
              {t("accCompTrialDebit")}: <b>{tbTotals.debit.toLocaleString()}</b>
            </span>
            <span>
              {t("accCompTrialCredit")}: <b>{tbTotals.credit.toLocaleString()}</b>
            </span>
            <span>
              {t("accCompTrialDiff")}: <b>{tbTotals.diff.toLocaleString()}</b>
            </span>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-right p-2">Dr</th>
                    <th className="text-right p-2">Cr</th>
                    <th className="text-right p-2">Net Dr</th>
                  </tr>
                </thead>
                <tbody>
                  {tbRows.map((r) => (
                    <tr key={r.accountCode} className="border-b border-border/50">
                      <td className="p-2 font-mono">{r.accountCode}</td>
                      <td className="p-2">{r.accountName}</td>
                      <td className="p-2 text-right">{r.debit.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.credit.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.netDebit.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vat" className={cn(adminTabsContentCn, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">tax_month</div>
              <Input
                className="w-[140px]"
                value={taxMonth}
                onChange={(e) => setTaxMonth(e.target.value.slice(0, 7))}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadVat()} disabled={loading}>
              {t("search")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setVatRows((prev) => [...prev, emptyVat(taxMonth)])}>
              <Plus className="h-4 w-4 mr-1" />
              {t("accCompVatAdd")}
            </Button>
            <Button type="button" variant="outline" asChild>
              <a href={getExportVatLedgerCsvUrl({ userRole: role, taxMonth })} target="_blank" rel="noopener noreferrer">
                {t("accCompVatExport")}
              </a>
            </Button>
          </div>
          <Card>
            <CardContent className="p-2 overflow-x-auto space-y-3">
              {vatRows.map((row, idx) => (
                <div
                  key={row.id ?? `new-${idx}`}
                  className="border rounded-md p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs"
                >
                  <Input type="date" value={row.doc_date} onChange={(e) => {
                    const v = e.target.value
                    setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, doc_date: v } : x)))
                  }} />
                  <Select
                    value={row.direction}
                    onValueChange={(v) =>
                      setVatRows((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, direction: v as "output" | "input" } : x))
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="output">output</SelectItem>
                      <SelectItem value="input">input</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="counterparty"
                    value={row.counterparty_name}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, counterparty_name: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="TIN"
                    value={row.counterparty_tax_id}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, counterparty_tax_id: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="invoice #"
                    value={row.invoice_number}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, invoice_number: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="net"
                    value={row.net_amount}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, net_amount: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="VAT"
                    value={row.vat_amount}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, vat_amount: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="total"
                    value={row.total_amount}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, total_amount: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="md:col-span-2"
                    placeholder="vat_status"
                    value={row.vat_status}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, vat_status: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="md:col-span-2"
                    placeholder="memo"
                    value={row.memo}
                    onChange={(e) =>
                      setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, memo: e.target.value } : x)))
                    }
                  />
                  <div className="flex gap-2 md:col-span-4">
                    <Button type="button" size="sm" onClick={() => void saveVatRow(row)}>
                      <Save className="h-3 w-3 mr-1" />
                      {t("accCompSave")}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void removeVat(row)}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t("accCompDelete")}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wht" className={cn(adminTabsContentCn, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">tax_month</div>
              <Input
                className="w-[140px]"
                value={taxMonth}
                onChange={(e) => setTaxMonth(e.target.value.slice(0, 7))}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadWht()} disabled={loading}>
              {t("search")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setWhtRows((prev) => [...prev, emptyWht(taxMonth)])}>
              <Plus className="h-4 w-4 mr-1" />
              {t("accCompVatAdd")}
            </Button>
            <Button type="button" variant="outline" asChild>
              <a href={getExportWithholdingTaxLedgerCsvUrl({ userRole: role, taxMonth })} target="_blank" rel="noopener noreferrer">
                WHT CSV
              </a>
            </Button>
          </div>
          <Card>
            <CardContent className="p-2 overflow-x-auto space-y-3">
              {whtRows.map((row, idx) => (
                <div
                  key={row.id ?? `w-new-${idx}`}
                  className="border rounded-md p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs"
                >
                  <Input
                    type="date"
                    value={row.payment_date}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, payment_date: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="payee"
                    value={row.payee_name}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, payee_name: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="payee TIN"
                    value={row.payee_tax_id}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, payee_tax_id: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="income type"
                    value={row.income_type}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, income_type: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="gross"
                    value={row.gross_amount}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, gross_amount: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="rate %"
                    value={row.wht_rate}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, wht_rate: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="WHT amt"
                    value={row.wht_amount}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, wht_amount: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="form (PND3/53...)"
                    value={row.form_hint}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, form_hint: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="md:col-span-2"
                    placeholder="certificate #"
                    value={row.certificate_no}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, certificate_no: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="md:col-span-2"
                    placeholder="memo"
                    value={row.memo}
                    onChange={(e) =>
                      setWhtRows((prev) => prev.map((x, i) => (i === idx ? { ...x, memo: e.target.value } : x)))
                    }
                  />
                  <div className="flex gap-2 md:col-span-4">
                    <Button type="button" size="sm" onClick={() => void saveWhtRow(row)}>
                      <Save className="h-3 w-3 mr-1" />
                      {t("accCompSave")}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void removeWht(row)}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t("accCompDelete")}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className={cn(adminTabsContentCn, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">year_month</div>
              <Input
                className="w-[140px]"
                value={taxMonth}
                onChange={(e) => setTaxMonth(e.target.value.slice(0, 7))}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">period_type</div>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as "monthly" | "half_year" | "annual")}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">monthly</SelectItem>
                  <SelectItem value="half_year">half_year</SelectItem>
                  <SelectItem value="annual">annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadTaxSummary()} disabled={loading}>
              {t("search")}
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm space-y-3">
              <div className="font-medium">VAT (PP30)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>Output VAT: {(taxSummary?.vat.outputVat || 0).toLocaleString()}</div>
                <div>Input VAT: {(taxSummary?.vat.inputVat || 0).toLocaleString()}</div>
                <div>Payable VAT: {(taxSummary?.vat.payableVat || 0).toLocaleString()}</div>
                <div>Missing TIN: {(taxSummary?.vat.missingTaxIdCount || 0).toLocaleString()}</div>
                <div>Missing Invoice: {(taxSummary?.vat.missingInvoiceCount || 0).toLocaleString()}</div>
                <div>Rows: {(taxSummary?.vat.rowCount || 0).toLocaleString()}</div>
              </div>
              <div className="font-medium pt-2">WHT (PND3/53)</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>Gross: {(taxSummary?.wht.totalGross || 0).toLocaleString()}</div>
                <div>Withheld: {(taxSummary?.wht.totalWithheld || 0).toLocaleString()}</div>
                <div>Rows: {(taxSummary?.wht.rowCount || 0).toLocaleString()}</div>
                <div>Missing TIN: {(taxSummary?.wht.missingTaxIdCount || 0).toLocaleString()}</div>
                <div>Missing Cert#: {(taxSummary?.wht.missingCertificateCount || 0).toLocaleString()}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cit" className={cn(adminTabsContentCn, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">year_month</div>
              <Input
                className="w-[140px]"
                value={taxMonth}
                onChange={(e) => setTaxMonth(e.target.value.slice(0, 7))}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">period_type</div>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as "monthly" | "half_year" | "annual")}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">monthly</SelectItem>
                  <SelectItem value="half_year">half_year</SelectItem>
                  <SelectItem value="annual">annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadCit()} disabled={loading}>
              {t("search")}
            </Button>
            <Button type="button" variant="outline" asChild>
              <a
                href={getExportCorporateTaxPackageCsvUrl({
                  userRole: role,
                  yearMonth: taxMonth,
                  periodType,
                  storeFilter: storeTb,
                  userStore: auth?.store,
                })}
                target="_blank"
                rel="noopener noreferrer"
              >
                CIT Package CSV
              </a>
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm space-y-2">
              <div>Accounting profit: {(citData?.accountingProfit || 0).toLocaleString()}</div>
              <div>Tax add-backs: {(citData?.taxAddBack || 0).toLocaleString()}</div>
              <div>Tax deductions: {(citData?.taxDeduction || 0).toLocaleString()}</div>
              <div>Taxable income: {(citData?.taxableIncome || 0).toLocaleString()}</div>
              <div>Tax rate: {((citData?.taxRate || 0) * 100).toFixed(2)}%</div>
              <div>Estimated CIT: {(citData?.estimatedTax || 0).toLocaleString()}</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className={cn(adminTabsContentCn, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">year_month</div>
              <Input
                className="w-[140px]"
                value={taxMonth}
                onChange={(e) => setTaxMonth(e.target.value.slice(0, 7))}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void loadWorkflow()} disabled={loading}>
              {t("search")}
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Filing</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-right p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {THAI_FILING_DEFINITIONS.map((d) => {
                    const row = workflowRows.find((r) => r.filing_type === d.id)
                    const status = row?.status || "todo"
                    return (
                      <tr key={d.id} className="border-b border-border/50">
                        <td className="p-2">{lang === "th" ? d.labelTh : lang === "ko" ? d.labelKo : d.labelEn}</td>
                        <td className="p-2">{status}</td>
                        <td className="p-2 text-right">
                          <div className="inline-flex gap-1">
                            <Button type="button" size="sm" variant="outline" onClick={() => void upsertWorkflowStatus(d.id, "in_progress")}>Start</Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => void upsertWorkflowStatus(d.id, "review")}>Review</Button>
                            <Button type="button" size="sm" onClick={() => void upsertWorkflowStatus(d.id, "done")}>Done</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
