"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsContentEmbeddedCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsRootEmbeddedCn,
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
import { Landmark, ExternalLink, Save, Plus, Trash2, Download, CalendarClock } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  canApproveAccountingCompliance,
  canApproveAccountingPeriodUnlock,
  canManageAccountingCompliance,
  canWriteAccountingCompliance,
} from "@/lib/accounting-auth"
import { THAI_FILING_DEFINITIONS, type ThaiFilingType } from "@/lib/thai-filing-scope"
import {
  THAI_FILING_SCHEDULE_SECTIONS,
  THAI_FILING_SCHEDULE_TABLE_ROWS,
} from "@/lib/thai-filing-schedule-guide"
import { THAI_GOV_FILING_CHANNELS, GOV_INTEGRATION_PHASES } from "@/lib/thai-gov-filing-channels"
import { CHART_OF_ACCOUNTS_BY_CODE } from "@/lib/chart-of-accounts-mapping"
import {
  useStoreList,
  getAccountingFilingPreferences,
  saveAccountingFilingPreferences,
  getAccountingPeriods,
  setAccountingPeriodClosed,
  getTrialBalance,
  getAccountingReconciliation,
  getVatLedger,
  saveVatLedgerEntry,
  deleteVatLedgerEntry,
  getWithholdingTaxLedger,
  saveWithholdingTaxLedgerEntry,
  deleteWithholdingTaxLedgerEntry,
  getExportVatLedgerCsvUrl,
  getExportWithholdingTaxLedgerCsvUrl,
  getExportPnd1RdPrepTxtUrl,
  validatePnd1RdPrep,
  type ValidatePnd1RdPrepResult,
  getKt20kSettings,
  saveKt20kSettings,
  getExportKt20kCsvUrl,
  getThaiTaxFilingSummary,
  type ThaiTaxFilingSummary,
  getCorporateTaxComputation,
  type CorporateTaxComputationData,
  getExportCorporateTaxPackageCsvUrl,
  getAccountingWorkflowStatus,
  saveAccountingWorkflowStatus,
  getIncomeExpenseClosingPreview,
  saveIncomeExpenseClosingDraft,
  postIncomeExpenseClosing,
  getExportIncomeExpenseClosingAuditCsvUrl,
  getAccountingComplianceAuditLogs,
  getAccountingComplianceAuditTrend,
  getExportAccountingComplianceAuditCsvUrl,
  getAccountingWorkflowReminders,
  type AccountingWorkflowStatusRow,
  type AccountingComplianceAuditLog,
  type IncomeExpenseClosingHistoryItem,
  type IncomeExpenseClosingPreview,
  type ThaiFilingResponsibility,
  type TrialBalanceRow,
  apiFetch,
  uploadSsoEvidenceFile,
  uploadEtaxEvidenceFile,
  getExportEtaxTimestampAuditCsvUrl,
} from "@/lib/api-client"
import { isOfficeRole, isManagerOrFranchiseeRole } from "@/lib/permissions"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  downloadThaiSsoFilingBlankTemplateXlsx,
  downloadThaiSsoFilingFromPayrollXlsx,
  THAI_SSO_TEMPLATE_COLUMN_HELP,
} from "@/lib/thai-sso-filing-template"

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
  filing_status: "draft" | "submitted"
  submitted_at: string
  submitted_by: string
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
  filing_status: "draft" | "submitted"
  submitted_at: string
  submitted_by: string
  memo: string
  store_name: string
}

type Pnd1IssueCode =
  | "missing_payee_name"
  | "missing_payee_tax_id"
  | "invalid_payee_tax_id_length"
  | "missing_payment_date"
  | "invalid_payment_date"
  | "missing_income_type"
  | "non_positive_withheld_amount"

const PND1_ISSUE_CODES: Pnd1IssueCode[] = [
  "missing_payee_name",
  "missing_payee_tax_id",
  "invalid_payee_tax_id_length",
  "missing_payment_date",
  "invalid_payment_date",
  "missing_income_type",
  "non_positive_withheld_amount",
]

type Kt20kSummaryResponse = {
  year: number
  storeFilter: string
  rows: {
    month: string
    employeeCount: number
    salaryAmount: number
    dailyWageAmount: number
    otherCompAmount: number
    totalWage: number
    excessOver20000: number
    netWageToReport: number
  }[]
  annual: {
    employeeCountPeak: number
    salaryAmount: number
    dailyWageAmount: number
    otherCompAmount: number
    totalWage: number
    excessOver20000: number
    netWageToReport: number
  }
  reconciliation: {
    monthly: {
      month: string
      kt20kTotalWage: number
      kt20kNetWage: number
      pnd1aLedgerGross: number
      diffTotalVsPnd1a: number
      diffNetVsPnd1a: number
    }[]
    employeeTopDiff: {
      employeeKey: string
      name: string
      store: string
      kt20kTotalWage: number
      pnd1aLedgerGross: number
      diff: number
      reasonTags: string[]
    }[]
    annual: {
      kt20kTotalWage: number
      kt20kNetWage: number
      pnd1aLedgerGross: number
      diffTotalVsPnd1a: number
      diffNetVsPnd1a: number
    }
  }
  warnings: string[]
}

type Kt20kReasonTag =
  | "missing_in_pnd1a"
  | "missing_in_kt20k"
  | "amount_mismatch"
  | "possible_store_mismatch"
  | "possible_name_mismatch"

const KT20K_REASON_TAGS: Kt20kReasonTag[] = [
  "missing_in_pnd1a",
  "missing_in_kt20k",
  "amount_mismatch",
  "possible_store_mismatch",
  "possible_name_mismatch",
]

const KT20K_TAGS_QUERY_KEY = "kt20k_tags"
const KT20K_TOL_QUERY_KEY = "kt20k_tol"
const KT20K_YEAR_QUERY_KEY = "kt20k_year"
const KT20K_STORE_QUERY_KEY = "kt20k_store"
const KT20K_TAB_QUERY_KEY = "kt20k_tab"

function ymNow(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`
}

function emptyVat(taxMonth: string, defaultStoreName = ""): VatDraft {
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
    filing_status: "draft",
    submitted_at: "",
    submitted_by: "",
    memo: "",
    store_name: defaultStoreName,
  }
}

function emptyWht(taxMonth: string, defaultStoreName: string): WhtDraft {
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
    filing_status: "draft",
    submitted_at: "",
    submitted_by: "",
    memo: "",
    store_name: defaultStoreName,
  }
}

function normalizeLedgerFilingStatus(v: unknown): "draft" | "submitted" {
  return String(v || "").trim().toLowerCase() === "submitted" ? "submitted" : "draft"
}

function formatBangkokDateTime(v: string): string {
  const s = String(v || "").trim()
  if (!s) return "-"
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function daysFromNow(v: string | null | undefined): number | null {
  const s = String(v || "").trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const ms = Date.now() - d.getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

type SsoPayrollPreview = {
  rowCount: number
  storeCount: number
  totalEmployeeSso: number
  totalEmployerSso: number
  totalContribution: number
  missingCitizenIdCount: number
  missingSsoMemberNoCount: number
}

type SsoSubmissionMeta = {
  memo: string
  attachmentUrls: string[]
  submittedAt?: string
  submittedBy?: string
}

type EtaxTimestampMeta = {
  taxId: string
  branchCode: string
  rdContactEmail: string
  senderGmail: string
  activateCodeRef: string
  memo: string
  attachmentUrls: string[]
  applySubmitted: boolean
  ko01Printed: boolean
  docsUploaded: boolean
  emailConfirmed: boolean
  activateCodeReceived: boolean
  passwordSet: boolean
  senderEmailRegistered: boolean
  pilotIssued: boolean
  stepAudit?: Partial<Record<EtaxStepKey, { doneAt: string; doneBy: string }>>
  updatedAt?: string
  updatedBy?: string
}

type EtaxStepKey =
  | "applySubmitted"
  | "ko01Printed"
  | "docsUploaded"
  | "emailConfirmed"
  | "activateCodeReceived"
  | "passwordSet"
  | "senderEmailRegistered"
  | "pilotIssued"

const SSO_WORKFLOW_NOTE_PREFIX = "SSO_SUBMISSION::"
const ETAX_TIMESTAMP_NOTE_PREFIX = "ETAX_TIMESTAMP::"

function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function buildSsoPayrollPreview(rows: Record<string, unknown>[]): SsoPayrollPreview {
  const stores = new Set<string>()
  let totalEmployeeSso = 0
  let totalEmployerSso = 0
  let missingCitizenIdCount = 0
  let missingSsoMemberNoCount = 0
  for (const row of rows) {
    const store = String(row.store || "").trim()
    if (store) stores.add(store)
    totalEmployeeSso += asNum(row.sso)
    totalEmployerSso += asNum(row.employerSso)
    if (!String(row.idNumber || "").trim()) missingCitizenIdCount += 1
    if (!String(row.ssoMemberNo || "").trim()) missingSsoMemberNoCount += 1
  }
  return {
    rowCount: rows.length,
    storeCount: stores.size,
    totalEmployeeSso,
    totalEmployerSso,
    totalContribution: totalEmployeeSso + totalEmployerSso,
    missingCitizenIdCount,
    missingSsoMemberNoCount,
  }
}

function parseAttachmentUrlsFromInput(raw: string): string[] {
  const uniq = new Set<string>()
  for (const token of String(raw || "").split(/[\n,]/g)) {
    const v = token.trim()
    if (!v) continue
    uniq.add(v)
  }
  return Array.from(uniq)
}

function displayNameFromUrl(url: string): string {
  const raw = String(url || "").trim()
  if (!raw) return "-"
  try {
    const u = new URL(raw)
    const seg = u.pathname.split("/").filter(Boolean)
    const last = seg[seg.length - 1] || raw
    return decodeURIComponent(last)
  } catch {
    const seg = raw.split("/").filter(Boolean)
    return seg[seg.length - 1] || raw
  }
}

function parseSsoWorkflowNote(note: string | null | undefined): SsoSubmissionMeta | null {
  const s = String(note || "").trim()
  if (!s.startsWith(SSO_WORKFLOW_NOTE_PREFIX)) return null
  const payload = s.slice(SSO_WORKFLOW_NOTE_PREFIX.length).trim()
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload) as {
      memo?: unknown
      attachmentUrls?: unknown
      submittedAt?: unknown
      submittedBy?: unknown
    }
    const memo = String(parsed.memo || "").trim()
    const attachmentUrls = Array.isArray(parsed.attachmentUrls)
      ? parsed.attachmentUrls.map((x) => String(x || "").trim()).filter(Boolean)
      : []
    const submittedAt = String(parsed.submittedAt || "").trim() || undefined
    const submittedBy = String(parsed.submittedBy || "").trim() || undefined
    return { memo, attachmentUrls, submittedAt, submittedBy }
  } catch {
    return null
  }
}

function buildSsoWorkflowNote(meta: SsoSubmissionMeta & { summaryLine: string }): string {
  return `${SSO_WORKFLOW_NOTE_PREFIX}${JSON.stringify({
    summaryLine: meta.summaryLine,
    memo: meta.memo,
    attachmentUrls: meta.attachmentUrls,
    submittedAt: meta.submittedAt || "",
    submittedBy: meta.submittedBy || "",
  })}`
}

function parseEtaxTimestampWorkflowNote(note: string | null | undefined): EtaxTimestampMeta | null {
  const s = String(note || "").trim()
  if (!s.startsWith(ETAX_TIMESTAMP_NOTE_PREFIX)) return null
  const payload = s.slice(ETAX_TIMESTAMP_NOTE_PREFIX.length).trim()
  if (!payload) return null
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>
    const bool = (k: string) => Boolean(parsed[k])
    const parsedStepAudit =
      parsed.stepAudit && typeof parsed.stepAudit === "object"
        ? (parsed.stepAudit as Record<string, unknown>)
        : {}
    const readStep = (k: EtaxStepKey): { doneAt: string; doneBy: string } | undefined => {
      const v = parsedStepAudit[k]
      if (!v || typeof v !== "object") return undefined
      const o = v as Record<string, unknown>
      const doneAt = String(o.doneAt || "").trim()
      const doneBy = String(o.doneBy || "").trim()
      if (!doneAt || !doneBy) return undefined
      return { doneAt, doneBy }
    }
    const stepAudit: Partial<Record<EtaxStepKey, { doneAt: string; doneBy: string }>> = {}
    ;(
      [
        "applySubmitted",
        "ko01Printed",
        "docsUploaded",
        "emailConfirmed",
        "activateCodeReceived",
        "passwordSet",
        "senderEmailRegistered",
        "pilotIssued",
      ] as EtaxStepKey[]
    ).forEach((k) => {
      const one = readStep(k)
      if (one) stepAudit[k] = one
    })
    return {
      taxId: String(parsed.taxId || "").trim(),
      branchCode: String(parsed.branchCode || "").trim(),
      rdContactEmail: String(parsed.rdContactEmail || "").trim(),
      senderGmail: String(parsed.senderGmail || "").trim(),
      activateCodeRef: String(parsed.activateCodeRef || "").trim(),
      memo: String(parsed.memo || "").trim(),
      attachmentUrls: Array.isArray(parsed.attachmentUrls)
        ? parsed.attachmentUrls.map((x) => String(x || "").trim()).filter(Boolean)
        : [],
      applySubmitted: bool("applySubmitted"),
      ko01Printed: bool("ko01Printed"),
      docsUploaded: bool("docsUploaded"),
      emailConfirmed: bool("emailConfirmed"),
      activateCodeReceived: bool("activateCodeReceived"),
      passwordSet: bool("passwordSet"),
      senderEmailRegistered: bool("senderEmailRegistered"),
      pilotIssued: bool("pilotIssued"),
      stepAudit,
      updatedAt: String(parsed.updatedAt || "").trim() || undefined,
      updatedBy: String(parsed.updatedBy || "").trim() || undefined,
    }
  } catch {
    return null
  }
}

function buildEtaxTimestampWorkflowNote(meta: EtaxTimestampMeta): string {
  return `${ETAX_TIMESTAMP_NOTE_PREFIX}${JSON.stringify(meta)}`
}

function pickPayrollApiMsg(data: { msg?: unknown; message?: unknown }): string {
  const raw = data.msg ?? data.message
  if (raw == null || raw === "") return ""
  return String(raw).trim()
}

function csvCell(v: unknown): string {
  const s = String(v ?? "")
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

type AdminAccountingComplianceProps = {
  initialTab?: string
  hideTabBar?: boolean
  initialPp30SubView?: "output" | "input" | "wht"
  /** 세무 신고 셸과 동기화 시 본문의 중복 년·매장 입력 숨김 */
  filingYearMonth?: string
  onFilingYearMonthChange?: (v: string) => void
  filingStoreFilter?: string
  onFilingStoreFilterChange?: (v: string) => void
}

export function AdminAccountingCompliance({
  initialTab = "scope",
  hideTabBar = false,
  initialPp30SubView = "output",
  filingYearMonth,
  onFilingYearMonthChange,
  filingStoreFilter,
  onFilingStoreFilterChange,
}: AdminAccountingComplianceProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const role = auth?.role || ""
  const canUse = canManageAccountingCompliance(role)
  const canWriteCompliance = canWriteAccountingCompliance(role)
  const canApproveCompliance = canApproveAccountingCompliance(role)
  const canApproveUnlock = canApproveAccountingPeriodUnlock(role)
  const { stores: storeList, resolveStoreKey } = useStoreList()
  const isOffice = isOfficeRole(role)
  const isManager = isManagerOrFranchiseeRole(role)
  const managerStore = (auth?.store || "").trim()

  const externalFiling =
    filingYearMonth !== undefined &&
    onFilingYearMonthChange !== undefined &&
    filingStoreFilter !== undefined &&
    onFilingStoreFilterChange !== undefined

  const [internalTaxMonth, setInternalTaxMonth] = React.useState(ymNow)
  const taxMonth = externalFiling ? filingYearMonth : internalTaxMonth
  const setTaxMonth = externalFiling ? onFilingYearMonthChange : setInternalTaxMonth

  const [tab, setTab] = React.useState(initialTab)
  const [yearMonthTb, setYearMonthTb] = React.useState(ymNow)
  const [internalStoreTb, setInternalStoreTb] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )
  const storeTb = externalFiling ? filingStoreFilter : internalStoreTb
  const setStoreTb = externalFiling ? onFilingStoreFilterChange : setInternalStoreTb

  /** POS·원장의 store_name(코드)과 로그인/표시 문자열이 다를 때 레거시→코드로 맞춤 */
  const storeFilterForLedger = React.useMemo(() => {
    const s = String(storeTb ?? "").trim()
    if (!s || s === "All" || s === "*") return "All"
    const r = String(resolveStoreKey(s) ?? "").trim()
    return r || s
  }, [storeTb, resolveStoreKey])

  const [resp, setResp] = React.useState<Record<string, ThaiFilingResponsibility>>({})
  const [notes, setNotes] = React.useState("")
  const [periods, setPeriods] = React.useState<
    {
      yearMonth: string
      isClosed: boolean
      closedAt: string | null
      closedBy: string | null
      unlockedAt?: string | null
      unlockedBy?: string | null
      unlockReason?: string | null
      unlockApprovedBy?: string | null
    }[]
  >([])
  const [tbRows, setTbRows] = React.useState<TrialBalanceRow[]>([])
  const [tbTotals, setTbTotals] = React.useState({ debit: 0, credit: 0, diff: 0 })
  const [closingYearMonth, setClosingYearMonth] = React.useState(ymNow)
  const [closingProfitLossAccountCode, setClosingProfitLossAccountCode] = React.useState("3120")
  const [closingPreview, setClosingPreview] = React.useState<IncomeExpenseClosingPreview | null>(null)
  const [closingDraft, setClosingDraft] = React.useState<{
    id?: number
    status?: string | null
    memo?: string | null
    created_at?: string | null
    created_by?: string | null
    payload?: IncomeExpenseClosingPreview | null
  } | null>(null)
  const [closingHistory, setClosingHistory] = React.useState<IncomeExpenseClosingHistoryItem[]>([])
  const [closingHistoryExpandedId, setClosingHistoryExpandedId] = React.useState<number | null>(null)
  const [closingMemo, setClosingMemo] = React.useState("")
  const [closingAutoLock, setClosingAutoLock] = React.useState(true)
  const [periodUnlockReason, setPeriodUnlockReason] = React.useState("")
  const [periodUnlockApprovedBy, setPeriodUnlockApprovedBy] = React.useState("")
  const [closingPosted, setClosingPosted] = React.useState<{
    id?: number
    entry_no?: string | null
    posted_at?: string | null
    posted_by?: string | null
  } | null>(null)
  const [closingLoading, setClosingLoading] = React.useState(false)
  const [closingDraftSaving, setClosingDraftSaving] = React.useState(false)
  const [closingPosting, setClosingPosting] = React.useState(false)
  const [accountingHealthLoading, setAccountingHealthLoading] = React.useState(false)
  const [accountingHealth, setAccountingHealth] = React.useState<{
    tbRevenue: number
    tbExpense: number
    tbNetIncome: number
    tbDiff: number
    incomeNetProfit: number
    bsCurrentPeriodProfit: number
    closingPreviewNetIncome: number
    netDiff: number
    bsDiff: number
    closingDiff: number
  } | null>(null)
  const [auditYearMonth, setAuditYearMonth] = React.useState(ymNow)
  const [auditDecision, setAuditDecision] = React.useState<"all" | "allow" | "deny" | "error">("all")
  const [auditActionKeyword, setAuditActionKeyword] = React.useState("")
  const [auditRows, setAuditRows] = React.useState<AccountingComplianceAuditLog[]>([])
  const [auditLoading, setAuditLoading] = React.useState(false)
  const [auditFallbackUsed, setAuditFallbackUsed] = React.useState(false)
  const [auditExpandedRowKey, setAuditExpandedRowKey] = React.useState<string | null>(null)
  const [auditPrevMonthStats, setAuditPrevMonthStats] = React.useState<{
    yearMonth: string
    total: number
    denyRate: number
  } | null>(null)
  const [auditTrendStats, setAuditTrendStats] = React.useState<
    { yearMonth: string; total: number; denyRate: number; errorRate: number }[]
  >([])
  const [workflowReminderRows, setWorkflowReminderRows] = React.useState<
    {
      filingType: string
      filingLabelKo: string
      periodType: "monthly" | "half_year" | "annual"
      yearMonth: string
      dueDateBangkok: string
      daysToDue: number
      severity: "info" | "warn" | "critical"
      status: string
      messageKo: string
    }[]
  >([])
  const [workflowReminderSummary, setWorkflowReminderSummary] = React.useState<{ critical: number; warn: number; info: number } | null>(null)
  const [vatRows, setVatRows] = React.useState<VatDraft[]>([])
  const [whtRows, setWhtRows] = React.useState<WhtDraft[]>([])
  const [periodType, setPeriodType] = React.useState<"monthly" | "half_year" | "annual">("monthly")
  const [ledgerStatusFilter, setLedgerStatusFilter] = React.useState<"all" | "draft" | "submitted">("all")
  /** 법인세 연간: API는 yearMonth의 연도만 사용 — UI는 연도만 고름 */
  const [citFiscalYear, setCitFiscalYear] = React.useState(() => Number(ymNow().slice(0, 4)))
  /** 부가세(ภ.พ.30) 탭: FlowAccount Tax 메뉴와 유사 — 매출/매입/원천 3가지 조회 */
  const [pp30SubView, setPp30SubView] = React.useState<"output" | "input" | "wht">(initialPp30SubView)
  const [taxSummary, setTaxSummary] = React.useState<ThaiTaxFilingSummary | null>(null)
  const [citData, setCitData] = React.useState<CorporateTaxComputationData | null>(null)
  const [workflowRows, setWorkflowRows] = React.useState<AccountingWorkflowStatusRow[]>([])
  const [workflowFallbackUsed, setWorkflowFallbackUsed] = React.useState(false)
  const [etaxTaxId, setEtaxTaxId] = React.useState("")
  const [etaxBranchCode, setEtaxBranchCode] = React.useState("00000")
  const [etaxRdContactEmail, setEtaxRdContactEmail] = React.useState("")
  const [etaxSenderGmail, setEtaxSenderGmail] = React.useState("")
  const [etaxActivateCodeRef, setEtaxActivateCodeRef] = React.useState("")
  const [etaxMemo, setEtaxMemo] = React.useState("")
  const [etaxAttachmentInput, setEtaxAttachmentInput] = React.useState("")
  const [etaxApplySubmitted, setEtaxApplySubmitted] = React.useState(false)
  const [etaxKo01Printed, setEtaxKo01Printed] = React.useState(false)
  const [etaxDocsUploaded, setEtaxDocsUploaded] = React.useState(false)
  const [etaxEmailConfirmed, setEtaxEmailConfirmed] = React.useState(false)
  const [etaxActivateCodeReceived, setEtaxActivateCodeReceived] = React.useState(false)
  const [etaxPasswordSet, setEtaxPasswordSet] = React.useState(false)
  const [etaxSenderEmailRegistered, setEtaxSenderEmailRegistered] = React.useState(false)
  const [etaxPilotIssued, setEtaxPilotIssued] = React.useState(false)
  const [etaxStepAudit, setEtaxStepAudit] = React.useState<
    Partial<Record<EtaxStepKey, { doneAt: string; doneBy: string }>>
  >({})
  const [etaxEvidenceUploading, setEtaxEvidenceUploading] = React.useState(false)
  const [etaxSaving, setEtaxSaving] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [ssoStoreFilter, setSsoStoreFilter] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )
  const [ssoPayrollLoading, setSsoPayrollLoading] = React.useState(false)
  const [ssoPayrollExporting, setSsoPayrollExporting] = React.useState(false)
  const [ssoPayrollRows, setSsoPayrollRows] = React.useState<Record<string, unknown>[]>([])
  const [ssoPayrollPreview, setSsoPayrollPreview] = React.useState<SsoPayrollPreview | null>(null)
  const [ssoPayrollLoadedAt, setSsoPayrollLoadedAt] = React.useState<string>("")
  const [ssoOnlineEnabled, setSsoOnlineEnabled] = React.useState(false)
  const [ssoEmployeeRegReady, setSsoEmployeeRegReady] = React.useState(false)
  const [ssoSubmissionMemo, setSsoSubmissionMemo] = React.useState("")
  const [ssoAttachmentInput, setSsoAttachmentInput] = React.useState("")
  const [ssoEvidenceUploading, setSsoEvidenceUploading] = React.useState(false)
  const [ssoSubmissionSaving, setSsoSubmissionSaving] = React.useState(false)
  const [ssoWorkflowRow, setSsoWorkflowRow] = React.useState<AccountingWorkflowStatusRow | null>(null)
  const [pnd1PayerTaxId, setPnd1PayerTaxId] = React.useState("")
  const [pnd1PayerBranchNo, setPnd1PayerBranchNo] = React.useState("00000")
  const [pnd1PayerName, setPnd1PayerName] = React.useState("")
  const [pnd1IncludeHeader, setPnd1IncludeHeader] = React.useState(false)
  const [pnd1FormMode, setPnd1FormMode] = React.useState<"auto" | "pnd1" | "pnd1a" | "all">("auto")
  const [pnd1Validating, setPnd1Validating] = React.useState(false)
  const [pnd1ValidationResult, setPnd1ValidationResult] = React.useState<ValidatePnd1RdPrepResult | null>(null)
  const [pnd1IssueFilterCodes, setPnd1IssueFilterCodes] = React.useState<Pnd1IssueCode[]>([])
  const whtRowRefs = React.useRef<Record<number, HTMLDivElement | null>>({})
  const [kt20kYear, setKt20kYear] = React.useState(() => getBangkokRecentYearMonths(1)[0].slice(0, 4))
  const [kt20kLoading, setKt20kLoading] = React.useState(false)
  const [kt20kSettingsSaving, setKt20kSettingsSaving] = React.useState(false)
  const [kt20kSettingsLoading, setKt20kSettingsLoading] = React.useState(false)
  const [kt20kDiffTolerance, setKt20kDiffTolerance] = React.useState("1")
  const [kt20kReasonTagFilter, setKt20kReasonTagFilter] = React.useState<Kt20kReasonTag[]>([])
  const [kt20kPendingStoreFromQuery, setKt20kPendingStoreFromQuery] = React.useState("")
  const [kt20kEmployer, setKt20kEmployer] = React.useState({
    companyTaxId: "",
    companyName: "",
    ssoProvince: "",
    ssoPhone: "",
    businessCode5: "",
    fundRatePercent: "",
  })
  const [kt20kData, setKt20kData] = React.useState<Kt20kSummaryResponse | null>(null)

  const ssoSelectedStore = React.useMemo(() => {
    const pickStore = externalFiling ? storeTb : ssoStoreFilter
    if (isManager && managerStore) return managerStore
    return pickStore
  }, [externalFiling, isManager, managerStore, ssoStoreFilter, storeTb])
  const ssoAttachmentUrls = React.useMemo(
    () => parseAttachmentUrlsFromInput(ssoAttachmentInput),
    [ssoAttachmentInput]
  )
  const ssoWorkflowMeta = React.useMemo(
    () => parseSsoWorkflowNote(String(ssoWorkflowRow?.note || "")),
    [ssoWorkflowRow?.note]
  )
  const etaxWorkflowRow = React.useMemo(
    () => workflowRows.find((r) => r.filing_type === "etax_timestamp") || null,
    [workflowRows]
  )
  const etaxWorkflowMeta = React.useMemo(
    () => parseEtaxTimestampWorkflowNote(String(etaxWorkflowRow?.note || "")),
    [etaxWorkflowRow?.note]
  )
  const etaxAttachmentUrls = React.useMemo(
    () => parseAttachmentUrlsFromInput(etaxAttachmentInput),
    [etaxAttachmentInput]
  )
  const etaxStepCountDone = React.useMemo(() => {
    const vals = [
      etaxApplySubmitted,
      etaxKo01Printed,
      etaxDocsUploaded,
      etaxEmailConfirmed,
      etaxActivateCodeReceived,
      etaxPasswordSet,
      etaxSenderEmailRegistered,
      etaxPilotIssued,
    ]
    return vals.filter(Boolean).length
  }, [
    etaxApplySubmitted,
    etaxKo01Printed,
    etaxDocsUploaded,
    etaxEmailConfirmed,
    etaxActivateCodeReceived,
    etaxPasswordSet,
    etaxSenderEmailRegistered,
    etaxPilotIssued,
  ])
  const storeOptions = React.useMemo(() => {
    if (!isOffice) return isManager && managerStore ? [managerStore] : []
    return [
      "All",
      ...((storeList || []).filter(
        (s) => !["본사", "Office", "오피스", "본점"].includes(s) && !s.toLowerCase().includes("office")
      ) || []),
    ]
  }, [isOffice, isManager, managerStore, storeList])

  React.useEffect(() => {
    if (externalFiling) return
    if (isManager && managerStore) setInternalStoreTb(managerStore)
  }, [externalFiling, isManager, managerStore])

  React.useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  React.useEffect(() => {
    setPp30SubView(initialPp30SubView)
  }, [initialPp30SubView])

  React.useEffect(() => {
    if (isManager && managerStore) setSsoStoreFilter(managerStore)
  }, [isManager, managerStore])

  React.useEffect(() => {
    const y = Number(String(taxMonth).slice(0, 4))
    if (Number.isFinite(y) && y >= 1900 && y <= 2100) setCitFiscalYear(y)
  }, [taxMonth])

  React.useEffect(() => {
    setClosingYearMonth(taxMonth)
  }, [taxMonth])

  const citYearMonthForApi = React.useMemo(() => {
    if (periodType === "annual") return `${citFiscalYear}-01`
    return taxMonth
  }, [periodType, citFiscalYear, taxMonth])

  const citFiscalYearOptions = React.useMemo(() => {
    const base = Number(getBangkokRecentYearMonths(1)[0].slice(0, 4))
    const out: number[] = []
    for (let y = base + 1; y >= base - 15; y--) out.push(y)
    if (!out.includes(citFiscalYear) && citFiscalYear >= 1900 && citFiscalYear <= 2100) {
      out.push(citFiscalYear)
      out.sort((a, b) => b - a)
    }
    return out
  }, [citFiscalYear])

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
        filing_status: normalizeLedgerFilingStatus(r.filing_status),
        submitted_at: String(r.submitted_at || ""),
        submitted_by: String(r.submitted_by || ""),
        memo: String(r.memo || ""),
        store_name: String(r.store_name || ""),
      })),
    [taxMonth]
  )

  const loadVat = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getVatLedger({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForLedger,
      })
      if (data.error) appAlert(t("accCompLoadFail"))
      setVatRows(mapVat(data.entries || []))
    } catch {
      setVatRows([])
      appAlert(t("accCompLoadFail"))
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, mapVat])

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
        filing_status: normalizeLedgerFilingStatus(r.filing_status),
        submitted_at: String(r.submitted_at || ""),
        submitted_by: String(r.submitted_by || ""),
        memo: String(r.memo || ""),
        store_name: String(r.store_name || ""),
      })),
    [taxMonth]
  )

  const loadWht = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getWithholdingTaxLedger({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForLedger,
      })
      setWhtRows(mapWht(data.entries || []))
    } catch {
      setWhtRows([])
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, mapWht])

  const loadTaxSummary = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getThaiTaxFilingSummary({
        userRole: role,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeFilterForLedger,
      })
      setTaxSummary(data)
    } catch {
      setTaxSummary(null)
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeFilterForLedger])

  const loadCit = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getCorporateTaxComputation({
        userRole: role,
        yearMonth: citYearMonthForApi,
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
  }, [canUse, role, citYearMonthForApi, periodType, storeTb, auth?.store])

  const loadWorkflow = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await getAccountingWorkflowStatus({
        userRole: role,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeTb,
      })
      setWorkflowRows(data.rows || [])
      setWorkflowFallbackUsed(Boolean(data.fallbackUsed))
    } catch {
      setWorkflowRows([])
      setWorkflowFallbackUsed(false)
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeTb])

  const loadWorkflowReminders = React.useCallback(async () => {
    if (!canUse) return
    try {
      const data = await getAccountingWorkflowReminders({
        userRole: role,
        yearMonth: taxMonth,
        storeFilter: storeTb,
      })
      setWorkflowReminderRows(data.rows || [])
      setWorkflowReminderSummary(data.summary || null)
    } catch {
      setWorkflowReminderRows([])
      setWorkflowReminderSummary(null)
    }
  }, [canUse, role, taxMonth, storeTb])

  const loadIncomeExpenseClosingPreview = React.useCallback(async () => {
    if (!canUse) return
    setClosingLoading(true)
    try {
      const data = await getIncomeExpenseClosingPreview({
        userRole: role,
        userStore: auth?.store,
        yearMonth: closingYearMonth,
        storeFilter: storeTb,
        profitLossAccountCode: closingProfitLossAccountCode,
      })
      setClosingPreview(data.preview || null)
      setClosingPosted(data.closed || null)
      setClosingDraft(data.draft || null)
      setClosingHistory(data.history || [])
      setClosingHistoryExpandedId(null)
      if (data.draft?.memo) setClosingMemo(String(data.draft.memo))
    } catch {
      setClosingPreview(null)
      setClosingPosted(null)
      setClosingDraft(null)
      setClosingHistory([])
      setClosingHistoryExpandedId(null)
      appAlert(t("accCompLoadFail"))
    } finally {
      setClosingLoading(false)
    }
  }, [canUse, role, auth?.store, closingYearMonth, storeTb, closingProfitLossAccountCode, t])

  const loadAccountingHealth = React.useCallback(async () => {
    if (!canUse) return
    setAccountingHealthLoading(true)
    try {
      const data = await getAccountingReconciliation({
        userRole: role,
        userStore: auth?.store,
        yearMonth: closingYearMonth,
        storeFilter: storeTb,
        profitLossAccountCode: closingProfitLossAccountCode,
      })
      setAccountingHealth({
        tbRevenue: Number(data.summary?.tbRevenue || 0),
        tbExpense: Number(data.summary?.tbExpense || 0),
        tbNetIncome: Number(data.summary?.tbNetIncome || 0),
        tbDiff: Number(data.summary?.tbDiff || 0),
        incomeNetProfit: Number(data.summary?.incomeNetProfit || 0),
        bsCurrentPeriodProfit: Number(data.summary?.bsCurrentPeriodProfit || 0),
        closingPreviewNetIncome: Number(data.summary?.closingPreviewNetIncome || 0),
        netDiff: Number(data.summary?.netDiff || 0),
        bsDiff: Number(data.summary?.bsDiff || 0),
        closingDiff: Number(data.summary?.closingDiff || 0),
      })
    } catch {
      setAccountingHealth(null)
    } finally {
      setAccountingHealthLoading(false)
    }
  }, [canUse, role, auth?.store, closingYearMonth, storeTb, closingProfitLossAccountCode])

  const loadComplianceAuditLogs = React.useCallback(async () => {
    if (!canUse) return
    setAuditLoading(true)
    try {
      const [data, trendData] = await Promise.all([
        getAccountingComplianceAuditLogs({
          userRole: role,
          yearMonth: auditYearMonth,
          periodType,
          decision: auditDecision,
          actionKeyword: auditActionKeyword.trim(),
          storeFilter: storeTb,
          limit: 300,
        }),
        getAccountingComplianceAuditTrend({
          userRole: role,
          yearMonth: auditYearMonth,
          months: 3,
          periodType,
          decision: auditDecision,
          actionKeyword: auditActionKeyword.trim(),
          storeFilter: storeTb,
        }),
      ])
      const trendRows = trendData.rows || []
      const prev = trendRows[1]
      setAuditPrevMonthStats(
        prev?.year_month
          ? {
              yearMonth: String(prev.year_month),
              total: Number(prev.total || 0),
              denyRate: Number(prev.deny_rate || 0),
            }
          : null
      )
      const trendStats = trendRows.map((r) => ({
        yearMonth: String(r.year_month || ""),
        total: Number(r.total || 0),
        denyRate: Number(r.deny_rate || 0),
        errorRate: Number(r.error_rate || 0),
      }))
      setAuditTrendStats(trendStats)
      setAuditRows(data.rows || [])
      setAuditFallbackUsed(Boolean(data.fallbackUsed))
      setAuditExpandedRowKey(null)
    } catch {
      setAuditRows([])
      setAuditFallbackUsed(false)
      setAuditExpandedRowKey(null)
      setAuditPrevMonthStats(null)
      setAuditTrendStats([])
    } finally {
      setAuditLoading(false)
    }
  }, [canUse, role, auditYearMonth, periodType, auditDecision, auditActionKeyword, storeTb])

  const runIncomeExpenseClosing = React.useCallback(
    async (forceReset: boolean) => {
      if (!canUse || !auth?.user) return
      if (!canApproveCompliance) {
        appAlert("마감 확정 권한이 없습니다.")
        return
      }
      if (accountingHealth) {
        const hasMismatch =
          Math.abs(Number(accountingHealth.tbDiff || 0)) > 0.0001 ||
          Math.abs(Number(accountingHealth.netDiff || 0)) > 0.0001 ||
          Math.abs(Number(accountingHealth.bsDiff || 0)) > 0.0001
        if (hasMismatch) {
          const proceed = await appConfirm(
            `대사 불일치가 있습니다.\n` +
              `- TB 차대차: ${Number(accountingHealth.tbDiff || 0).toLocaleString()}\n` +
              `- TB-손익: ${Number(accountingHealth.netDiff || 0).toLocaleString()}\n` +
              `- TB-BS당기손익: ${Number(accountingHealth.bsDiff || 0).toLocaleString()}\n` +
              `계속 마감을 실행할까요?`
          )
          if (!proceed) return
        }
      }
      if (
        !(await appConfirm(
          forceReset
            ? `${closingYearMonth} 수익/비용 마감을 재실행할까요?\n기존 마감 분개는 삭제 후 다시 생성됩니다.`
            : `${closingYearMonth} 수익/비용 마감을 실행할까요?`
        ))
      ) {
        return
      }
      setClosingPosting(true)
      try {
        const data = await postIncomeExpenseClosing({
          userRole: role,
          userStore: auth?.store,
          postedBy: auth.user,
          yearMonth: closingYearMonth,
          storeFilter: storeTb,
          profitLossAccountCode: closingProfitLossAccountCode,
          forceReset,
          autoLockPeriod: closingAutoLock,
          memo: closingMemo.trim() || undefined,
        })
        if (!data.success) {
          if (data.error === "ALREADY_CLOSED") {
            appAlert("이미 마감된 월입니다. '재실행'을 사용해 주세요.")
            return
          }
          if (data.error === "PERIOD_CLOSED") {
            appAlert("해당 월은 잠금 상태입니다. 잠금 해제 승인 후 다시 시도해 주세요.")
            return
          }
          if (data.error === "NOTHING_TO_CLOSE") {
            appAlert("마감할 수익/비용 잔액이 없습니다.")
            return
          }
          if (data.error === "TRIAL_BALANCE_NOT_BALANCED") {
            appAlert("시산표 차대가 일치하지 않아 마감할 수 없습니다. 먼저 분개 오류를 정리해 주세요.")
            return
          }
          throw new Error(data.error || "UNKNOWN_ERROR")
        }
        appAlert(`수익/비용 마감 분개가 생성되었습니다.${data.autoLocked ? "\n회계기간도 자동 잠금되었습니다." : ""}`)
        await loadIncomeExpenseClosingPreview()
      } catch {
        appAlert(t("msg_save_fail"))
      } finally {
        setClosingPosting(false)
      }
    },
    [
      canUse,
      canApproveCompliance,
      auth?.user,
      auth?.store,
      role,
      closingYearMonth,
      storeTb,
      closingProfitLossAccountCode,
      closingAutoLock,
      closingMemo,
      accountingHealth,
      loadIncomeExpenseClosingPreview,
      t,
    ]
  )

  const saveIncomeExpenseClosingDraftNow = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    setClosingDraftSaving(true)
    try {
      const data = await saveIncomeExpenseClosingDraft({
        userRole: role,
        userStore: auth?.store,
        createdBy: auth.user,
        yearMonth: closingYearMonth,
        storeFilter: storeTb,
        profitLossAccountCode: closingProfitLossAccountCode,
        memo: closingMemo.trim() || undefined,
      })
      if (!data.success) throw new Error(data.error || "DRAFT_SAVE_FAILED")
      appAlert("마감 초안이 저장되었습니다.")
      await loadIncomeExpenseClosingPreview()
    } catch {
      appAlert(t("msg_save_fail"))
    } finally {
      setClosingDraftSaving(false)
    }
  }, [
    canUse,
    auth?.user,
    auth?.store,
    role,
    closingYearMonth,
    storeTb,
    closingProfitLossAccountCode,
    closingMemo,
    loadIncomeExpenseClosingPreview,
    t,
  ])

  const loadKt20k = React.useCallback(async () => {
    if (!canUse) return
    const y = Number(kt20kYear)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      appAlert(lang === "th" ? "กรุณาใส่ปีให้ถูกต้อง" : lang === "en" ? "Invalid year" : "연도 입력값이 올바르지 않습니다.")
      return
    }
    setKt20kLoading(true)
    try {
      const q = new URLSearchParams({ userRole: role, year: String(y), storeFilter: storeTb })
      const res = await apiFetch(`/api/getKt20kSummary?${q}`)
      const data = (await res.json()) as Kt20kSummaryResponse
      setKt20kData(data)
    } catch {
      setKt20kData(null)
      appAlert(lang === "th" ? "โหลดข้อมูล KT20K ไม่สำเร็จ" : lang === "en" ? "Failed to load KT20K" : "KT20K 데이터를 불러오지 못했습니다.")
    } finally {
      setKt20kLoading(false)
    }
  }, [canUse, kt20kYear, role, storeTb, lang])

  const loadKt20kSettings = React.useCallback(async () => {
    if (!canUse) return
    const y = Number(kt20kYear)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return
    setKt20kSettingsLoading(true)
    try {
      const data = await getKt20kSettings({ userRole: role, year: y })
      setKt20kEmployer({
        companyTaxId: data.settings.companyTaxId || "",
        companyName: data.settings.companyName || "",
        ssoProvince: data.settings.ssoOfficeProvince || "",
        ssoPhone: data.settings.ssoOfficePhone || "",
        businessCode5: data.settings.businessCode5 || "",
        fundRatePercent: data.settings.fundRatePercent || "",
      })
    } catch {
      // ignore: first year may have no row yet
    } finally {
      setKt20kSettingsLoading(false)
    }
  }, [canUse, kt20kYear, role])

  const saveKt20kEmployerSettings = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    if (!canWriteCompliance) {
      appAlert(lang === "th" ? "ไม่มีสิทธิ์แก้ไข" : lang === "en" ? "No write permission" : "작성 권한이 없습니다.")
      return
    }
    const y = Number(kt20kYear)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      appAlert(lang === "th" ? "กรุณาใส่ปีให้ถูกต้อง" : lang === "en" ? "Invalid year" : "연도 입력값이 올바르지 않습니다.")
      return
    }
    setKt20kSettingsSaving(true)
    try {
      const res = await saveKt20kSettings({
        userRole: role,
        year: y,
        companyTaxId: kt20kEmployer.companyTaxId,
        companyName: kt20kEmployer.companyName,
        ssoOfficeProvince: kt20kEmployer.ssoProvince,
        ssoOfficePhone: kt20kEmployer.ssoPhone,
        businessCode5: kt20kEmployer.businessCode5,
        fundRatePercent: kt20kEmployer.fundRatePercent,
        updatedBy: auth.user,
      })
      if (!res.success) {
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert(lang === "th" ? "ไม่มีสิทธิ์แก้ไข" : lang === "en" ? "No write permission" : "작성 권한이 없습니다.")
          return
        }
        throw new Error(res.error || "SAVE_FAILED")
      }
      appAlert(lang === "th" ? "บันทึกสำเร็จ" : lang === "en" ? "Saved" : "저장되었습니다.")
      await loadKt20kSettings()
    } catch {
      appAlert(lang === "th" ? "บันทึกไม่สำเร็จ" : lang === "en" ? "Save failed" : "저장에 실패했습니다.")
    } finally {
      setKt20kSettingsSaving(false)
    }
  }, [canUse, canWriteCompliance, auth?.user, kt20kYear, role, kt20kEmployer, lang, loadKt20kSettings])

  const fetchSsoPayrollRows = React.useCallback(
    async (notifyOnEmpty = true) => {
      if (!canUse || !auth?.user) return null
      setSsoPayrollLoading(true)
      try {
        const pickStore = externalFiling ? storeTb : ssoStoreFilter
        const effectiveStore =
          isManager && managerStore ? managerStore : pickStore === "All" ? "" : pickStore
        const params = new URLSearchParams({
          month: taxMonth,
          storeFilter: effectiveStore,
          userStore: auth?.store || "",
          userRole: role,
        })
        const res = await apiFetch(`/api/getPayrollCalc?${params}`)
        const data = (await res.json()) as {
          success?: boolean
          list?: Record<string, unknown>[]
          msg?: unknown
          message?: unknown
          detail?: unknown
        }
        if (!data.success || !Array.isArray(data.list)) {
          const base = pickPayrollApiMsg(data) || t("accCompSsoPayrollFail")
          const det = data.detail != null && String(data.detail).trim() ? String(data.detail).trim() : ""
          appAlert(det ? `${base}\n(${det})` : base)
          return null
        }
        if (data.list.length === 0) {
          if (notifyOnEmpty) appAlert(t("accCompSsoPayrollEmpty"))
          setSsoPayrollRows([])
          setSsoPayrollPreview({
            rowCount: 0,
            storeCount: 0,
            totalEmployeeSso: 0,
            totalEmployerSso: 0,
            totalContribution: 0,
            missingCitizenIdCount: 0,
            missingSsoMemberNoCount: 0,
          })
          setSsoPayrollLoadedAt(new Date().toISOString())
          return []
        }
        setSsoPayrollRows(data.list)
        setSsoPayrollPreview(buildSsoPayrollPreview(data.list))
        setSsoPayrollLoadedAt(new Date().toISOString())
        return data.list
      } catch {
        appAlert(t("accCompSsoPayrollFail"))
        return null
      } finally {
        setSsoPayrollLoading(false)
      }
    },
    [
      canUse,
      auth?.user,
      auth?.store,
      externalFiling,
      isManager,
      managerStore,
      role,
      ssoStoreFilter,
      storeTb,
      t,
      taxMonth,
    ]
  )

  const exportSsoFromPayroll = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    setSsoPayrollExporting(true)
    try {
      const rows = ssoPayrollRows.length ? ssoPayrollRows : await fetchSsoPayrollRows()
      if (!rows || rows.length === 0) return
      downloadThaiSsoFilingFromPayrollXlsx({ yearMonth: taxMonth, payrollRows: rows })
    } finally {
      setSsoPayrollExporting(false)
    }
  }, [canUse, auth?.user, ssoPayrollRows, fetchSsoPayrollRows, taxMonth])

  const loadSsoWorkflowStatus = React.useCallback(async () => {
    if (!canUse) return
    try {
      const pickStore = externalFiling ? storeTb : ssoStoreFilter
      const effectiveStore = isManager && managerStore ? managerStore : pickStore
      const data = await getAccountingWorkflowStatus({
        userRole: role,
        yearMonth: taxMonth,
        periodType: "monthly",
        storeFilter: effectiveStore,
      })
      setWorkflowFallbackUsed(Boolean(data.fallbackUsed))
      const row = (data.rows || []).find((x) => x.filing_type === "sso") || null
      setSsoWorkflowRow(row)
      const meta = parseSsoWorkflowNote(String(row?.note || ""))
      if (meta) {
        setSsoSubmissionMemo(meta.memo || "")
        setSsoAttachmentInput(meta.attachmentUrls.join("\n"))
      }
    } catch {
      setSsoWorkflowRow(null)
    }
  }, [canUse, externalFiling, isManager, managerStore, role, ssoStoreFilter, storeTb, taxMonth])

  const markSsoSubmissionDone = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    if (!canApproveCompliance) {
      appAlert("SSO 제출 완료 확정 권한이 없습니다.")
      return
    }
    const preview = ssoPayrollPreview
    if (!preview || preview.rowCount <= 0) {
      appAlert("먼저 급여 스냅샷을 불러와 주세요.")
      return
    }
    setSsoSubmissionSaving(true)
    try {
      const pickStore = externalFiling ? storeTb : ssoStoreFilter
      const effectiveStore = isManager && managerStore ? managerStore : pickStore
      const summaryLine = `SSO rows=${preview.rowCount}, employee_sso=${Math.round(
        preview.totalEmployeeSso
      )}, employer_sso=${Math.round(preview.totalEmployerSso)}`
      const note = buildSsoWorkflowNote({
        summaryLine,
        memo: ssoSubmissionMemo.trim(),
        attachmentUrls: ssoAttachmentUrls,
        submittedAt: new Date().toISOString(),
        submittedBy: auth.user || "",
      })
      const saved = await saveAccountingWorkflowStatus({
        userRole: role,
        yearMonth: taxMonth,
        periodType: "monthly",
        filingType: "sso",
        status: "done",
        note,
        updatedBy: auth.user || null,
        storeFilter: effectiveStore,
      })
      setWorkflowFallbackUsed(Boolean(saved.fallbackUsed))
      await loadSsoWorkflowStatus()
      appAlert("SSO 제출 완료로 기록되었습니다.")
    } catch {
      appAlert(t("msg_save_fail"))
    } finally {
      setSsoSubmissionSaving(false)
    }
  }, [
    canUse,
    canApproveCompliance,
    auth?.user,
    externalFiling,
    isManager,
    loadSsoWorkflowStatus,
    managerStore,
    role,
    ssoAttachmentUrls,
    ssoSubmissionMemo,
    ssoPayrollPreview,
    ssoStoreFilter,
    storeTb,
    t,
    taxMonth,
  ])

  const uploadSsoEvidenceFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      if (!canUse || !auth?.user) return
      setSsoEvidenceUploading(true)
      try {
        const uploadedUrls: string[] = []
        for (const file of Array.from(files)) {
          const up = await uploadSsoEvidenceFile({
            userRole: role,
            yearMonth: taxMonth,
            storeFilter: ssoSelectedStore,
            file,
          })
          if (!up.success || !up.url) {
            appAlert(up.message || "증빙 파일 업로드에 실패했습니다.")
            continue
          }
          uploadedUrls.push(up.url)
        }
        if (!uploadedUrls.length) return
        setSsoAttachmentInput((prev) => {
          const current = parseAttachmentUrlsFromInput(prev)
          const merged = Array.from(new Set([...current, ...uploadedUrls]))
          return merged.join("\n")
        })
      } finally {
        setSsoEvidenceUploading(false)
      }
    },
    [canUse, auth?.user, role, taxMonth, ssoSelectedStore]
  )

  React.useEffect(() => {
    if (canUse) void loadPrefs()
  }, [canUse, loadPrefs])

  React.useEffect(() => {
    if (canUse && tab === "period") void loadPeriods()
  }, [canUse, tab, loadPeriods])

  React.useEffect(() => {
    if (canUse && tab === "period") void loadIncomeExpenseClosingPreview()
  }, [canUse, tab, loadIncomeExpenseClosingPreview])

  React.useEffect(() => {
    if (canUse && tab === "period") void loadAccountingHealth()
  }, [canUse, tab, loadAccountingHealth])

  React.useEffect(() => {
    if (canUse && tab === "period") void loadComplianceAuditLogs()
  }, [canUse, tab, loadComplianceAuditLogs])

  React.useEffect(() => {
    if (canUse && tab === "trial") void loadTrial()
  }, [canUse, tab, loadTrial])

  React.useEffect(() => {
    if (canUse && tab === "summary") void loadTaxSummary()
  }, [canUse, tab, loadTaxSummary])

  React.useEffect(() => {
    if (!canUse || tab !== "summary") return
    if (pp30SubView === "wht") void loadWht()
    else void loadVat()
  }, [canUse, tab, pp30SubView, taxMonth, storeFilterForLedger, loadVat, loadWht])

  React.useEffect(() => {
    if (canUse && tab === "cit") void loadCit()
  }, [canUse, tab, loadCit])

  React.useEffect(() => {
    if (canUse && tab === "workflow") void loadWorkflow()
  }, [canUse, tab, loadWorkflow])

  React.useEffect(() => {
    if (canUse && tab === "workflow") void loadWorkflowReminders()
  }, [canUse, tab, loadWorkflowReminders])

  React.useEffect(() => {
    if (!etaxWorkflowMeta) return
    setEtaxTaxId(etaxWorkflowMeta.taxId || "")
    setEtaxBranchCode(etaxWorkflowMeta.branchCode || "00000")
    setEtaxRdContactEmail(etaxWorkflowMeta.rdContactEmail || "")
    setEtaxSenderGmail(etaxWorkflowMeta.senderGmail || "")
    setEtaxActivateCodeRef(etaxWorkflowMeta.activateCodeRef || "")
    setEtaxMemo(etaxWorkflowMeta.memo || "")
    setEtaxAttachmentInput((etaxWorkflowMeta.attachmentUrls || []).join("\n"))
    setEtaxApplySubmitted(Boolean(etaxWorkflowMeta.applySubmitted))
    setEtaxKo01Printed(Boolean(etaxWorkflowMeta.ko01Printed))
    setEtaxDocsUploaded(Boolean(etaxWorkflowMeta.docsUploaded))
    setEtaxEmailConfirmed(Boolean(etaxWorkflowMeta.emailConfirmed))
    setEtaxActivateCodeReceived(Boolean(etaxWorkflowMeta.activateCodeReceived))
    setEtaxPasswordSet(Boolean(etaxWorkflowMeta.passwordSet))
    setEtaxSenderEmailRegistered(Boolean(etaxWorkflowMeta.senderEmailRegistered))
    setEtaxPilotIssued(Boolean(etaxWorkflowMeta.pilotIssued))
    setEtaxStepAudit(etaxWorkflowMeta.stepAudit || {})
  }, [etaxWorkflowMeta])

  React.useEffect(() => {
    if (canUse && tab === "kt20k") void loadKt20k()
  }, [canUse, tab, loadKt20k])

  React.useEffect(() => {
    if (canUse && tab === "kt20k") void loadKt20kSettings()
  }, [canUse, tab, loadKt20kSettings])

  React.useEffect(() => {
    setKt20kReasonTagFilter([])
  }, [kt20kYear, storeTb])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const q = new URLSearchParams(window.location.search)
    const tabRaw = String(q.get(KT20K_TAB_QUERY_KEY) || "").trim().toLowerCase()
    if (tabRaw === "1" || tabRaw === "true" || tabRaw === "kt20k") {
      setTab("kt20k")
    }
    const yRaw = String(q.get(KT20K_YEAR_QUERY_KEY) || "").trim()
    if (yRaw) {
      const y = Number(yRaw)
      if (Number.isFinite(y) && y >= 2000 && y <= 2100) setKt20kYear(String(Math.floor(y)))
    }
    const storeRaw = String(q.get(KT20K_STORE_QUERY_KEY) || "").trim()
    if (storeRaw) setKt20kPendingStoreFromQuery(storeRaw)
    const tagsRaw = String(q.get(KT20K_TAGS_QUERY_KEY) || "").trim()
    if (tagsRaw) {
      const tags = tagsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is Kt20kReasonTag => KT20K_REASON_TAGS.includes(s as Kt20kReasonTag))
      if (tags.length) setKt20kReasonTagFilter(tags)
    }
    const tolRaw = String(q.get(KT20K_TOL_QUERY_KEY) || "").trim()
    if (tolRaw) {
      const n = Number(tolRaw)
      if (Number.isFinite(n) && n >= 0) setKt20kDiffTolerance(String(n))
    }
  }, [])

  React.useEffect(() => {
    if (!kt20kPendingStoreFromQuery) return
    const pick = kt20kPendingStoreFromQuery
    const isAllowed = storeOptions.includes(pick) || pick === storeTb
    if (isAllowed) {
      setStoreTb(pick)
      setKt20kPendingStoreFromQuery("")
      return
    }
    if (pick === "All" && isOffice) {
      setStoreTb("All")
      setKt20kPendingStoreFromQuery("")
      return
    }
    // invalid query value for current role/store scope
    setKt20kPendingStoreFromQuery("")
  }, [kt20kPendingStoreFromQuery, storeOptions, storeTb, setStoreTb, isOffice])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (kt20kReasonTagFilter.length) {
      url.searchParams.set(KT20K_TAGS_QUERY_KEY, kt20kReasonTagFilter.join(","))
    } else {
      url.searchParams.delete(KT20K_TAGS_QUERY_KEY)
    }
    if (kt20kDiffTolerance && kt20kDiffTolerance !== "1") {
      url.searchParams.set(KT20K_TOL_QUERY_KEY, kt20kDiffTolerance)
    } else {
      url.searchParams.delete(KT20K_TOL_QUERY_KEY)
    }
    if (kt20kYear) {
      url.searchParams.set(KT20K_YEAR_QUERY_KEY, kt20kYear)
    } else {
      url.searchParams.delete(KT20K_YEAR_QUERY_KEY)
    }
    if (storeTb && storeTb !== "All") {
      url.searchParams.set(KT20K_STORE_QUERY_KEY, storeTb)
    } else if (storeTb === "All") {
      url.searchParams.set(KT20K_STORE_QUERY_KEY, "All")
    } else {
      url.searchParams.delete(KT20K_STORE_QUERY_KEY)
    }
    if (tab === "kt20k") {
      url.searchParams.set(KT20K_TAB_QUERY_KEY, "1")
    } else {
      url.searchParams.delete(KT20K_TAB_QUERY_KEY)
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [kt20kReasonTagFilter, kt20kDiffTolerance, kt20kYear, storeTb, tab])

  React.useEffect(() => {
    if (!canUse || tab !== "sso") return
    void loadSsoWorkflowStatus()
  }, [canUse, tab, loadSsoWorkflowStatus])

  React.useEffect(() => {
    setPnd1ValidationResult(null)
    setPnd1IssueFilterCodes([])
  }, [taxMonth, periodType, ledgerStatusFilter, storeTb, pnd1FormMode])

  React.useEffect(() => {
    setSsoPayrollRows([])
    setSsoPayrollPreview(null)
    setSsoPayrollLoadedAt("")
  }, [taxMonth, ssoStoreFilter, externalFiling, storeTb])

  React.useEffect(() => {
    setClosingPreview(null)
    setClosingPosted(null)
    setClosingDraft(null)
    setClosingHistory([])
    setClosingHistoryExpandedId(null)
    setAccountingHealth(null)
  }, [closingYearMonth, closingProfitLossAccountCode, storeTb])

  const savePrefs = async () => {
    if (!canUse) return
    if (!canWriteCompliance) {
      appAlert("작성 권한이 없습니다.")
      return
    }
    try {
      const res = await saveAccountingFilingPreferences({
        userRole: role,
        responsibilities: resp as Record<string, ThaiFilingResponsibility>,
        notes,
      })
      if (!res.success) {
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert("작성 권한이 없습니다.")
          return
        }
        throw new Error(res.error || "SAVE_FAILED")
      }
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const togglePeriod = async (yearMonth: string, closed: boolean) => {
    if (!canUse || !auth?.user) return
    try {
      if (closed && !canApproveCompliance) {
        appAlert("회계기간 잠금 권한이 없습니다.")
        return
      }
      if (!closed && !canApproveUnlock) {
        appAlert("회계기간 잠금 해제 승인 권한이 없습니다.")
        return
      }
      if (!closed) {
        if (!periodUnlockReason.trim() || periodUnlockReason.trim().length < 5 || !periodUnlockApprovedBy.trim()) {
          appAlert("잠금 해제 시 사유(5자 이상)와 승인자 입력이 필요합니다.")
          return
        }
        if (
          !(await appConfirm(
            `${yearMonth} 잠금을 해제할까요?\n사유: ${periodUnlockReason.trim()}\n승인자: ${periodUnlockApprovedBy.trim()}`
          ))
        ) {
          return
        }
      }
      const res = await setAccountingPeriodClosed({
        userRole: role,
        yearMonth,
        closed,
        closedBy: auth.user,
        unlockReason: closed ? undefined : periodUnlockReason.trim(),
        unlockApprovedBy: closed ? undefined : periodUnlockApprovedBy.trim(),
      })
      if (!res.success) {
        if (res.error === "UNLOCK_APPROVAL_REQUIRED") {
          appAlert("잠금 해제 승인 정보가 누락되었습니다.")
          return
        }
        throw new Error(res.error || "PERIOD_UPDATE_FAILED")
      }
      await loadPeriods()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const saveVatRow = async (row: VatDraft) => {
    if (!canUse) return
    if (row.filing_status === "submitted" && !canApproveCompliance) {
      appAlert("제출 상태로 확정할 권한이 없습니다.")
      return
    }
    if (row.filing_status !== "submitted" && !canWriteCompliance) {
      appAlert("작성 권한이 없습니다.")
      return
    }
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
        filingStatus: row.filing_status,
        submittedAt: row.submitted_at || null,
        submittedBy: row.submitted_by || null,
        memo: row.memo || null,
        storeName: (() => {
          const s = row.store_name?.trim()
          if (s) return s
          const fb = String(storeTb || "").trim()
          if (fb && fb !== "All" && fb !== "*") return fb
          return null
        })(),
        createdBy: auth?.user,
      })
      if (!res.success) {
        if (res.error === "FORBIDDEN_APPROVE") {
          appAlert("제출 확정 권한이 없습니다.")
          return
        }
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert("작성 권한이 없습니다.")
          return
        }
        throw new Error(res.error)
      }
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
    if (!canWriteCompliance) {
      appAlert("작성 권한이 없습니다.")
      return
    }
    try {
      const res = await deleteVatLedgerEntry({ userRole: role, id: row.id })
      if (!res.success) {
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert("작성 권한이 없습니다.")
          return
        }
        throw new Error(res.error || "DELETE_FAILED")
      }
      await loadVat()
    } catch {
      appAlert(t("msg_delete_fail"))
    }
  }

  const saveWhtRow = async (row: WhtDraft) => {
    if (!canUse) return
    if (row.filing_status === "submitted" && !canApproveCompliance) {
      appAlert("제출 상태로 확정할 권한이 없습니다.")
      return
    }
    if (row.filing_status !== "submitted" && !canWriteCompliance) {
      appAlert("작성 권한이 없습니다.")
      return
    }
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
        filingStatus: row.filing_status,
        submittedAt: row.submitted_at || null,
        submittedBy: row.submitted_by || null,
        memo: row.memo || null,
        storeName: row.store_name?.trim() ? row.store_name.trim() : null,
        createdBy: auth?.user,
      })
      if (!res.success) {
        if (res.error === "FORBIDDEN_APPROVE") {
          appAlert("제출 확정 권한이 없습니다.")
          return
        }
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert("작성 권한이 없습니다.")
          return
        }
        throw new Error(res.error)
      }
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
    if (!canWriteCompliance) {
      appAlert("작성 권한이 없습니다.")
      return
    }
    try {
      const res = await deleteWithholdingTaxLedgerEntry({ userRole: role, id: row.id })
      if (!res.success) {
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert("작성 권한이 없습니다.")
          return
        }
        throw new Error(res.error || "DELETE_FAILED")
      }
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
    if ((status === "done" || status === "review") && !canApproveCompliance) {
      appAlert("확정/검토 상태 변경 권한이 없습니다.")
      return
    }
    if ((status === "todo" || status === "in_progress") && !canWriteCompliance) {
      appAlert("워크플로 작성 권한이 없습니다.")
      return
    }
    try {
      const cur = workflowRows.find((r) => r.filing_type === filingType)
      const saved = await saveAccountingWorkflowStatus({
        userRole: role,
        yearMonth: taxMonth,
        periodType,
        filingType,
        status,
        note: cur?.note || null,
        owner: cur?.owner || null,
        updatedBy: auth?.user || null,
        storeFilter: storeTb,
      })
      setWorkflowFallbackUsed(Boolean(saved.fallbackUsed))
      await loadWorkflow()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const saveEtaxTimestampProgress = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    if (etaxSenderGmail && !/@gmail\.com$/i.test(etaxSenderGmail.trim())) {
      appAlert("발행용 이메일은 Gmail 형식으로 입력해 주세요.")
      return
    }
    setEtaxSaving(true)
    try {
      const meta: EtaxTimestampMeta = {
        taxId: etaxTaxId.trim(),
        branchCode: etaxBranchCode.trim() || "00000",
        rdContactEmail: etaxRdContactEmail.trim(),
        senderGmail: etaxSenderGmail.trim(),
        activateCodeRef: etaxActivateCodeRef.trim(),
        memo: etaxMemo.trim(),
        attachmentUrls: etaxAttachmentUrls,
        applySubmitted: etaxApplySubmitted,
        ko01Printed: etaxKo01Printed,
        docsUploaded: etaxDocsUploaded,
        emailConfirmed: etaxEmailConfirmed,
        activateCodeReceived: etaxActivateCodeReceived,
        passwordSet: etaxPasswordSet,
        senderEmailRegistered: etaxSenderEmailRegistered,
        pilotIssued: etaxPilotIssued,
        stepAudit: etaxStepAudit,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.user,
      }
      const status: "todo" | "in_progress" | "review" | "done" =
        etaxStepCountDone === 0 ? "todo" : etaxStepCountDone >= 8 ? "done" : "in_progress"
      if (status === "done" && !canApproveCompliance) {
        appAlert("E-Tax 완료 확정 권한이 없습니다. 작성만 저장해 주세요.")
        return
      }
      const saved = await saveAccountingWorkflowStatus({
        userRole: role,
        yearMonth: taxMonth,
        periodType,
        filingType: "etax_timestamp",
        status,
        note: buildEtaxTimestampWorkflowNote(meta),
        updatedBy: auth.user,
        storeFilter: storeTb,
      })
      setWorkflowFallbackUsed(Boolean(saved.fallbackUsed))
      await loadWorkflow()
      appAlert("E-Tax Time Stamp 진행상태가 저장되었습니다.")
    } catch {
      appAlert(t("msg_save_fail"))
    } finally {
      setEtaxSaving(false)
    }
  }, [
    canUse,
    auth?.user,
    etaxSenderGmail,
    etaxTaxId,
    etaxBranchCode,
    etaxRdContactEmail,
    etaxActivateCodeRef,
    etaxMemo,
    etaxAttachmentUrls,
    etaxApplySubmitted,
    etaxKo01Printed,
    etaxDocsUploaded,
    etaxEmailConfirmed,
    etaxActivateCodeReceived,
    etaxPasswordSet,
    etaxSenderEmailRegistered,
    etaxPilotIssued,
    etaxStepAudit,
    etaxStepCountDone,
    canApproveCompliance,
    role,
    taxMonth,
    periodType,
    storeTb,
    loadWorkflow,
    t,
  ])

  const chartList = React.useMemo(
    () => Object.values(CHART_OF_ACCOUNTS_BY_CODE).sort((a, b) => a.code.localeCompare(b.code)),
    []
  )

  const vatOutputRows = React.useMemo(() => vatRows.filter((r) => r.direction === "output"), [vatRows])
  const vatInputRows = React.useMemo(() => vatRows.filter((r) => r.direction === "input"), [vatRows])
  const filingStatusLabel = React.useCallback(
    (v: "draft" | "submitted") => (v === "submitted" ? t("accCompWorkflowStatusDone") : t("accCompWorkflowStatusTodo")),
    [t]
  )
  const vatOutputRowsFiltered = React.useMemo(
    () => vatOutputRows.filter((r) => ledgerStatusFilter === "all" || r.filing_status === ledgerStatusFilter),
    [vatOutputRows, ledgerStatusFilter]
  )
  const vatInputRowsFiltered = React.useMemo(
    () => vatInputRows.filter((r) => ledgerStatusFilter === "all" || r.filing_status === ledgerStatusFilter),
    [vatInputRows, ledgerStatusFilter]
  )
  const whtRowsFiltered = React.useMemo(
    () => whtRows.filter((r) => ledgerStatusFilter === "all" || r.filing_status === ledgerStatusFilter),
    [whtRows, ledgerStatusFilter]
  )
  const etaxAuditCsvUrl = React.useMemo(
    () =>
      getExportEtaxTimestampAuditCsvUrl({
        userRole: role,
        yearMonth: taxMonth,
        storeFilter: storeTb,
      }),
    [role, taxMonth, storeTb]
  )
  const etaxReminderMessages = React.useMemo(() => {
    const msgs: string[] = []
    const elapsed = daysFromNow(etaxWorkflowMeta?.updatedAt || "")
    if (etaxApplySubmitted && !etaxEmailConfirmed && elapsed != null && elapsed >= 7) {
      msgs.push(`RD 이메일 인증 미완료: 신청 후 ${elapsed}일 경과 (7일 내 인증 권장)`)
    }
    if (etaxDocsUploaded && !etaxActivateCodeReceived && elapsed != null && elapsed >= 15) {
      msgs.push(`Activate Code 미수령: 업로드 후 ${elapsed}일 경과 (약 15일 확인 필요)`)
    }
    if (etaxSenderEmailRegistered && !etaxPilotIssued) {
      msgs.push("발행 주소 등록 후 시험 발행/수신 확인이 아직 완료되지 않았습니다.")
    }
    return msgs
  }, [
    etaxWorkflowMeta?.updatedAt,
    etaxApplySubmitted,
    etaxEmailConfirmed,
    etaxDocsUploaded,
    etaxActivateCodeReceived,
    etaxSenderEmailRegistered,
    etaxPilotIssued,
  ])
  const etaxStepStamp = React.useCallback(
    (key: EtaxStepKey) => {
      const info = etaxStepAudit[key]
      if (!info?.doneAt) return ""
      return `${formatBangkokDateTime(info.doneAt)} / ${info.doneBy || "-"}`
    },
    [etaxStepAudit]
  )
  const ssoStep1Ready = ssoOnlineEnabled && ssoEmployeeRegReady
  const ssoStep2Ready = !!ssoPayrollPreview && ssoPayrollPreview.rowCount > 0
  const ssoStep3Ready = ssoStep2Ready
  const ssoStep4Ready = (ssoWorkflowRow?.status || "") === "done"
  const summaryPeriodLabel = React.useMemo(() => {
    if (!taxSummary?.period) return taxMonth
    if (taxSummary.period.startMonth === taxSummary.period.endMonth) return taxSummary.period.startMonth
    return `${taxSummary.period.startMonth} ~ ${taxSummary.period.endMonth}`
  }, [taxSummary?.period, taxMonth])
  const closingDraftPayload = React.useMemo<IncomeExpenseClosingPreview | null>(() => {
    const raw = closingDraft?.payload
    if (!raw || typeof raw !== "object") return null
    const maybe = raw as IncomeExpenseClosingPreview
    if (!Array.isArray(maybe.lines)) return null
    return maybe
  }, [closingDraft?.payload])
  const closingDraftDiff = React.useMemo(() => {
    if (!closingPreview || !closingDraftPayload) return null
    const currentMap = new Map<string, number>()
    const draftMap = new Map<string, number>()
    for (const ln of closingPreview.lines || []) {
      const key = `${ln.accountCode}|${ln.side}`
      currentMap.set(key, Number(currentMap.get(key) || 0) + Number(ln.amount || 0))
    }
    for (const ln of closingDraftPayload.lines || []) {
      const key = `${ln.accountCode}|${ln.side}`
      draftMap.set(key, Number(draftMap.get(key) || 0) + Number(ln.amount || 0))
    }
    const changed: { key: string; current: number; draft: number; diff: number }[] = []
    const keys = new Set<string>([...currentMap.keys(), ...draftMap.keys()])
    keys.forEach((key) => {
      const current = Number(currentMap.get(key) || 0)
      const draft = Number(draftMap.get(key) || 0)
      const diff = current - draft
      if (Math.abs(diff) > 0.0001) changed.push({ key, current, draft, diff })
    })
    return {
      revenueDiff: Number(closingPreview.revenueTotal || 0) - Number(closingDraftPayload.revenueTotal || 0),
      expenseDiff: Number(closingPreview.expenseTotal || 0) - Number(closingDraftPayload.expenseTotal || 0),
      netIncomeDiff: Number(closingPreview.netIncome || 0) - Number(closingDraftPayload.netIncome || 0),
      lineCountDiff: Number(closingPreview.lineCount || 0) - Number(closingDraftPayload.lineCount || 0),
      changedCount: changed.length,
      changedSample: changed.slice(0, 10),
    }
  }, [closingPreview, closingDraftPayload])
  const closingAuditCsvUrl = React.useMemo(
    () =>
      getExportIncomeExpenseClosingAuditCsvUrl({
        userRole: role,
        yearMonth: closingYearMonth,
        storeFilter: storeTb,
      }),
    [role, closingYearMonth, storeTb]
  )
  const complianceAuditCsvUrl = React.useMemo(
    () =>
      getExportAccountingComplianceAuditCsvUrl({
        userRole: role,
        yearMonth: auditYearMonth,
        periodType,
        decision: auditDecision,
        actionKeyword: auditActionKeyword.trim(),
        storeFilter: storeTb,
      }),
    [role, auditYearMonth, periodType, auditDecision, auditActionKeyword, storeTb]
  )
  const auditKpi = React.useMemo(() => {
    const total = auditRows.length
    const allowCount = auditRows.filter((r) => r.decision === "allow").length
    const denyCount = auditRows.filter((r) => r.decision === "deny").length
    const errorCount = auditRows.filter((r) => r.decision === "error").length
    const denyRate = total > 0 ? (denyCount / total) * 100 : 0
    const errorRate = total > 0 ? (errorCount / total) * 100 : 0
    const reasonMap = new Map<string, number>()
    for (const row of auditRows) {
      const key = String(row.reason_code || "").trim()
      if (!key) continue
      reasonMap.set(key, Number(reasonMap.get(key) || 0) + 1)
    }
    const topReasons = Array.from(reasonMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    return { total, allowCount, denyCount, errorCount, denyRate, errorRate, topReasons }
  }, [auditRows])
  const auditDenyRateDelta = React.useMemo(() => {
    if (!auditPrevMonthStats) return null
    return auditKpi.denyRate - auditPrevMonthStats.denyRate
  }, [auditKpi.denyRate, auditPrevMonthStats])
  const vatExportUrl = React.useMemo(
    () =>
      getExportVatLedgerCsvUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForLedger,
      }),
    [role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger]
  )
  const whtExportUrl = React.useMemo(
    () =>
      getExportWithholdingTaxLedgerCsvUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForLedger,
      }),
    [role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger]
  )
  const pnd1FilingForm = React.useMemo<"pnd1" | "pnd1a" | "all">(() => {
    if (pnd1FormMode === "pnd1" || pnd1FormMode === "pnd1a" || pnd1FormMode === "all") return pnd1FormMode
    return periodType === "annual" ? "pnd1a" : "pnd1"
  }, [periodType, pnd1FormMode])
  const pnd1RdPrepUrl = React.useMemo(
    () =>
      getExportPnd1RdPrepTxtUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForLedger,
        filingForm: pnd1FilingForm,
        payerTaxId: pnd1PayerTaxId,
        payerBranchNo: pnd1PayerBranchNo,
        payerName: pnd1PayerName,
        includeHeader: pnd1IncludeHeader,
      }),
    [
      role,
      taxMonth,
      periodType,
      ledgerStatusFilter,
      storeFilterForLedger,
      pnd1FilingForm,
      pnd1PayerTaxId,
      pnd1PayerBranchNo,
      pnd1PayerName,
      pnd1IncludeHeader,
    ]
  )

  const uploadEtaxEvidenceFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      if (!canUse || !auth?.user) return
      setEtaxEvidenceUploading(true)
      try {
        const uploadedUrls: string[] = []
        for (const file of Array.from(files)) {
          const up = await uploadEtaxEvidenceFile({
            userRole: role,
            yearMonth: taxMonth,
            storeFilter: storeTb,
            file,
          })
          if (!up.success || !up.url) {
            appAlert(up.message || "E-Tax 증빙 파일 업로드에 실패했습니다.")
            continue
          }
          uploadedUrls.push(up.url)
        }
        if (!uploadedUrls.length) return
        setEtaxAttachmentInput((prev) => {
          const current = parseAttachmentUrlsFromInput(prev)
          return Array.from(new Set([...current, ...uploadedUrls])).join("\n")
        })
      } finally {
        setEtaxEvidenceUploading(false)
      }
    },
    [canUse, auth?.user, role, taxMonth, storeTb]
  )

  const toggleEtaxStep = React.useCallback(
    (key: EtaxStepKey, checked: boolean) => {
      const now = new Date().toISOString()
      const by = String(auth?.user || "").trim() || "unknown"
      switch (key) {
        case "applySubmitted":
          setEtaxApplySubmitted(checked)
          break
        case "ko01Printed":
          setEtaxKo01Printed(checked)
          break
        case "docsUploaded":
          setEtaxDocsUploaded(checked)
          break
        case "emailConfirmed":
          setEtaxEmailConfirmed(checked)
          break
        case "activateCodeReceived":
          setEtaxActivateCodeReceived(checked)
          break
        case "passwordSet":
          setEtaxPasswordSet(checked)
          break
        case "senderEmailRegistered":
          setEtaxSenderEmailRegistered(checked)
          break
        case "pilotIssued":
          setEtaxPilotIssued(checked)
          break
      }
      setEtaxStepAudit((prev) => {
        const next = { ...(prev || {}) }
        if (checked) next[key] = { doneAt: now, doneBy: by }
        else delete next[key]
        return next
      })
    },
    [auth?.user]
  )
  const pnd1RdPrepBtnLabel =
    lang === "th" ? "ส่งออก RD Prep ภ.ง.ด.1 TXT" : lang === "en" ? "Export RD Prep PND1 TXT" : "RD Prep PND1 TXT 다운로드"
  const pnd1RdPrepGuideTitle =
    lang === "th" ? "แนวทางยื่น RD Prep (ภ.ง.ด.1 / ภ.ง.ด.1ก)" : lang === "en" ? "RD Prep guide (PND1 / PND1A)" : "RD Prep 제출 가이드 (PND1 / PND1A)"
  const pnd1RdPrepGuideNote =
    lang === "th"
      ? "ไฟล์นี้เป็นแบบคั่นด้วย | เพื่อนำเข้าใน RD Prep โดยแมปคอลัมน์ในขั้นตอนโอนย้ายข้อมูล"
      : lang === "en"
        ? "This export uses | delimiter for RD Prep transfer mapping."
        : "이 파일은 RD Prep의 데이터 이관 단계에서 `|` 구분자로 컬럼 매핑하는 용도입니다."
  const pnd1ValidateBtnLabel =
    lang === "th" ? "ตรวจสอบก่อนส่งออก" : lang === "en" ? "Validate before export" : "내보내기 전 검증"
  const pnd1FormLabel =
    lang === "th" ? "แบบยื่น" : lang === "en" ? "Filing form" : "신고서 유형"
  const pnd1PayerBoxTitle =
    lang === "th" ? "ข้อมูลผู้จ่าย (ผู้หัก ณ ที่จ่าย)" : lang === "en" ? "Payer information" : "지급자(원천징수의무자) 정보"
  const pnd1ValidationTableTitle =
    lang === "th" ? "ผลตรวจสอบ RD Prep" : lang === "en" ? "RD Prep validation results" : "RD Prep 검증 결과"
  const pnd1GoLedgerBtnLabel =
    lang === "th" ? "ไปที่รายการ" : lang === "en" ? "Go to ledger row" : "원장으로 이동"
  const pnd1ClearValidationLabel =
    lang === "th" ? "ล้างผลตรวจสอบ" : lang === "en" ? "Clear result" : "검증결과 지우기"
  const pnd1IssueFilterLabel =
    lang === "th" ? "ตัวกรองปัญหา" : lang === "en" ? "Issue filter" : "문제유형 필터"
  const pnd1IssueExportCsvLabel =
    lang === "th" ? "ส่งออกผลตรวจสอบ CSV" : lang === "en" ? "Export validation CSV" : "검증결과 CSV 다운로드"
  const pnd1NoIssueTooltip =
    lang === "th" ? "ไม่มีปัญหาประเภทนี้ในช่วงที่เลือก" : lang === "en" ? "No issues of this type in current filter" : "현재 조건에서 해당 이슈가 없습니다."
  const kt20kExportUrl = React.useMemo(() => {
    const y = Number(kt20kYear)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return "#"
    return getExportKt20kCsvUrl({ userRole: role, year: y, storeFilter: storeTb })
  }, [kt20kYear, role, storeTb])
  const pnd1IssueCodeLabel = React.useCallback(
    (code: string) => {
      const ko: Record<string, string> = {
        missing_payee_name: "지급받는자 이름 누락",
        missing_payee_tax_id: "지급받는자 TIN 누락",
        invalid_payee_tax_id_length: "지급받는자 TIN 13자리 아님",
        missing_payment_date: "지급일 누락",
        invalid_payment_date: "지급일 형식 오류",
        missing_income_type: "소득유형 누락",
        non_positive_withheld_amount: "원천세 금액 0 이하",
      }
      const en: Record<string, string> = {
        missing_payee_name: "Missing payee name",
        missing_payee_tax_id: "Missing payee tax ID",
        invalid_payee_tax_id_length: "Payee tax ID not 13 digits",
        missing_payment_date: "Missing payment date",
        invalid_payment_date: "Invalid payment date format",
        missing_income_type: "Missing income type",
        non_positive_withheld_amount: "Withheld amount <= 0",
      }
      const th: Record<string, string> = {
        missing_payee_name: "ไม่มีชื่อผู้รับเงิน",
        missing_payee_tax_id: "ไม่มีเลขผู้เสียภาษีผู้รับเงิน",
        invalid_payee_tax_id_length: "เลขผู้เสียภาษีผู้รับเงินไม่ครบ 13 หลัก",
        missing_payment_date: "ไม่มีวันที่จ่าย",
        invalid_payment_date: "รูปแบบวันที่จ่ายไม่ถูกต้อง",
        missing_income_type: "ไม่มีประเภทเงินได้",
        non_positive_withheld_amount: "ภาษีหัก ณ ที่จ่าย <= 0",
      }
      if (lang === "th") return th[code] || code
      if (lang === "en") return en[code] || code
      return ko[code] || code
    },
    [lang]
  )
  const pnd1IssueRowsFiltered = React.useMemo(() => {
    const issues = pnd1ValidationResult?.issues || []
    if (!pnd1IssueFilterCodes.length) return issues
    return issues.filter((x) => pnd1IssueFilterCodes.includes(x.code as Pnd1IssueCode))
  }, [pnd1ValidationResult, pnd1IssueFilterCodes])
  const pnd1IssueCountMap = React.useMemo(() => {
    const base: Record<Pnd1IssueCode, number> = {
      missing_payee_name: 0,
      missing_payee_tax_id: 0,
      invalid_payee_tax_id_length: 0,
      missing_payment_date: 0,
      invalid_payment_date: 0,
      missing_income_type: 0,
      non_positive_withheld_amount: 0,
    }
    for (const issue of pnd1ValidationResult?.issues || []) {
      const code = issue.code as Pnd1IssueCode
      if (code in base) base[code] += 1
    }
    return base
  }, [pnd1ValidationResult])

  const togglePnd1IssueCode = React.useCallback((code: Pnd1IssueCode) => {
    setPnd1IssueFilterCodes((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]
    )
  }, [])

  React.useEffect(() => {
    setPnd1IssueFilterCodes((prev) => prev.filter((code) => (pnd1IssueCountMap[code] || 0) > 0))
  }, [pnd1IssueCountMap])

  const exportPnd1ValidationCsv = React.useCallback(() => {
    if (!pnd1ValidationResult) return
    const header = ["line_no", "row_id", "issue_code", "issue_label", "payee_name", "certificate_no", "message"]
    const lines = [header.join(",")]
    for (const issue of pnd1IssueRowsFiltered) {
      lines.push(
        [
          issue.lineNo,
          issue.rowId ?? "",
          csvCell(issue.code),
          csvCell(pnd1IssueCodeLabel(issue.code)),
          csvCell(issue.payeeName),
          csvCell(issue.certificateNo),
          csvCell(issue.message),
        ].join(",")
      )
    }
    const csv = `\uFEFF${lines.join("\r\n")}`
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const a = document.createElement("a")
    const url = URL.createObjectURL(blob)
    const yyyymm = String(taxMonth || "").replace(/[^0-9]/g, "").slice(0, 6) || "period"
    a.href = url
    a.download = `pnd1-validation-${yyyymm}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [pnd1ValidationResult, pnd1IssueRowsFiltered, pnd1IssueCodeLabel, taxMonth])
  const kt20kDiffToleranceNum = React.useMemo(() => {
    const n = Number(kt20kDiffTolerance)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
  }, [kt20kDiffTolerance])
  const kt20kMonthlyDiffRows = React.useMemo(() => {
    const rows = kt20kData?.reconciliation?.monthly || []
    return rows.filter(
      (r) =>
        Math.abs(r.diffTotalVsPnd1a) >= kt20kDiffToleranceNum ||
        Math.abs(r.diffNetVsPnd1a) >= kt20kDiffToleranceNum
    )
  }, [kt20kData?.reconciliation?.monthly, kt20kDiffToleranceNum])
  const kt20kEmployeeDiffRows = React.useMemo(() => {
    const rows = kt20kData?.reconciliation?.employeeTopDiff || []
    const byTolerance = rows.filter((r) => Math.abs(r.diff) >= kt20kDiffToleranceNum)
    if (!kt20kReasonTagFilter.length) return byTolerance
    return byTolerance.filter((r) =>
      (r.reasonTags || []).some((tag) => kt20kReasonTagFilter.includes(tag as Kt20kReasonTag))
    )
  }, [kt20kData?.reconciliation?.employeeTopDiff, kt20kDiffToleranceNum, kt20kReasonTagFilter])
  const kt20kReasonTagLabel = React.useCallback(
    (tag: string) => {
      const ko: Record<string, string> = {
        missing_in_pnd1a: "PND1A 미기록",
        missing_in_kt20k: "KT20K 미기록",
        amount_mismatch: "금액 불일치",
        possible_store_mismatch: "매장 매칭 의심",
        possible_name_mismatch: "이름 매칭 의심",
      }
      const en: Record<string, string> = {
        missing_in_pnd1a: "Missing in PND1A",
        missing_in_kt20k: "Missing in KT20K",
        amount_mismatch: "Amount mismatch",
        possible_store_mismatch: "Possible store mismatch",
        possible_name_mismatch: "Possible name mismatch",
      }
      const th: Record<string, string> = {
        missing_in_pnd1a: "ไม่มีใน PND1A",
        missing_in_kt20k: "ไม่มีใน KT20K",
        amount_mismatch: "ยอดไม่ตรงกัน",
        possible_store_mismatch: "อาจแมปสาขาผิด",
        possible_name_mismatch: "อาจแมปชื่อผิด",
      }
      if (lang === "th") return th[tag] || tag
      if (lang === "en") return en[tag] || tag
      return ko[tag] || tag
    },
    [lang]
  )
  const kt20kReasonTagCountMap = React.useMemo(() => {
    const base: Record<Kt20kReasonTag, number> = {
      missing_in_pnd1a: 0,
      missing_in_kt20k: 0,
      amount_mismatch: 0,
      possible_store_mismatch: 0,
      possible_name_mismatch: 0,
    }
    const rows = kt20kData?.reconciliation?.employeeTopDiff || []
    for (const row of rows) {
      if (Math.abs(row.diff) < kt20kDiffToleranceNum) continue
      for (const tag of row.reasonTags || []) {
        const t = tag as Kt20kReasonTag
        if (t in base) base[t] += 1
      }
    }
    return base
  }, [kt20kData?.reconciliation?.employeeTopDiff, kt20kDiffToleranceNum])
  const toggleKt20kReasonTag = React.useCallback((tag: Kt20kReasonTag) => {
    setKt20kReasonTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    )
  }, [])

  const jumpToWhtLedgerRow = React.useCallback((rowId: number | null) => {
    if (!rowId || !Number.isFinite(rowId)) return
    setPp30SubView("wht")
    setLedgerStatusFilter("all")
    window.setTimeout(() => {
      const el = whtRowRefs.current[rowId]
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.add("ring-2", "ring-primary/60")
      window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-primary/60")
      }, 1800)
    }, 120)
  }, [])

  const runPnd1Validation = React.useCallback(async () => {
    if (!canUse) return
    setPnd1Validating(true)
    try {
      const data = await validatePnd1RdPrep({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForLedger,
        filingForm: pnd1FilingForm,
      })
      setPnd1ValidationResult(data)
      const wc = data.warningCounts
      const warningTotal =
        wc.missingPayeeName +
        wc.missingPayeeTaxId +
        wc.invalidPayeeTaxIdLength +
        wc.missingPaymentDate +
        wc.invalidPaymentDate +
        wc.missingIncomeType +
        wc.nonPositiveWithheldAmount
      appAlert(
        warningTotal > 0
          ? `검증 완료: 경고 ${warningTotal.toLocaleString()}건 (아래 표에서 확인/이동 가능)`
          : "검증 완료: 경고 없음"
      )
    } catch {
      setPnd1ValidationResult(null)
      appAlert(lang === "th" ? "ตรวจสอบไม่สำเร็จ" : lang === "en" ? "Validation failed" : "검증에 실패했습니다.")
    } finally {
      setPnd1Validating(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, pnd1FilingForm, lang])

  const storeOptionLabel = React.useCallback(
    (code: string) => (code === "All" ? t("all") : code),
    [t]
  )

  const workflowStatusLabel = React.useCallback(
    (s: string) => {
      const m: Record<string, string> = {
        todo: t("accCompWorkflowStatusTodo"),
        in_progress: t("accCompWorkflowStatusInProgress"),
        review: t("accCompWorkflowStatusReview"),
        done: t("accCompWorkflowStatusDone"),
      }
      return m[s] || s
    },
    [t]
  )

  if (!canUse) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">{t("accCompOfficeOnly")}</CardContent>
      </Card>
    )
  }

  const tabsRootClass = hideTabBar ? adminTabsRootEmbeddedCn : adminTabsRootCn
  const tabsContentClass = hideTabBar ? adminTabsContentEmbeddedCn : adminTabsContentCn

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab} className={tabsRootClass}>
        {!hideTabBar && (
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
                <TabsTrigger value="summary" className={adminTabsTriggerCn}>
                  {t("accCompTabPp30")}
                </TabsTrigger>
                <TabsTrigger value="cit" className={adminTabsTriggerCn}>
                  {t("accCompTabCit")}
                </TabsTrigger>
                <TabsTrigger value="sso" className={adminTabsTriggerCn}>
                  {t("accCompTabSso")}
                </TabsTrigger>
                <TabsTrigger value="kt20k" className={adminTabsTriggerCn}>
                  KT20K
                </TabsTrigger>
                <TabsTrigger value="workflow" className={adminTabsTriggerCn}>
                  {t("accCompTabWorkflow")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        )}

        <TabsContent value="scope" className={cn(tabsContentClass, "space-y-3")}>
          <Card className="border-amber-200/70 dark:border-amber-900/45">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                {t("accCompSchedGuideTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-xs text-muted-foreground leading-relaxed">{t("accCompSchedGuideDisclaimer")}</p>
              <div className="space-y-3">
                {THAI_FILING_SCHEDULE_SECTIONS.map((s) => (
                  <div
                    key={s.titleKey}
                    className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 dark:bg-muted/10"
                  >
                    <div className="font-medium text-foreground">{t(s.titleKey)}</div>
                    <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                      {t(s.bodyKey)}
                    </p>
                  </div>
                ))}
              </div>
              <div>
                <div className="font-medium text-sm mb-2">{t("accCompSched_tbl_title")}</div>
                <div className="overflow-x-auto rounded-md border border-border/80">
                  <table className="w-full text-xs border-collapse min-w-[520px]">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2 font-medium">{t("accCompSched_tbl_h_item")}</th>
                        <th className="text-left p-2 font-medium">{t("accCompSched_tbl_h_period")}</th>
                        <th className="text-left p-2 font-medium">{t("accCompSched_tbl_h_deadline")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {THAI_FILING_SCHEDULE_TABLE_ROWS.map(([itemKey, periodKey, deadlineKey], idx) => (
                        <tr key={idx} className="border-b border-border/50 last:border-0">
                          <td className="p-2 align-top font-medium">{t(itemKey)}</td>
                          <td className="p-2 align-top text-muted-foreground">{t(periodKey)}</td>
                          <td className="p-2 align-top text-muted-foreground">{t(deadlineKey)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
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
                    <th className="text-left p-2">{t("accCompColCode")}</th>
                    <th className="text-left p-2">{t("accCompChartColKo")}</th>
                    <th className="text-left p-2">{t("accCompChartColEn")}</th>
                    <th className="text-left p-2">{t("accCompChartColTfrs")}</th>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {lang === "th"
                  ? "เทียบยอด KT20K vs PND1A"
                  : lang === "en"
                    ? "KT20K vs PND1A reconciliation"
                    : "KT20K vs PND1A 대사"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {kt20kData?.reconciliation ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs text-muted-foreground">
                      {lang === "th" ? "เกณฑ์ส่วนต่าง (บาท)" : lang === "en" ? "Diff tolerance (THB)" : "허용 오차(THB)"}
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-[140px] h-8"
                      value={kt20kDiffTolerance}
                      onChange={(e) => setKt20kDiffTolerance(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                    <div className="rounded border border-border/60 p-2">
                      <div className="text-muted-foreground">KT20K (1) Total</div>
                      <div className="font-medium text-sm">
                        {kt20kData.reconciliation.annual.kt20kTotalWage.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <div className="text-muted-foreground">PND1A Ledger Gross</div>
                      <div className="font-medium text-sm">
                        {kt20kData.reconciliation.annual.pnd1aLedgerGross.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <div className="text-muted-foreground">Diff (Total - PND1A)</div>
                      <div
                        className={`font-medium text-sm ${
                          Math.abs(kt20kData.reconciliation.annual.diffTotalVsPnd1a) > 0.0001
                            ? "text-amber-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {kt20kData.reconciliation.annual.diffTotalVsPnd1a.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded border border-border/60">
                    <table className="w-full text-xs min-w-[760px]">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left p-2">Month</th>
                          <th className="text-right p-2">KT20K (1)</th>
                          <th className="text-right p-2">PND1A Gross</th>
                          <th className="text-right p-2">Diff (1 - PND1A)</th>
                          <th className="text-right p-2">Diff (3 - PND1A)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kt20kMonthlyDiffRows.map((r) => (
                          <tr key={r.month} className="border-b border-border/40">
                            <td className="p-2 font-mono">{r.month}</td>
                            <td className="p-2 text-right">{r.kt20kTotalWage.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.pnd1aLedgerGross.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.diffTotalVsPnd1a.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.diffNetVsPnd1a.toLocaleString()}</td>
                          </tr>
                        ))}
                        {!kt20kMonthlyDiffRows.length ? (
                          <tr>
                            <td colSpan={5} className="p-3 text-center text-muted-foreground">
                              {lang === "th" ? "ไม่พบส่วนต่างตามเกณฑ์" : lang === "en" ? "No monthly diff by tolerance" : "허용 오차 기준 월별 차이가 없습니다."}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {lang === "th"
                        ? "ตัวกรองแท็กสาเหตุ"
                        : lang === "en"
                          ? "Reason-tag quick filters"
                          : "원인 태그 퀵필터"}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={kt20kReasonTagFilter.length === 0 ? "default" : "outline"}
                        onClick={() => setKt20kReasonTagFilter([])}
                      >
                        {lang === "th" ? "ทั้งหมด" : lang === "en" ? "All" : "전체"}
                      </Button>
                      {KT20K_REASON_TAGS.map((tag) => {
                        const cnt = kt20kReasonTagCountMap[tag] || 0
                        return (
                          <Button
                            key={tag}
                            type="button"
                            size="sm"
                            variant={kt20kReasonTagFilter.includes(tag) ? "default" : "outline"}
                            onClick={() => toggleKt20kReasonTag(tag)}
                            disabled={cnt === 0}
                            title={
                              cnt === 0
                                ? lang === "th"
                                  ? "ไม่พบรายการในเงื่อนไขปัจจุบัน"
                                  : lang === "en"
                                    ? "No rows in current filter"
                                    : "현재 조건에서 해당 태그가 없습니다."
                                : ""
                            }
                            className="justify-between"
                          >
                            <span>{kt20kReasonTagLabel(tag)}</span>
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                              {cnt.toLocaleString()}
                            </span>
                          </Button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded border border-border/60">
                    <table className="w-full text-xs min-w-[760px]">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left p-2">Store</th>
                          <th className="text-left p-2">Name</th>
                          <th className="text-right p-2">KT20K Total</th>
                          <th className="text-right p-2">PND1A Gross</th>
                          <th className="text-right p-2">Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kt20kEmployeeDiffRows.map((r) => (
                          <tr key={r.employeeKey} className="border-b border-border/40">
                            <td className="p-2">{r.store || "-"}</td>
                            <td className="p-2">{r.name || "-"}</td>
                            <td className="p-2 text-right">{r.kt20kTotalWage.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.pnd1aLedgerGross.toLocaleString()}</td>
                            <td className="p-2 text-right">
                              <div>{r.diff.toLocaleString()}</div>
                              {r.reasonTags?.length ? (
                                <div className="mt-1 flex flex-wrap justify-end gap-1">
                                  {r.reasonTags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-1.5 py-0.5 text-[10px]"
                                    >
                                      {kt20kReasonTagLabel(tag)}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                        {!kt20kEmployeeDiffRows.length ? (
                          <tr>
                            <td colSpan={5} className="p-3 text-center text-muted-foreground">
                              {lang === "th" ? "ไม่พบส่วนต่างรายบุคคล" : lang === "en" ? "No employee-level diff" : "직원 단위 차이가 없습니다."}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {lang === "th" ? "ยังไม่มีข้อมูลเทียบยอด" : lang === "en" ? "No reconciliation data" : "대사 데이터가 없습니다."}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels" className={cn(tabsContentClass, "space-y-3")}>
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
        </TabsContent>

        <TabsContent value="resp" className={cn(tabsContentClass, "space-y-3")}>
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

        <TabsContent value="period" className={tabsContentClass}>
          <div className="text-[11px] text-muted-foreground mb-2">
            권한: 잠금은 본사/회계, 잠금 해제 승인은 본사만 가능합니다.
          </div>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <div className="mb-3 grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">잠금해제 사유 (승인 필수)</div>
                  <Input
                    className="h-9"
                    value={periodUnlockReason}
                    onChange={(e) => setPeriodUnlockReason(e.target.value)}
                    placeholder="예: 외부감사 수정분 반영 필요"
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">잠금해제 승인자</div>
                  <Input
                    className="h-9"
                    value={periodUnlockApprovedBy}
                    onChange={(e) => setPeriodUnlockApprovedBy(e.target.value)}
                    placeholder="예: HQ_FIN_MANAGER"
                  />
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{t("accCompColYearMonth")}</th>
                    <th className="text-left p-2">{t("accCompColStatus")}</th>
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
                        {!p.isClosed && p.unlockedAt ? (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            해제: {formatBangkokDateTime(String(p.unlockedAt || ""))}
                            {p.unlockApprovedBy ? ` / 승인 ${p.unlockApprovedBy}` : ""}
                            {p.unlockReason ? ` / ${p.unlockReason}` : ""}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={p.isClosed ? "secondary" : "default"}
                          onClick={() => void togglePeriod(p.yearMonth, !p.isClosed)}
                          disabled={p.isClosed ? !canApproveUnlock : !canApproveCompliance}
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
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">회계 일치 점검 (시산표 vs 손익)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => void loadAccountingHealth()} disabled={accountingHealthLoading}>
                  {accountingHealthLoading ? t("loading") : "대사 재조회"}
                </Button>
                <span className="text-xs text-muted-foreground">기준월: {closingYearMonth} / 매장: {storeTb}</span>
              </div>
              {accountingHealth ? (
                <div className="rounded border border-border/60 p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    <div>TB 수익(4xx): {accountingHealth.tbRevenue.toLocaleString()}</div>
                    <div>TB 비용(5xx): {accountingHealth.tbExpense.toLocaleString()}</div>
                    <div>TB 순이익: {accountingHealth.tbNetIncome.toLocaleString()}</div>
                    <div>손익계산서 순이익: {accountingHealth.incomeNetProfit.toLocaleString()}</div>
                    <div>BS 당기손익: {accountingHealth.bsCurrentPeriodProfit.toLocaleString()}</div>
                    <div>마감 미리보기 순이익: {accountingHealth.closingPreviewNetIncome.toLocaleString()}</div>
                    <div>순이익 차이(TB-손익): {accountingHealth.netDiff.toLocaleString()}</div>
                    <div>순이익 차이(TB-BS): {accountingHealth.bsDiff.toLocaleString()}</div>
                    <div>순이익 차이(TB-마감): {accountingHealth.closingDiff.toLocaleString()}</div>
                    <div>시산표 차대차: {accountingHealth.tbDiff.toLocaleString()}</div>
                  </div>
                  {Math.abs(accountingHealth.netDiff) > 0.0001 ||
                  Math.abs(accountingHealth.bsDiff) > 0.0001 ||
                  Math.abs(accountingHealth.closingDiff) > 0.0001 ||
                  Math.abs(accountingHealth.tbDiff) > 0.0001 ? (
                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                      차이가 감지되었습니다. 매장 스코프/분개 누락/계정분류(4xx·5xx) 설정을 점검하세요.
                    </div>
                  ) : (
                    <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
                      현재 기준에서는 시산표와 손익 순이익이 일치합니다.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">대사 데이터를 불러오지 못했습니다. 재조회 버튼을 눌러 확인하세요.</div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">수익/비용 마감 (Flow 스타일)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
                  <Input
                    type="month"
                    className="h-9 w-[160px]"
                    value={closingYearMonth}
                    onChange={(e) => setClosingYearMonth(e.target.value)}
                  />
                </div>
                {isOffice ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                    <Select value={storeTb} onValueChange={setStoreTb}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {storeOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {storeOptionLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">손익 계정</div>
                  <Input
                    className="h-9 w-[120px] font-mono"
                    value={closingProfitLossAccountCode}
                    onChange={(e) => setClosingProfitLossAccountCode(e.target.value)}
                    placeholder="3120"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void loadIncomeExpenseClosingPreview()} disabled={closingLoading}>
                  {closingLoading ? t("loading") : t("search")}
                </Button>
                <a href={closingAuditCsvUrl} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button type="button" variant="outline" className="h-9">
                    감사 CSV
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">마감 메모 (초안/승인 이력에 저장)</div>
                <Textarea
                  className="min-h-[72px]"
                  value={closingMemo}
                  onChange={(e) => setClosingMemo(e.target.value)}
                  placeholder="예: 2026-03 본점 결산, 비용 계정 확인 완료"
                />
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={closingAutoLock}
                    onChange={(e) => setClosingAutoLock(e.target.checked)}
                  />
                  마감 승인 시 해당 회계기간 자동 잠금
                </label>
              </div>
              {closingPreview ? (
                <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div>수익 합계: {closingPreview.revenueTotal.toLocaleString()}</div>
                    <div>비용 합계: {closingPreview.expenseTotal.toLocaleString()}</div>
                    <div>당기순이익: {closingPreview.netIncome.toLocaleString()}</div>
                    <div>생성 분개 라인: {closingPreview.lineCount.toLocaleString()}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    손익 반영 계정: {closingPreview.profitLossAccountCode} ({closingPreview.profitLossAccountName})
                  </div>
                  <div className="overflow-x-auto rounded border border-border/60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2">계정코드</th>
                          <th className="text-left p-2">계정명</th>
                          <th className="text-left p-2">차/대</th>
                          <th className="text-right p-2">금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closingPreview.lines.slice(0, 200).map((ln, i) => (
                          <tr key={`${ln.accountCode}-${ln.side}-${i}`} className="border-b border-border/40">
                            <td className="p-2 font-mono">{ln.accountCode}</td>
                            <td className="p-2">{ln.accountName || "-"}</td>
                            <td className="p-2">{ln.side === "debit" ? "차변" : "대변"}</td>
                            <td className="p-2 text-right">{ln.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void saveIncomeExpenseClosingDraftNow()}
                      disabled={closingDraftSaving || closingPosting}
                    >
                      {closingDraftSaving ? t("loading") : "임시저장(draft)"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void runIncomeExpenseClosing(false)}
                      disabled={closingPosting || closingPreview.lineCount === 0 || !canApproveCompliance}
                    >
                      {closingPosting ? t("loading") : "마감 실행(승인)"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void runIncomeExpenseClosing(true)}
                      disabled={closingPosting || closingPreview.lineCount === 0 || !canApproveCompliance}
                    >
                      {closingPosting ? t("loading") : "재실행(리셋 후)"}
                    </Button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    최근 초안: {closingDraft?.created_at ? formatBangkokDateTime(String(closingDraft.created_at)) : "-"}
                    {closingDraft?.created_by ? ` / ${closingDraft.created_by}` : ""}
                    {closingDraft?.memo ? ` / ${closingDraft.memo}` : ""}
                  </div>
                  {closingDraftDiff ? (
                    <div className="rounded border border-border/60 p-2">
                      <div className="text-xs font-medium mb-1">초안 대비 현재 변경점</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
                        <div>수익 차이: {closingDraftDiff.revenueDiff.toLocaleString()}</div>
                        <div>비용 차이: {closingDraftDiff.expenseDiff.toLocaleString()}</div>
                        <div>순익 차이: {closingDraftDiff.netIncomeDiff.toLocaleString()}</div>
                        <div>라인 차이: {closingDraftDiff.lineCountDiff.toLocaleString()}</div>
                        <div>변경 항목: {closingDraftDiff.changedCount.toLocaleString()}</div>
                      </div>
                      {closingDraftDiff.changedSample.length ? (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {closingDraftDiff.changedSample.map((item) => (
                            <div key={item.key}>
                              {item.key} / 현재 {item.current.toLocaleString()} / 초안 {item.draft.toLocaleString()} / 차이{" "}
                              {item.diff.toLocaleString()}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="text-[11px] text-muted-foreground">
                    최근 마감: {closingPosted?.entry_no || "-"} / {formatBangkokDateTime(String(closingPosted?.posted_at || ""))}
                    {closingPosted?.posted_by ? ` / ${closingPosted.posted_by}` : ""}
                  </div>
                  <div className="rounded border border-border/60 p-2">
                    <div className="text-xs font-medium mb-1">문서 이력 (최근 30건)</div>
                    {closingHistory.length ? (
                      <div className="space-y-1 text-[11px]">
                        {closingHistory.map((h) => (
                          <div key={String(h.id)} className="border-b border-border/40 pb-1">
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>{h.status || "-"}</span>
                              <span>[{h.store_scope || "-"}]</span>
                              <span>{formatBangkokDateTime(String(h.created_at || ""))}</span>
                              <span>{h.created_by || "-"}</span>
                              <span>순익 {Number(h.net_income || 0).toLocaleString()}</span>
                              {h.journal_entry_id ? <span>JE #{h.journal_entry_id}</span> : null}
                              {h.memo ? <span className="text-muted-foreground">{h.memo}</span> : null}
                              {Array.isArray((h.payload as { lines?: unknown[] } | null)?.lines) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => setClosingHistoryExpandedId(closingHistoryExpandedId === Number(h.id || 0) ? null : Number(h.id || 0))}
                                >
                                  {closingHistoryExpandedId === Number(h.id || 0) ? "상세 접기" : "상세 보기"}
                                </Button>
                              ) : null}
                            </div>
                            {closingHistoryExpandedId === Number(h.id || 0) &&
                            Array.isArray((h.payload as { lines?: unknown[] } | null)?.lines) ? (
                              <div className="mt-1 overflow-x-auto rounded border border-border/50">
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="text-left p-1">코드</th>
                                      <th className="text-left p-1">계정</th>
                                      <th className="text-left p-1">차/대</th>
                                      <th className="text-right p-1">금액</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {((h.payload as IncomeExpenseClosingPreview).lines || []).slice(0, 80).map((ln, idx) => (
                                      <tr key={`${ln.accountCode}-${ln.side}-${idx}`} className="border-b border-border/30">
                                        <td className="p-1 font-mono">{ln.accountCode}</td>
                                        <td className="p-1">{ln.accountName || "-"}</td>
                                        <td className="p-1">{ln.side === "debit" ? "차변" : "대변"}</td>
                                        <td className="p-1 text-right">{Number(ln.amount || 0).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">이력이 없습니다.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">조회 버튼을 눌러 마감 미리보기를 확인하세요.</div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">권한/확정 감사로그</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
                  <Input
                    type="month"
                    className="h-9 w-[160px]"
                    value={auditYearMonth}
                    onChange={(e) => setAuditYearMonth(e.target.value)}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">결정</div>
                  <Select value={auditDecision} onValueChange={(v) => setAuditDecision(v as "all" | "allow" | "deny" | "error")}>
                    <SelectTrigger className="h-9 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="allow">허용</SelectItem>
                      <SelectItem value="deny">거부</SelectItem>
                      <SelectItem value="error">오류</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">액션/사유 키워드</div>
                  <Input
                    className="h-9 w-[220px]"
                    value={auditActionKeyword}
                    onChange={(e) => setAuditActionKeyword(e.target.value)}
                    placeholder="예: FORBIDDEN, closing, workflow"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void loadComplianceAuditLogs()} disabled={auditLoading}>
                  {auditLoading ? t("loading") : "감사로그 조회"}
                </Button>
                <a href={complianceAuditCsvUrl} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button type="button" variant="outline" className="h-9">
                    감사 CSV
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
              {auditFallbackUsed ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  감사로그 테이블이 없어 fallback 모드입니다. SQL 마이그레이션 적용 후 다시 조회해 주세요.
                </div>
              ) : null}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">총건수</div>
                  <div className="text-sm font-semibold">{auditKpi.total.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">허용</div>
                  <div className="text-sm font-semibold text-emerald-700">{auditKpi.allowCount.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">거부</div>
                  <div className="text-sm font-semibold text-amber-700">{auditKpi.denyCount.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">오류</div>
                  <div className="text-sm font-semibold text-rose-700">{auditKpi.errorCount.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">거부율</div>
                  <div className="text-sm font-semibold">{auditKpi.denyRate.toFixed(1)}%</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">오류율</div>
                  <div className="text-sm font-semibold">{auditKpi.errorRate.toFixed(1)}%</div>
                </div>
              </div>
              <div className="rounded border border-border/60 p-2 text-[11px]">
                <span className="text-muted-foreground">
                  전월 비교 ({auditPrevMonthStats?.yearMonth || "-"}, 표본 {Number(auditPrevMonthStats?.total || 0).toLocaleString()}건):
                </span>
                {auditDenyRateDelta == null ? (
                  <span className="ml-2 text-muted-foreground">비교 데이터 없음</span>
                ) : (
                  <span
                    className={cn(
                      "ml-2 font-medium",
                      auditDenyRateDelta > 0.0001
                        ? "text-rose-700"
                        : auditDenyRateDelta < -0.0001
                          ? "text-emerald-700"
                          : "text-muted-foreground"
                    )}
                  >
                    거부율 {auditKpi.denyRate.toFixed(1)}% (전월 {Number(auditPrevMonthStats?.denyRate || 0).toFixed(1)}%) /{" "}
                    {auditDenyRateDelta > 0.0001 ? "+" : ""}
                    {auditDenyRateDelta.toFixed(1)}%p
                  </span>
                )}
              </div>
              <div className="rounded border border-border/60 p-2">
                <div className="text-[11px] font-medium mb-1">상위 사유코드 TOP 5</div>
                {auditKpi.topReasons.length ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {auditKpi.topReasons.map(([reason, count]) => (
                      <span key={reason}>
                        {reason}: {count.toLocaleString()}건
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">사유코드 데이터가 없습니다.</div>
                )}
              </div>
              <div className="rounded border border-border/60 p-2">
                <div className="text-[11px] font-medium mb-1">최근 3개월 추세 (거부율/오류율)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-1.5">월</th>
                        <th className="text-right p-1.5">건수</th>
                        <th className="text-right p-1.5">거부율</th>
                        <th className="text-right p-1.5">오류율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditTrendStats.length ? (
                        auditTrendStats.map((row) => (
                          <tr key={row.yearMonth} className="border-b border-border/40">
                            <td className="p-1.5">{row.yearMonth}</td>
                            <td className="p-1.5 text-right">{row.total.toLocaleString()}</td>
                            <td className="p-1.5 text-right">{row.denyRate.toFixed(1)}%</td>
                            <td className="p-1.5 text-right">{row.errorRate.toFixed(1)}%</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="p-1.5 text-muted-foreground" colSpan={4}>
                            추세 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                최근 {auditRows.length.toLocaleString()}건 / 월 {auditYearMonth} / 매장 {storeTb}
              </div>
              <div className="overflow-x-auto rounded border border-border/60">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2">시각</th>
                      <th className="text-left p-2">결정</th>
                      <th className="text-left p-2">액션</th>
                      <th className="text-left p-2">사유코드</th>
                      <th className="text-left p-2">대상</th>
                      <th className="text-left p-2">월/매장</th>
                      <th className="text-left p-2">행위자</th>
                      <th className="text-left p-2">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.length ? (
                      auditRows.map((row, idx) => (
                        <React.Fragment key={`${row.id || "noid"}-${row.created_at || ""}-${row.action_type || ""}-${idx}`}>
                          <tr className="border-b border-border/40 align-top">
                            <td className="p-2 whitespace-nowrap">{formatBangkokDateTime(String(row.created_at || ""))}</td>
                            <td
                              className={cn(
                                "p-2 whitespace-nowrap",
                                row.decision === "deny"
                                  ? "text-amber-700"
                                  : row.decision === "error"
                                    ? "text-rose-700"
                                    : "text-emerald-700"
                              )}
                            >
                              {row.decision === "allow" ? "허용" : row.decision === "deny" ? "거부" : row.decision === "error" ? "오류" : "-"}
                            </td>
                            <td className="p-2 font-mono whitespace-nowrap">{row.action_type || "-"}</td>
                            <td className="p-2 font-mono whitespace-nowrap">{row.reason_code || "-"}</td>
                            <td className="p-2 whitespace-nowrap">
                              {row.target_type || "-"}
                              {row.target_id ? ` #${row.target_id}` : ""}
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              {row.year_month || "-"} / {row.store_scope || "-"}
                            </td>
                            <td className="p-2 whitespace-nowrap">
                              {row.actor || "-"}
                              <span className="ml-1 text-muted-foreground">({row.user_role || "-"})</span>
                            </td>
                            <td className="p-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => {
                                  const key = `${row.id || "noid"}-${idx}`
                                  setAuditExpandedRowKey(auditExpandedRowKey === key ? null : key)
                                }}
                              >
                                {auditExpandedRowKey === `${row.id || "noid"}-${idx}` ? "접기" : "상세"}
                              </Button>
                            </td>
                          </tr>
                          {auditExpandedRowKey === `${row.id || "noid"}-${idx}` ? (
                            <tr className="border-b border-border/30 bg-muted/10">
                              <td className="p-2" colSpan={8}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                  <div className="rounded border border-border/50 p-2">
                                    <div className="font-medium mb-1">메타</div>
                                    <div>period: {row.period_type || "-"} / {row.period_key || "-"}</div>
                                    <div>filing: {row.filing_type || "-"}</div>
                                    <div>target: {row.target_type || "-"} {row.target_id ? `#${row.target_id}` : ""}</div>
                                  </div>
                                  <div className="rounded border border-border/50 p-2">
                                    <div className="font-medium mb-1">payload</div>
                                    <pre className="whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
                                      {row.payload == null ? "-" : (() => {
                                        try {
                                          return JSON.stringify(row.payload, null, 2)
                                        } catch {
                                          return String(row.payload)
                                        }
                                      })()}
                                    </pre>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 text-muted-foreground" colSpan={8}>
                          조회된 감사로그가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">E-Tax Invoice Time Stamp 등록 관리 (Flow 스타일)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">
                권장 가이드:
                <a
                  href="https://flowaccount.com/help-center/category/platform/register-e-tax-invoice-by-time-stamp"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 underline underline-offset-2"
                >
                  FlowAccount 단계 안내
                </a>
                <a href={etaxAuditCsvUrl} target="_blank" rel="noreferrer" className="ml-3 underline underline-offset-2">
                  감사 CSV 다운로드
                </a>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                <Input value={etaxTaxId} onChange={(e) => setEtaxTaxId(e.target.value)} placeholder="Tax ID 13자리" />
                <Input
                  value={etaxBranchCode}
                  onChange={(e) => setEtaxBranchCode(e.target.value)}
                  placeholder="지점코드(본점 00000)"
                />
                <Input
                  value={etaxRdContactEmail}
                  onChange={(e) => setEtaxRdContactEmail(e.target.value)}
                  placeholder="RD 연락용 이메일"
                />
                <Input
                  value={etaxSenderGmail}
                  onChange={(e) => setEtaxSenderGmail(e.target.value)}
                  placeholder="발행용 Gmail"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  value={etaxActivateCodeRef}
                  onChange={(e) => setEtaxActivateCodeRef(e.target.value)}
                  placeholder="Activate Code / CM 계정 참조"
                />
                <Input
                  value={etaxAttachmentInput}
                  onChange={(e) => setEtaxAttachmentInput(e.target.value)}
                  placeholder="증빙 URL(여러 개면 줄바꿈)"
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Input
                  type="file"
                  multiple
                  onChange={(e) => {
                    void uploadEtaxEvidenceFiles(e.target.files)
                    e.currentTarget.value = ""
                  }}
                  disabled={etaxEvidenceUploading}
                />
                <span className="text-muted-foreground">{etaxEvidenceUploading ? "업로드 중..." : "PDF/이미지/엑셀/CSV, 20MB"}</span>
              </div>
              {etaxReminderMessages.length ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800 space-y-1">
                  {etaxReminderMessages.map((msg, idx) => (
                    <div key={`etax-reminder-${idx}`}>- {msg}</div>
                  ))}
                </div>
              ) : null}
              {etaxAttachmentUrls.length ? (
                <div className="rounded border border-border/60 p-2 text-[11px] space-y-1">
                  <div className="font-medium">증빙 링크</div>
                  {etaxAttachmentUrls.map((u, idx) => (
                    <div key={`${u}-${idx}`} className="flex items-center gap-2">
                      <a href={u} target="_blank" rel="noreferrer" className="underline underline-offset-2 truncate">
                        {displayNameFromUrl(u)}
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px]"
                        onClick={async () => {
                          if (!(await appConfirm("이 링크를 삭제할까요?"))) return
                          setEtaxAttachmentInput((prev) => parseAttachmentUrlsFromInput(prev).filter((x) => x !== u).join("\n"))
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="rounded border border-border/60 p-2">
                <div className="text-xs font-medium mb-2">진행 체크리스트 ({etaxStepCountDone}/8)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 text-xs">
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxApplySubmitted} onChange={(e) => toggleEtaxStep("applySubmitted", e.target.checked)} />
                      1) RD 신청 제출 완료
                    </label>
                    {etaxStepAudit.applySubmitted ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("applySubmitted")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxKo01Printed} onChange={(e) => toggleEtaxStep("ko01Printed", e.target.checked)} />
                      2) ก.อ.01 출력·서명·날인
                    </label>
                    {etaxStepAudit.ko01Printed ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("ko01Printed")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxDocsUploaded} onChange={(e) => toggleEtaxStep("docsUploaded", e.target.checked)} />
                      3) PDF 3종 업로드 완료
                    </label>
                    {etaxStepAudit.docsUploaded ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("docsUploaded")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxEmailConfirmed} onChange={(e) => toggleEtaxStep("emailConfirmed", e.target.checked)} />
                      4) RD 확인 이메일 인증
                    </label>
                    {etaxStepAudit.emailConfirmed ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("emailConfirmed")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={etaxActivateCodeReceived}
                        onChange={(e) => toggleEtaxStep("activateCodeReceived", e.target.checked)}
                      />
                      5) Activate Code 수령
                    </label>
                    {etaxStepAudit.activateCodeReceived ? (
                      <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("activateCodeReceived")}</div>
                    ) : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxPasswordSet} onChange={(e) => toggleEtaxStep("passwordSet", e.target.checked)} />
                      6) RD 비밀번호 재설정
                    </label>
                    {etaxStepAudit.passwordSet ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("passwordSet")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={etaxSenderEmailRegistered}
                        onChange={(e) => toggleEtaxStep("senderEmailRegistered", e.target.checked)}
                      />
                      7) 발송 e-mail Address 등록
                    </label>
                    {etaxStepAudit.senderEmailRegistered ? (
                      <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("senderEmailRegistered")}</div>
                    ) : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxPilotIssued} onChange={(e) => toggleEtaxStep("pilotIssued", e.target.checked)} />
                      8) 시험 발행/수신 확인
                    </label>
                    {etaxStepAudit.pilotIssued ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("pilotIssued")}</div> : null}
                  </div>
                </div>
              </div>
              <Textarea
                value={etaxMemo}
                onChange={(e) => setEtaxMemo(e.target.value)}
                className="min-h-[72px]"
                placeholder="운영 메모(예: 우편 수령일, 담당자 핫라인, 실패 이슈)"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void saveEtaxTimestampProgress()} disabled={etaxSaving || !canWriteCompliance}>
                  {etaxSaving ? t("loading") : "E-Tax 진행 저장"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  현재 상태: {workflowStatusLabel((etaxWorkflowRow?.status as "todo" | "in_progress" | "review" | "done") || "todo")}
                  {etaxWorkflowMeta?.updatedAt ? ` / ${formatBangkokDateTime(etaxWorkflowMeta.updatedAt)}` : ""}
                  {etaxWorkflowMeta?.updatedBy ? ` / ${etaxWorkflowMeta.updatedBy}` : ""}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial" className={cn(tabsContentClass, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
              <Input
                type="month"
                className="h-9 w-[160px]"
                value={yearMonthTb}
                onChange={(e) => setYearMonthTb(e.target.value)}
              />
            </div>
            {isOffice && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                <Select value={storeTb} onValueChange={setStoreTb}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {storeOptionLabel(s)}
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
                    <th className="text-left p-2">{t("accCompColCode")}</th>
                    <th className="text-left p-2">{t("accCompColName")}</th>
                    <th className="text-right p-2">{t("accCompColDebit")}</th>
                    <th className="text-right p-2">{t("accCompColCredit")}</th>
                    <th className="text-right p-2">{t("accCompColNetDr")}</th>
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

        <TabsContent value="summary" className={cn(tabsContentClass, "space-y-3")}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("accCompTabPp30")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 items-end">
                {!externalFiling ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
                    <Input
                      type="month"
                      className="h-9 w-[160px]"
                      value={taxMonth}
                      onChange={(e) => setTaxMonth(e.target.value)}
                    />
                  </div>
                ) : null}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompPeriodType")}</div>
                  <Select
                    value={periodType}
                    onValueChange={(v) => setPeriodType(v as "monthly" | "half_year" | "annual")}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{t("accCompPeriodMonthly")}</SelectItem>
                      <SelectItem value="half_year">{t("accCompPeriodHalfYear")}</SelectItem>
                      <SelectItem value="annual">{t("accCompPeriodAnnual")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompColStatus")}</div>
                  <Select
                    value={ledgerStatusFilter}
                    onValueChange={(v) => setLedgerStatusFilter(v as "all" | "draft" | "submitted")}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all")}</SelectItem>
                      <SelectItem value="draft">{t("accCompWorkflowStatusTodo")}</SelectItem>
                      <SelectItem value="submitted">{t("accCompWorkflowStatusDone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isOffice && !externalFiling ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                    <Select value={storeTb} onValueChange={setStoreTb}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {storeOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {storeOptionLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void loadTaxSummary()
                    if (pp30SubView === "wht") void loadWht()
                    else void loadVat()
                  }}
                  disabled={loading}
                >
                  {t("search")}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
                <Button
                  type="button"
                  size="sm"
                  variant={pp30SubView === "output" ? "default" : "outline"}
                  onClick={() => setPp30SubView("output")}
                >
                  {t("accCompTaxOutputDocs")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pp30SubView === "input" ? "default" : "outline"}
                  onClick={() => setPp30SubView("input")}
                >
                  {t("accCompTaxInputDocs")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pp30SubView === "wht" ? "default" : "outline"}
                  onClick={() => setPp30SubView("wht")}
                >
                  {t("accCompTaxWhtDocs")}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("accCompPeriodType")}: {summaryPeriodLabel}
              </div>

              {pp30SubView === "output" && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      {t("accCompVatOutputNet")}: {(taxSummary?.vat.outputNet || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatOutputVat")}: {(taxSummary?.vat.outputVat || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatPayable")}: {(taxSummary?.vat.payableVat || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatRowsSales")}: {vatOutputRowsFiltered.length.toLocaleString()} / {t("accCompVatTotalRows")}:{" "}
                      {(taxSummary?.vat.rowCount || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompMissingTin")}: {(taxSummary?.vat.missingTaxIdCount || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompMissingInvoice")}: {(taxSummary?.vat.missingInvoiceCount || 0).toLocaleString()}
                    </div>
                  </div>
                  {taxSummary ? (
                    <div className="rounded-md border border-dashed border-border/70 bg-muted/15 p-2 text-xs space-y-2">
                      <div className="font-medium text-foreground/90">{t("accCompPp30WhtSamePeriod")}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          {t("accCompWhtLabelGross")}: {(taxSummary.wht.totalGross || 0).toLocaleString()}
                        </div>
                        <div>
                          {t("accCompWhtLabelWithheld")}: {(taxSummary.wht.totalWithheld || 0).toLocaleString()}
                        </div>
                        <div>
                          {t("accCompWhtLabelRows")}: {(taxSummary.wht.rowCount || 0).toLocaleString()}
                        </div>
                        <div>
                          {t("accCompMissingTinWht")}: {(taxSummary.wht.missingTaxIdCount || 0).toLocaleString()}
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {t("accCompTaxWhtDocs")} · {t("accCompPp30GoWhtLedger")}
                      </p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVatRows((prev) => [
                          ...prev,
                          { ...emptyVat(taxMonth, storeFilterForLedger !== "All" ? storeFilterForLedger : ""), direction: "output" },
                        ])
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t("accCompVatAdd")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a
                        href={vatExportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("accCompVatExport")}
                      </a>
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="p-2 overflow-x-auto space-y-3">
                      {vatRows.map((row, idx) => {
                        if (row.direction !== "output") return null
                        if (ledgerStatusFilter !== "all" && row.filing_status !== ledgerStatusFilter) return null
                        return (
                          <div
                            key={row.id ?? `vat-out-${idx}`}
                            className="border rounded-md p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs"
                          >
                            <Input
                              type="date"
                              value={row.doc_date}
                              onChange={(e) => {
                                const v = e.target.value
                                setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, doc_date: v } : x)))
                              }}
                            />
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
                                <SelectItem value="output">{t("accCompDirOutput")}</SelectItem>
                                <SelectItem value="input">{t("accCompDirInput")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder={t("accCompPhCounterparty")}
                              value={row.counterparty_name}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, counterparty_name: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhTin")}
                              value={row.counterparty_tax_id}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, counterparty_tax_id: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhInvoiceNo")}
                              value={row.invoice_number}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, invoice_number: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhNet")}
                              value={row.net_amount}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, net_amount: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhVat")}
                              value={row.vat_amount}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, vat_amount: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhTotal")}
                              value={row.total_amount}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, total_amount: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              className="md:col-span-2"
                              placeholder={t("accCompPhVatStatus")}
                              value={row.vat_status}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, vat_status: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              className="md:col-span-2"
                              placeholder={t("accCompPhMemo")}
                              value={row.memo}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, memo: e.target.value } : x))
                                )
                              }
                            />
                            <Select
                              value={row.filing_status}
                              onValueChange={(v) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, filing_status: v as "draft" | "submitted" } : x
                                  )
                                )
                              }
                            >
                              <SelectTrigger className="md:col-span-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">{filingStatusLabel("draft")}</SelectItem>
                                <SelectItem value="submitted">{filingStatusLabel("submitted")}</SelectItem>
                              </SelectContent>
                            </Select>
                            {row.filing_status === "submitted" ? (
                              <div className="md:col-span-4 text-[11px] text-muted-foreground">
                                Submitted at: {formatBangkokDateTime(row.submitted_at)}
                                {row.submitted_by ? ` · Submitted by: ${row.submitted_by}` : ""}
                              </div>
                            ) : null}
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
                        )
                      })}
                      {!vatOutputRowsFiltered.length ? (
                        <div className="p-6 text-center text-muted-foreground text-xs">{t("emp_result_empty")}</div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}

              {pp30SubView === "input" && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      {t("accCompVatInputNet")}: {(taxSummary?.vat.inputNet || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatInputVat")}: {(taxSummary?.vat.inputVat || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatPayable")}: {(taxSummary?.vat.payableVat || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatRowsPurchase")}: {vatInputRowsFiltered.length.toLocaleString()} / {t("accCompVatTotalRows")}:{" "}
                      {(taxSummary?.vat.rowCount || 0).toLocaleString()}
                    </div>
                  </div>
                  {taxSummary ? (
                    <div className="rounded-md border border-dashed border-border/70 bg-muted/15 p-2 text-xs space-y-2">
                      <div className="font-medium text-foreground/90">{t("accCompPp30WhtSamePeriod")}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          {t("accCompWhtLabelGross")}: {(taxSummary.wht.totalGross || 0).toLocaleString()}
                        </div>
                        <div>
                          {t("accCompWhtLabelWithheld")}: {(taxSummary.wht.totalWithheld || 0).toLocaleString()}
                        </div>
                        <div>
                          {t("accCompWhtLabelRows")}: {(taxSummary.wht.rowCount || 0).toLocaleString()}
                        </div>
                        <div>
                          {t("accCompMissingTinWht")}: {(taxSummary.wht.missingTaxIdCount || 0).toLocaleString()}
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {t("accCompTaxWhtDocs")} · {t("accCompPp30GoWhtLedger")}
                      </p>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setVatRows((prev) => [
                          ...prev,
                          { ...emptyVat(taxMonth, storeFilterForLedger !== "All" ? storeFilterForLedger : ""), direction: "input" },
                        ])
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t("accCompVatAdd")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a
                        href={vatExportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("accCompVatExport")}
                      </a>
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="p-2 overflow-x-auto space-y-3">
                      {vatRows.map((row, idx) => {
                        if (row.direction !== "input") return null
                        if (ledgerStatusFilter !== "all" && row.filing_status !== ledgerStatusFilter) return null
                        return (
                          <div
                            key={row.id ?? `vat-in-${idx}`}
                            className="border rounded-md p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs"
                          >
                            <Input
                              type="date"
                              value={row.doc_date}
                              onChange={(e) => {
                                const v = e.target.value
                                setVatRows((prev) => prev.map((x, i) => (i === idx ? { ...x, doc_date: v } : x)))
                              }}
                            />
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
                                <SelectItem value="output">{t("accCompDirOutput")}</SelectItem>
                                <SelectItem value="input">{t("accCompDirInput")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder={t("accCompPhCounterparty")}
                              value={row.counterparty_name}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, counterparty_name: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhTin")}
                              value={row.counterparty_tax_id}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, counterparty_tax_id: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhInvoiceNo")}
                              value={row.invoice_number}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, invoice_number: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhNet")}
                              value={row.net_amount}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, net_amount: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhVat")}
                              value={row.vat_amount}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, vat_amount: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              placeholder={t("accCompPhTotal")}
                              value={row.total_amount}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, total_amount: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              className="md:col-span-2"
                              placeholder={t("accCompPhVatStatus")}
                              value={row.vat_status}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, vat_status: e.target.value } : x))
                                )
                              }
                            />
                            <Input
                              className="md:col-span-2"
                              placeholder={t("accCompPhMemo")}
                              value={row.memo}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, memo: e.target.value } : x))
                                )
                              }
                            />
                            <Select
                              value={row.filing_status}
                              onValueChange={(v) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, filing_status: v as "draft" | "submitted" } : x
                                  )
                                )
                              }
                            >
                              <SelectTrigger className="md:col-span-2">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">{filingStatusLabel("draft")}</SelectItem>
                                <SelectItem value="submitted">{filingStatusLabel("submitted")}</SelectItem>
                              </SelectContent>
                            </Select>
                            {row.filing_status === "submitted" ? (
                              <div className="md:col-span-4 text-[11px] text-muted-foreground">
                                Submitted at: {formatBangkokDateTime(row.submitted_at)}
                                {row.submitted_by ? ` · Submitted by: ${row.submitted_by}` : ""}
                              </div>
                            ) : null}
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
                        )
                      })}
                      {!vatInputRowsFiltered.length ? (
                        <div className="p-6 text-center text-muted-foreground text-xs">{t("emp_result_empty")}</div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}

              {pp30SubView === "wht" && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      {t("accCompWhtGrossShort")}: {(taxSummary?.wht.totalGross || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompWhtWithheldShort")}: {(taxSummary?.wht.totalWithheld || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompWhtRowsShort")}: {(taxSummary?.wht.rowCount || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompMissingTin")}: {(taxSummary?.wht.missingTaxIdCount || 0).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompMissingCertNo")}: {(taxSummary?.wht.missingCertificateCount || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                    <div className="text-xs font-medium">{pnd1PayerBoxTitle}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                      <Input
                        placeholder="payer tax id (13 digits)"
                        value={pnd1PayerTaxId}
                        onChange={(e) => setPnd1PayerTaxId(e.target.value)}
                      />
                      <Input
                        placeholder="branch no (00000)"
                        value={pnd1PayerBranchNo}
                        onChange={(e) => setPnd1PayerBranchNo(e.target.value)}
                      />
                      <Input
                        className="lg:col-span-2"
                        placeholder={lang === "th" ? "ชื่อนิติบุคคลผู้จ่าย" : lang === "en" ? "Payer legal name" : "지급자 법인명"}
                        value={pnd1PayerName}
                        onChange={(e) => setPnd1PayerName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-muted-foreground min-w-16">{pnd1FormLabel}</div>
                      <Select
                        value={pnd1FormMode}
                        onValueChange={(v) => setPnd1FormMode(v as "auto" | "pnd1" | "pnd1a" | "all")}
                      >
                        <SelectTrigger className="w-[180px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto ({periodType === "annual" ? "PND1A" : "PND1"})</SelectItem>
                          <SelectItem value="pnd1">PND1 (ภ.ง.ด.1)</SelectItem>
                          <SelectItem value="pnd1a">PND1A (ภ.ง.ด.1ก)</SelectItem>
                          <SelectItem value="all">All</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={pnd1IncludeHeader}
                          onChange={(e) => setPnd1IncludeHeader(e.target.checked)}
                        />
                        include header row
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setWhtRows((prev) => [
                          ...prev,
                          emptyWht(taxMonth, storeTb !== "All" ? storeTb : ""),
                        ])
                      }
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t("accCompVatAdd")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a
                        href={whtExportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("accCompWhtExportCsv")}
                      </a>
                    </Button>
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a
                        href={pnd1RdPrepUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {pnd1RdPrepBtnLabel}
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void runPnd1Validation()}
                      disabled={pnd1Validating}
                    >
                      {pnd1Validating ? t("loading") : pnd1ValidateBtnLabel}
                    </Button>
                  </div>
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground space-y-1">
                    <div className="font-medium text-foreground/90">{pnd1RdPrepGuideTitle}</div>
                    <p>{pnd1RdPrepGuideNote}</p>
                    <a
                      href="https://flowaccount.com/blog/rd-prep-pnd1/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline"
                    >
                      FlowAccount RD Prep 예시 보기
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  {pnd1ValidationResult ? (
                    <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium">{pnd1ValidationTableTitle}</div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => exportPnd1ValidationCsv()}
                          >
                            {pnd1IssueExportCsvLabel}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setPnd1ValidationResult(null)}
                          >
                            {pnd1ClearValidationLabel}
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-xs text-muted-foreground">
                          Rows: {pnd1ValidationResult.totalRows.toLocaleString()} · Issues:{" "}
                          {pnd1ValidationResult.issues.length.toLocaleString()} · Filtered:{" "}
                          {pnd1IssueRowsFiltered.length.toLocaleString()}
                        </div>
                        <div className="ml-auto w-full lg:w-auto space-y-1">
                          <div className="text-xs text-muted-foreground">{pnd1IssueFilterLabel}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={pnd1IssueFilterCodes.length === 0 ? "default" : "outline"}
                              onClick={() => setPnd1IssueFilterCodes([])}
                              className="justify-between"
                            >
                              <span>{lang === "th" ? "ทั้งหมด" : lang === "en" ? "All" : "전체"}</span>
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                {(pnd1ValidationResult?.issues.length || 0).toLocaleString()}
                              </span>
                            </Button>
                            {PND1_ISSUE_CODES.map((code) => (
                              (() => {
                                const cnt = pnd1IssueCountMap[code] || 0
                                const disabled = cnt === 0
                                return (
                              <Button
                                key={code}
                                type="button"
                                size="sm"
                                variant={pnd1IssueFilterCodes.includes(code) ? "default" : "outline"}
                                onClick={() => togglePnd1IssueCode(code)}
                                className="justify-between"
                                disabled={disabled}
                                title={disabled ? pnd1NoIssueTooltip : ""}
                              >
                                <span className="truncate">{pnd1IssueCodeLabel(code)}</span>
                                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                  {cnt.toLocaleString()}
                                </span>
                              </Button>
                                )
                              })()
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded border border-border/60">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left p-2">Line</th>
                              <th className="text-left p-2">Issue</th>
                              <th className="text-left p-2">Hint</th>
                              <th className="text-right p-2">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pnd1IssueRowsFiltered.slice(0, 300).map((issue, i) => (
                              <tr key={`${issue.lineNo}-${issue.code}-${i}`} className="border-b border-border/40">
                                <td className="p-2 font-mono">{issue.lineNo}</td>
                                <td className="p-2">{pnd1IssueCodeLabel(issue.code)}</td>
                                <td className="p-2 text-muted-foreground">
                                  {issue.payeeName || "-"}
                                  {issue.certificateNo ? ` / cert:${issue.certificateNo}` : ""}
                                </td>
                                <td className="p-2 text-right">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={!issue.rowId}
                                    onClick={() => jumpToWhtLedgerRow(issue.rowId)}
                                  >
                                    {pnd1GoLedgerBtnLabel}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                            {!pnd1IssueRowsFiltered.length ? (
                              <tr>
                                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                  {lang === "th" ? "ไม่พบข้อมูล" : lang === "en" ? "No issues" : "표시할 이슈가 없습니다."}
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  <Card>
                    <CardContent className="p-2 overflow-x-auto space-y-3">
                      {whtRows.map((row, idx) => {
                        if (ledgerStatusFilter !== "all" && row.filing_status !== ledgerStatusFilter) return null
                        return (
                        <div
                          key={row.id ?? `wht-${idx}`}
                          ref={(el) => {
                            if (row.id) whtRowRefs.current[row.id] = el
                          }}
                          className="border rounded-md p-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs"
                        >
                          <Input
                            type="date"
                            value={row.payment_date}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, payment_date: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompStore")}
                            value={row.store_name}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, store_name: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompPhPayee")}
                            value={row.payee_name}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, payee_name: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompPhPayeeTin")}
                            value={row.payee_tax_id}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, payee_tax_id: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompPhIncomeType")}
                            value={row.income_type}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, income_type: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompPhGross")}
                            value={row.gross_amount}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, gross_amount: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompPhWhtRate")}
                            value={row.wht_rate}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, wht_rate: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompPhWhtAmt")}
                            value={row.wht_amount}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, wht_amount: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            placeholder={t("accCompPhFormHint")}
                            value={row.form_hint}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, form_hint: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            className="md:col-span-2"
                            placeholder={t("accCompPhCertNo")}
                            value={row.certificate_no}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, certificate_no: e.target.value } : x))
                              )
                            }
                          />
                          <Input
                            className="md:col-span-2"
                            placeholder={t("accCompPhMemo")}
                            value={row.memo}
                            onChange={(e) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, memo: e.target.value } : x))
                              )
                            }
                          />
                          <Select
                            value={row.filing_status}
                            onValueChange={(v) =>
                              setWhtRows((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, filing_status: v as "draft" | "submitted" } : x
                                )
                              )
                            }
                          >
                            <SelectTrigger className="md:col-span-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">{filingStatusLabel("draft")}</SelectItem>
                              <SelectItem value="submitted">{filingStatusLabel("submitted")}</SelectItem>
                            </SelectContent>
                          </Select>
                          {row.filing_status === "submitted" ? (
                            <div className="md:col-span-4 text-[11px] text-muted-foreground">
                              Submitted at: {formatBangkokDateTime(row.submitted_at)}
                              {row.submitted_by ? ` · Submitted by: ${row.submitted_by}` : ""}
                            </div>
                          ) : null}
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
                        )
                      })}
                      {!whtRowsFiltered.length ? (
                        <div className="p-6 text-center text-muted-foreground text-xs">{t("emp_result_empty")}</div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cit" className={cn(tabsContentClass, "space-y-3")}>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t("accCompPeriodType")}</div>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as "monthly" | "half_year" | "annual")}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("accCompPeriodMonthly")}</SelectItem>
                  <SelectItem value="half_year">{t("accCompPeriodHalfYear")}</SelectItem>
                  <SelectItem value="annual">{t("accCompPeriodAnnual")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {periodType === "annual" ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompCitFiscalYear")}</div>
                <Select
                  value={String(citFiscalYear)}
                  onValueChange={(v) => setCitFiscalYear(Number(v))}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {citFiscalYearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : !externalFiling ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
                <Input
                  type="month"
                  className="h-9 w-[160px]"
                  value={taxMonth}
                  onChange={(e) => setTaxMonth(e.target.value)}
                />
              </div>
            ) : null}
            {isOffice && !externalFiling ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                <Select value={storeTb} onValueChange={setStoreTb}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {storeOptionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => void loadCit()} disabled={loading}>
              {t("search")}
            </Button>
            <Button type="button" variant="outline" asChild>
              <a
                href={getExportCorporateTaxPackageCsvUrl({
                  userRole: role,
                  yearMonth: citYearMonthForApi,
                  periodType,
                  storeFilter: storeTb,
                  userStore: auth?.store,
                })}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("accCompCitPackageCsv")}
              </a>
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6 text-sm space-y-2">
              <div>
                {t("accCompCitAccountingProfit")}: {(citData?.accountingProfit || 0).toLocaleString()}
              </div>
              <div>
                {t("accCompCitTaxAddBacks")}: {(citData?.taxAddBack || 0).toLocaleString()}
              </div>
              <div>
                {t("accCompCitTaxDeductions")}: {(citData?.taxDeduction || 0).toLocaleString()}
              </div>
              <div>
                {t("accCompCitTaxableIncome")}: {(citData?.taxableIncome || 0).toLocaleString()}
              </div>
              <div>
                {t("accCompCitTaxRate")}: {((citData?.taxRate || 0) * 100).toFixed(2)}%
              </div>
              <div>
                {t("accCompCitEstimated")}: {(citData?.estimatedTax || 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sso" className={cn(tabsContentClass, "space-y-3")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                {t("accCompTabSso")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed">{t("accCompSsoIntro")}</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{t("accCompSsoStep1")}</li>
                <li>{t("accCompSsoStep2")}</li>
                <li>{t("accCompSsoStep3")}</li>
              </ul>
              <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-md px-3 py-2">
                {t("accCompSsoDisclaimer")}
              </p>
              <details className="text-xs text-muted-foreground rounded-md border border-border/60 px-3 py-2 bg-muted/20">
                <summary className="cursor-pointer font-medium text-foreground/90">{t("accCompSsoGapTitle")}</summary>
                <p className="mt-2 whitespace-pre-line leading-relaxed">{t("accCompSsoGapBody")}</p>
              </details>
              <p className="text-muted-foreground text-xs">{t("accCompSsoPayrollHint")}</p>
              <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-2">
                <div className="text-xs font-medium">Step 1. SSO 온라인 신고 준비 확인</div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ssoOnlineEnabled}
                    onChange={(e) => setSsoOnlineEnabled(e.target.checked)}
                  />
                  사업장 SSO 온라인 거래신청(인터넷 거래) 계정 발급 완료
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ssoEmployeeRegReady}
                    onChange={(e) => setSsoEmployeeRegReady(e.target.checked)}
                  />
                  당월 입/퇴사자 등록 정리 완료 (신규 등록/종료 신고 포함)
                </label>
                <div className="text-[11px] text-muted-foreground">
                  상태: {ssoStep1Ready ? "완료" : "미완료"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                {!externalFiling ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
                    <Input
                      type="month"
                      className="h-9 w-[160px]"
                      value={taxMonth}
                      onChange={(e) => setTaxMonth(e.target.value)}
                    />
                  </div>
                ) : null}
                {isOffice && !externalFiling ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t("accCompSsoPayrollStore")}</div>
                    <Select value={ssoStoreFilter} onValueChange={setSsoStoreFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {storeOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {storeOptionLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void fetchSsoPayrollRows()}
                  disabled={ssoPayrollLoading}
                >
                  {ssoPayrollLoading ? t("loading") : "급여 스냅샷 불러오기"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void exportSsoFromPayroll()}
                  disabled={ssoPayrollExporting || !ssoStep1Ready}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {ssoPayrollExporting ? t("loading") : t("accCompSsoFromPayroll")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => downloadThaiSsoFilingBlankTemplateXlsx({ yearMonth: taxMonth })}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t("accCompSsoDownloadBlank")}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href="https://www.sso.go.th/" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t("accCompSsoOpenSsoSite")}
                  </a>
                </Button>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium">Step 2. 급여/사회보험 계산 검증</div>
                <div className="text-[11px] text-muted-foreground">
                  월: {taxMonth} / 매장: {ssoSelectedStore || "All"} / 로딩시각:{" "}
                  {ssoPayrollLoadedAt ? formatBangkokDateTime(ssoPayrollLoadedAt) : "-"}
                </div>
                {ssoPayrollPreview ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div>대상 인원: {ssoPayrollPreview.rowCount.toLocaleString()}</div>
                    <div>매장 수: {ssoPayrollPreview.storeCount.toLocaleString()}</div>
                    <div>근로자 부담: {Math.round(ssoPayrollPreview.totalEmployeeSso).toLocaleString()}</div>
                    <div>사업주 부담: {Math.round(ssoPayrollPreview.totalEmployerSso).toLocaleString()}</div>
                    <div>합계 부담금: {Math.round(ssoPayrollPreview.totalContribution).toLocaleString()}</div>
                    <div>주민번호 누락: {ssoPayrollPreview.missingCitizenIdCount.toLocaleString()}</div>
                    <div>SSO번호 누락: {ssoPayrollPreview.missingSsoMemberNoCount.toLocaleString()}</div>
                    <div>상태: {ssoStep2Ready ? "완료" : "대상 없음"}</div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">아직 급여 스냅샷을 불러오지 않았습니다.</div>
                )}
              </div>
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium">Step 3. 신고 파일 생성 및 제출</div>
                <div className="text-[11px] text-muted-foreground">
                  {
                    "Step 1, 2 완료 후 Payroll → SSO 파일 다운로드 버튼으로 양식을 생성해 SSO 사이트에 업로드하세요."
                  }
                </div>
                <div className="text-xs text-muted-foreground">상태: {ssoStep3Ready ? "준비 완료" : "준비 필요"}</div>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium">Step 4. 제출 완료 기록</div>
                <div className="text-[11px] text-muted-foreground">
                  제출 후 완료 기록을 남겨 월별 워크플로우(SSO done)와 연결합니다.
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">증빙 메모</div>
                  <Textarea
                    rows={2}
                    value={ssoSubmissionMemo}
                    onChange={(e) => setSsoSubmissionMemo(e.target.value)}
                    placeholder="예: SSO 포털 업로드 완료, 납부까지 완료"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">증빙 첨부 URL (줄바꿈/쉼표로 여러 개)</div>
                  <Textarea
                    rows={3}
                    value={ssoAttachmentInput}
                    onChange={(e) => setSsoAttachmentInput(e.target.value)}
                    placeholder="https://.../receipt1.png"
                  />
                </div>
                {ssoAttachmentUrls.length ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      첨부 목록 ({ssoAttachmentUrls.length.toLocaleString()})
                    </div>
                    <div className="space-y-1">
                      {ssoAttachmentUrls.map((u) => (
                        <div
                          key={u}
                          className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2 py-1"
                        >
                          <a
                            href={u}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-0 flex-1 truncate text-[11px] text-primary underline"
                            title={u}
                          >
                            {displayNameFromUrl(u)}
                          </a>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const ok = await appConfirm(
                                t("msg_delete_confirm_check_item") || "이 증빙 링크를 삭제하시겠습니까?"
                              )
                              if (!ok) return
                              const next = ssoAttachmentUrls.filter((x) => x !== u)
                              setSsoAttachmentInput(next.join("\n"))
                            }}
                          >
                            삭제
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">파일 직접 업로드 (PDF/이미지/엑셀/CSV, 최대 20MB)</div>
                  <Input
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv,application/pdf,image/*,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      void uploadSsoEvidenceFiles(e.target.files)
                      e.currentTarget.value = ""
                    }}
                    disabled={ssoEvidenceUploading}
                  />
                  {ssoEvidenceUploading ? (
                    <div className="text-[11px] text-muted-foreground">업로드 중...</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void markSsoSubmissionDone()}
                    disabled={!ssoStep1Ready || !ssoStep2Ready || ssoSubmissionSaving || !canApproveCompliance}
                  >
                    {ssoSubmissionSaving ? t("loading") : "SSO 제출 완료로 기록"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    현재 상태: {ssoStep4Ready ? "완료" : "미완료"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Submitted at: {formatBangkokDateTime(String(ssoWorkflowRow?.updated_at || ""))}
                  {ssoWorkflowRow?.updated_by ? ` · Submitted by: ${ssoWorkflowRow.updated_by}` : ""}
                </div>
                {ssoWorkflowMeta?.memo ? (
                  <div className="text-[11px] text-muted-foreground">Memo: {ssoWorkflowMeta.memo}</div>
                ) : null}
                {ssoWorkflowMeta?.attachmentUrls?.length ? (
                  <div className="flex flex-col gap-1">
                    {ssoWorkflowMeta.attachmentUrls.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] underline text-primary truncate"
                        title={u}
                      >
                        {displayNameFromUrl(u)}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("accCompSsoColumnGuideTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">field</th>
                    <th className="text-left p-2 font-medium">ไทย</th>
                    <th className="text-left p-2 font-medium">English</th>
                  </tr>
                </thead>
                <tbody>
                  {THAI_SSO_TEMPLATE_COLUMN_HELP.map((c) => (
                    <tr key={c.field} className="border-b border-border/50">
                      <td className="p-2 font-mono text-[11px]">{c.field}</td>
                      <td className="p-2">{c.labelTh}</td>
                      <td className="p-2 text-muted-foreground">{c.labelEn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kt20k" className={cn(tabsContentClass, "space-y-3")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">KT20K (กท.20 ก)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {lang === "th"
                  ? "โครง UI และสรุปข้อมูลรายเดือนสำหรับ KT20K (MVP)"
                  : lang === "en"
                    ? "KT20K monthly summary UI scaffold (MVP)"
                    : "KT20K(กท.20 ก) 월별 집계 UI 스켈레톤(MVP)입니다."}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
                <Input
                  placeholder={lang === "th" ? "เลขผู้เสียภาษีบริษัท" : lang === "en" ? "Company tax ID" : "법인 세금번호"}
                  value={kt20kEmployer.companyTaxId}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, companyTaxId: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  className="lg:col-span-2"
                  placeholder={lang === "th" ? "ชื่อบริษัท" : lang === "en" ? "Company name" : "회사명"}
                  value={kt20kEmployer.companyName}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, companyName: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "สำนักงานประกันสังคม (จังหวัด)" : lang === "en" ? "SSO office province" : "관할 SSO(주/도)"}
                  value={kt20kEmployer.ssoProvince}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, ssoProvince: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "เบอร์โทรสำนักงานประกันสังคม" : lang === "en" ? "SSO office phone" : "SSO 연락처"}
                  value={kt20kEmployer.ssoPhone}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, ssoPhone: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "รหัสกิจการ 5 หลัก" : lang === "en" ? "Business code (5 digits)" : "사업코드 5자리"}
                  value={kt20kEmployer.businessCode5}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, businessCode5: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "อัตราเงินสมทบ %" : lang === "en" ? "Fund rate %" : "기금요율 %"}
                  value={kt20kEmployer.fundRatePercent}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, fundRatePercent: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <Input
                  type="number"
                  className="w-[140px]"
                  value={kt20kYear}
                  onChange={(e) => setKt20kYear(e.target.value)}
                />
                {isOffice && !externalFiling ? (
                  <Select value={storeTb} onValueChange={setStoreTb}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {storeOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {storeOptionLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button type="button" variant="secondary" onClick={() => void loadKt20k()} disabled={kt20kLoading}>
                  {kt20kLoading ? t("loading") : t("search")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void saveKt20kEmployerSettings()}
                  disabled={kt20kSettingsSaving || kt20kSettingsLoading}
                >
                  {kt20kSettingsSaving
                    ? t("loading")
                    : lang === "th"
                      ? "บันทึกการตั้งค่า"
                      : lang === "en"
                        ? "Save settings"
                        : "설정 저장"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={kt20kExportUrl} target="_blank" rel="noopener noreferrer">
                    {lang === "th" ? "ส่งออก CSV" : lang === "en" ? "Export CSV" : "CSV 내보내기"}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {lang === "th" ? "สรุปรายเดือน (ม.ค.-ธ.ค.)" : lang === "en" ? "Monthly summary (Jan-Dec)" : "월별 집계(1~12월)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[980px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-2">Month</th>
                    <th className="text-right p-2">Employees</th>
                    <th className="text-right p-2">Salary</th>
                    <th className="text-right p-2">Daily wage</th>
                    <th className="text-right p-2">Other comp</th>
                    <th className="text-right p-2">(1) Total wage</th>
                    <th className="text-right p-2">(2) Excess &gt; 20,000</th>
                    <th className="text-right p-2">(3) Net wage</th>
                  </tr>
                </thead>
                <tbody>
                  {(kt20kData?.rows || []).map((r) => (
                    <tr key={r.month} className="border-b border-border/50">
                      <td className="p-2 font-mono">{r.month}</td>
                      <td className="p-2 text-right">{r.employeeCount.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.salaryAmount.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.dailyWageAmount.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.otherCompAmount.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.totalWage.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.excessOver20000.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.netWageToReport.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                {kt20kData?.annual ? (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/30 font-medium">
                      <td className="p-2">Annual</td>
                      <td className="p-2 text-right">{kt20kData.annual.employeeCountPeak.toLocaleString()}</td>
                      <td className="p-2 text-right">{kt20kData.annual.salaryAmount.toLocaleString()}</td>
                      <td className="p-2 text-right">{kt20kData.annual.dailyWageAmount.toLocaleString()}</td>
                      <td className="p-2 text-right">{kt20kData.annual.otherCompAmount.toLocaleString()}</td>
                      <td className="p-2 text-right">{kt20kData.annual.totalWage.toLocaleString()}</td>
                      <td className="p-2 text-right">{kt20kData.annual.excessOver20000.toLocaleString()}</td>
                      <td className="p-2 text-right">{kt20kData.annual.netWageToReport.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
              {kt20kData?.warnings?.length ? (
                <div className="mt-3 rounded-md border border-dashed border-border/70 bg-muted/15 p-2 text-xs space-y-1">
                  {kt20kData.warnings.map((w, idx) => (
                    <div key={idx} className="text-muted-foreground">
                      - {w}
                    </div>
                  ))}
                </div>
              ) : null}
              {!kt20kLoading && !kt20kData ? (
                <div className="p-6 text-center text-muted-foreground text-xs">
                  {lang === "th" ? "ยังไม่มีข้อมูล" : lang === "en" ? "No data" : "데이터가 없습니다."}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className={cn(tabsContentClass, "space-y-3")}>
          <div className="text-[11px] text-muted-foreground">
            권한: 작성(todo/in_progress)은 작성권한, 검토/완료(review/done)는 확정권한이 필요합니다.
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            {!externalFiling ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
                <Input
                  type="month"
                  className="h-9 w-[160px]"
                  value={taxMonth}
                  onChange={(e) => setTaxMonth(e.target.value)}
                />
              </div>
            ) : null}
            {isOffice && !externalFiling ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                <Select value={storeTb} onValueChange={setStoreTb}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {storeOptionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void loadWorkflow()
                void loadWorkflowReminders()
              }}
              disabled={loading}
            >
              {t("search")}
            </Button>
          </div>
          {workflowFallbackUsed ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              워크플로 기간키 컬럼이 DB에 아직 적용되지 않아 fallback 모드로 조회/저장 중입니다.
              `tax_filing_period_key.sql` 또는 통합 one-shot 마이그레이션 적용을 권장합니다.
            </div>
          ) : null}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">방콕시간 신고 캘린더/리마인더</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="text-muted-foreground">
                미완료 항목 기준으로 기한 임박/지연을 자동 표시합니다. (기준월 {taxMonth}, 매장 {storeTb})
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700">
                  긴급 {Number(workflowReminderSummary?.critical || 0).toLocaleString()}
                </span>
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700">
                  주의 {Number(workflowReminderSummary?.warn || 0).toLocaleString()}
                </span>
                <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-700">
                  참고 {Number(workflowReminderSummary?.info || 0).toLocaleString()}
                </span>
              </div>
              {workflowReminderRows.length ? (
                <div className="rounded border border-border/60 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-1.5">심각도</th>
                        <th className="text-left p-1.5">신고</th>
                        <th className="text-left p-1.5">대상월</th>
                        <th className="text-left p-1.5">기한(방콕)</th>
                        <th className="text-left p-1.5">현재상태</th>
                        <th className="text-left p-1.5">메시지</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workflowReminderRows.map((r, idx) => (
                        <tr key={`${r.filingType}-${r.yearMonth}-${idx}`} className="border-b border-border/40">
                          <td className="p-1.5">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5",
                                r.severity === "critical"
                                  ? "bg-rose-100 text-rose-700"
                                  : r.severity === "warn"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-700"
                              )}
                            >
                              {r.severity === "critical" ? "긴급" : r.severity === "warn" ? "주의" : "참고"}
                            </span>
                          </td>
                          <td className="p-1.5">{r.filingLabelKo}</td>
                          <td className="p-1.5">{r.yearMonth}</td>
                          <td className="p-1.5">{r.dueDateBangkok}</td>
                          <td className="p-1.5">{workflowStatusLabel(r.status)}</td>
                          <td className="p-1.5 text-muted-foreground">{r.messageKo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-muted-foreground">현재 임박/지연 리마인더가 없습니다.</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{t("accCompColFiling")}</th>
                    <th className="text-left p-2">{t("accCompColStatus")}</th>
                    <th className="text-right p-2">{t("accCompColAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {THAI_FILING_DEFINITIONS.map((d) => {
                    const row = workflowRows.find((r) => r.filing_type === d.id)
                    const status = row?.status || "todo"
                    return (
                      <tr key={d.id} className="border-b border-border/50">
                        <td className="p-2">{lang === "th" ? d.labelTh : lang === "ko" ? d.labelKo : d.labelEn}</td>
                        <td className="p-2">{workflowStatusLabel(status)}</td>
                        <td className="p-2 text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void upsertWorkflowStatus(d.id, "in_progress")}
                              disabled={!canWriteCompliance}
                            >
                              {t("accCompWorkflowStart")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void upsertWorkflowStatus(d.id, "review")}
                              disabled={!canApproveCompliance}
                            >
                              {t("accCompWorkflowReview")}
                            </Button>
                            <Button type="button" size="sm" onClick={() => void upsertWorkflowStatus(d.id, "done")} disabled={!canApproveCompliance}>
                              {t("accCompWorkflowDone")}
                            </Button>
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
