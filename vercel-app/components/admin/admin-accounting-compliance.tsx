"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  adminTabsContentCn,
  adminTabsContentEmbeddedCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsRootEmbeddedCn,
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
import { Landmark, ExternalLink, Save, Plus, Trash2, Download, CalendarClock, ChevronDown, Printer } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
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
  getAccountingPeriodCloseStatus,
  setAccountingPeriodClosed,
  getTrialBalance,
  getAccountingReconciliation,
  getVatLedger,
  getStoreTaxFilingProfile,
  getStoreTaxFilingProfiles,
  getAdminVendors,
  getVatLedgerStoreNameGaps,
  getIntercompanyVatReconcile,
  probeIntercompanyVatReconcileApplicable,
  type IntercompanyVatReconcileReportDto,
  type VatLedgerStoreNameGapsReportDto,
  saveVatLedgerEntry,
  deleteVatLedgerEntry,
  getWithholdingTaxLedger,
  saveWithholdingTaxLedgerEntry,
  deleteWithholdingTaxLedgerEntry,
  getPp36Ledger,
  savePp36LedgerEntry,
  deletePp36LedgerEntry,
  getPnd54Ledger,
  savePnd54LedgerEntry,
  deletePnd54LedgerEntry,
  getExportVatLedgerCsvUrl,
  getExportWithholdingTaxLedgerCsvUrl,
  getExportPp36LedgerCsvUrl,
  getExportPnd54LedgerCsvUrl,
  getExportPnd1RdPrepTxtUrl,
  validatePnd1RdPrep,
  validatePnd3Pnd53,
  saveCorporateTaxAdjustments,
  getPayrollWhtTinGaps,
  type ValidatePnd1RdPrepResult,
  type ValidatePnd3Pnd53Result,
  getHeadOfficeInfo,
  type PayrollWhtTinGapResult,
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
  syncPayrollSsoExpenseAccruals,
  uploadEtaxEvidenceFile,
  getExportEtaxTimestampAuditCsvUrl,
} from "@/lib/api-client"
import {
  isAccountingRole,
  isOfficeRole,
  isManagerOrFranchiseeRole,
  isOfficeStore,
} from "@/lib/permissions"
import { isHeadOfficeLikeStoreName } from "@/lib/internal-outbound"
import {
  aliasKeysForStore,
  countStoresMissingVendorLink,
  countWhtPayeeTinGaps,
  evaluateStoreTaxLink,
  isThaiTaxId13,
  type VendorTaxLinkInput,
} from "@/lib/store-vendor-tax-link"
import { StoreVendorTaxLinkBanner } from "@/components/admin/tax-filing/store-vendor-tax-link-banner"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import { appAlert, appConfirm } from "@/lib/app-message"
import { openWhtCertificatePrintWindow } from "@/lib/open-wht-certificate-print"
import { whtCertificateFromLedgerRow, type HeadOfficeCompany } from "@/lib/wht-certificate-data"
import {
  downloadThaiSsoSps110FromPayrollXlsx,
  type Sps110EmployerInfo,
} from "@/lib/thai-sso-sps1-10-export"
import {
  downloadThaiSsoEserviceBulkFromPayrollXlsx,
  SSO_ESERVICE_BULK_COLUMN_HELP,
} from "@/lib/thai-sso-eservice-bulk-export"
import { type SsoFilingWageMode } from "@/lib/payroll-utils"
import { consolidatePosOutputRowsForTaxExport, isPosAutoVatOutputRow } from "@/lib/vat-ledger-pos"
import type { VatLedgerRow } from "@/lib/vat-ledger-csv"
import {
  buildCorporateTaxPdfHtml,
  exportCorporateTaxPdf,
  validateCorporateTaxForPdf,
} from "@/lib/corporate-tax-pdf"

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
  invoice_evidence_status: "required_pending" | "received" | "not_required" | "unobtainable"
  invoice_evidence_reason_code: string
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
  direction: "inbound" | "outbound"
  source_type: string
}

type Pp36Draft = {
  id?: number
  doc_date: string
  tax_month: string
  supplier_name: string
  supplier_country: string
  supplier_tax_id: string
  service_desc: string
  taxable_amount: string
  vat_rate: string
  vat_amount: string
  filing_status: "draft" | "submitted"
  submitted_at: string
  submitted_by: string
  memo: string
  store_name: string
}

type Pnd54Draft = {
  id?: number
  payment_date: string
  tax_month: string
  payee_name: string
  payee_country: string
  payee_tax_id: string
  income_type: string
  gross_amount: string
  wht_rate: string
  wht_amount: string
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
const PP30_FETCH_TIMEOUT_MS = 120000

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
    invoice_evidence_status: "required_pending",
    invoice_evidence_reason_code: "",
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
    direction: "outbound",
    source_type: "manual",
  }
}

function emptyPp36(taxMonth: string, defaultStoreName: string): Pp36Draft {
  return {
    doc_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    supplier_name: "",
    supplier_country: "",
    supplier_tax_id: "",
    service_desc: "",
    taxable_amount: "",
    vat_rate: "7",
    vat_amount: "",
    filing_status: "draft",
    submitted_at: "",
    submitted_by: "",
    memo: "",
    store_name: defaultStoreName,
  }
}

function emptyPnd54(taxMonth: string, defaultStoreName: string): Pnd54Draft {
  return {
    payment_date: `${taxMonth}-01`,
    tax_month: taxMonth,
    payee_name: "",
    payee_country: "",
    payee_tax_id: "",
    income_type: "",
    gross_amount: "",
    wht_rate: "",
    wht_amount: "",
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

async function withClientTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CLIENT_TIMEOUT")), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
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
  initialPp30SubView?: "output" | "input" | "settlement" | "wht"
  /** PP30 영역 표시 모드: all(통합) / vat_only(매출·매입만) / wht_only(원천만) */
  pp30Mode?: "all" | "vat_only" | "wht_only"
  /** 원천징수 영역 포커스 모드: all(전체) / pnd1391 / pnd5354 / pp36 */
  whtFocusMode?: "all" | "pnd1391" | "pnd5354" | "pp36"
  /** 원천징수 제출형 기본값 */
  initialWhtSubmissionFormHint?: "PND3" | "PND53" | "ALL"
  /** 세무 신고 셸과 동기화 시 본문의 중복 년·매장 입력 숨김 */
  filingYearMonth?: string
  onFilingYearMonthChange?: (v: string) => void
  filingStoreFilter?: string
  onFilingStoreFilterChange?: (v: string) => void
  /** PP30 화면에서 매장 납세자 정보 탭으로 이동 */
  onOpenStoreProfiles?: () => void
  /** 세무 신고 셸 SSO·PP30 필터 카드 검색 버튼 틱 */
  filingSearchTick?: number
  /** 세무 신고 셸 PP30 검색 시 PP36 등 하위 섹션 동기 조회 */
  onFilingSearch?: () => void
  /** P.P30/P.P36 탭 하단 PP36 임베드 전용 — P.N.D 탭 등 다른 wht_only 화면과 구분 */
  embeddedPp36Section?: boolean
}

export function AdminAccountingCompliance({
  initialTab = "scope",
  hideTabBar = false,
  initialPp30SubView = "output",
  pp30Mode = "all",
  whtFocusMode = "all",
  initialWhtSubmissionFormHint = "ALL",
  filingYearMonth,
  onFilingYearMonthChange,
  filingStoreFilter,
  onFilingStoreFilterChange,
  onOpenStoreProfiles,
  filingSearchTick,
  onFilingSearch,
  embeddedPp36Section = false,
}: AdminAccountingComplianceProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const role = auth?.role || ""
  const canUse = canManageAccountingCompliance(role, auth?.store)
  const canWriteCompliance = canWriteAccountingCompliance(role)
  const canApproveCompliance = canApproveAccountingCompliance(role)
  const canApproveUnlock = canApproveAccountingPeriodUnlock(role)
  const { stores: storeList, resolveStoreKey, storeLabels, legacyToCanonical, formatStoreLabel } = useStoreList()
  const managerStore = (auth?.store || "").trim()
  const hqUserByStore = isOfficeStore(managerStore) || isHeadOfficeLikeStoreName(managerStore)
  /** 본사·회계만 전 매장; 매장 매니저·가맹은 소속 매장만(본사 store 문자열이어도 역할이 매장이면 전체 조회 불가) */
  const isOffice =
    isOfficeRole(role) ||
    isAccountingRole(role) ||
    (hqUserByStore && !isManagerOrFranchiseeRole(role))
  const isManager = !isOffice && isManagerOrFranchiseeRole(role)
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

  const externalFiling =
    filingYearMonth !== undefined &&
    onFilingYearMonthChange !== undefined &&
    filingStoreFilter !== undefined &&
    onFilingStoreFilterChange !== undefined
  /** P.P30/P.P36 탭 하단 PP36 블록만: 중복 필터·PP36 제목·PP30 검색 연동 */
  const isEmbeddedPp36Section = embeddedPp36Section === true

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

  /** POS·원장 API storeFilter — 사용자 선택값 그대로(서버에서 erp_stores로 해석) */
  const storeFilterForApi = React.useMemo(() => {
    const s = String(storeTb ?? "").trim()
    if (!s || s === "All" || s === "*") return "All"
    return s
  }, [storeTb])
  /** 프로필·UI용 canonical store_code */
  const storeFilterForLedger = React.useMemo(() => {
    if (storeFilterForApi === "All") return "All"
    const r = String(resolveStoreKey(storeFilterForApi) ?? "").trim()
    return r || storeFilterForApi
  }, [storeFilterForApi, resolveStoreKey])
  const isHeadOfficeLedgerStore = React.useMemo(() => {
    if (storeFilterForLedger === "All") return false
    return isOfficeStore(storeFilterForLedger) || isHeadOfficeLikeStoreName(storeFilterForLedger)
  }, [storeFilterForLedger])

  const [taxLinkVendors, setTaxLinkVendors] = React.useState<VendorTaxLinkInput[]>([])
  const [taxLinkProfilesByStore, setTaxLinkProfilesByStore] = React.useState<
    Record<string, { storeCode: string; vendorCode?: string; taxpayerName?: string; taxId?: string }>
  >({})
  const [taxLinkMetaLoading, setTaxLinkMetaLoading] = React.useState(false)

  const franchiseStoreCodes = React.useMemo(
    () =>
      (storeList || [])
        .map((s) => String(s).trim())
        .filter((s) => s && s !== "All" && !isHeadOfficeLikeStoreName(s) && !isOfficeStore(s)),
    [storeList]
  )

  const needsTaxLinkMeta = tab === "summary" || tab === "cit"

  React.useEffect(() => {
    if (!canUse || !needsTaxLinkMeta) return
    let cancelled = false
    setTaxLinkMetaLoading(true)
    Promise.all([getAdminVendors(), getStoreTaxFilingProfiles()])
      .then(([vendorRows, profRes]) => {
        if (cancelled) return
        setTaxLinkVendors(
          (vendorRows || []).map((v) => ({
            code: v.code,
            name: v.name,
            tax_no: v.tax_no,
            gps_name: v.gps_name,
            sales_outlet: v.sales_outlet,
          }))
        )
        const map: Record<string, { storeCode: string; vendorCode?: string; taxpayerName?: string; taxId?: string }> =
          {}
        for (const p of profRes.profiles || []) {
          const sc = String(p.storeCode || "").trim()
          if (!sc) continue
          map[sc] = {
            storeCode: sc,
            vendorCode: p.vendorCode,
            taxpayerName: p.taxpayerName,
            taxId: p.taxId,
          }
        }
        setTaxLinkProfilesByStore(map)
      })
      .catch(() => {
        if (cancelled) return
        setTaxLinkVendors([])
        setTaxLinkProfilesByStore({})
      })
      .finally(() => {
        if (!cancelled) setTaxLinkMetaLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [canUse, needsTaxLinkMeta])

  const pp30StoreLinkEval = React.useMemo(() => {
    if (storeFilterForLedger === "All") return null
    const extras = aliasKeysForStore(storeFilterForLedger, storeLabels, legacyToCanonical)
    return evaluateStoreTaxLink(storeFilterForLedger, taxLinkProfilesByStore[storeFilterForLedger], taxLinkVendors, extras)
  }, [storeFilterForLedger, taxLinkProfilesByStore, taxLinkVendors, storeLabels, legacyToCanonical])

  const pp30VendorLinkCounts = React.useMemo(
    () =>
      countStoresMissingVendorLink(
        franchiseStoreCodes,
        taxLinkProfilesByStore,
        taxLinkVendors,
        storeLabels,
        legacyToCanonical
      ),
    [franchiseStoreCodes, taxLinkProfilesByStore, taxLinkVendors, storeLabels, legacyToCanonical]
  )

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
  const [pp36Rows, setPp36Rows] = React.useState<Pp36Draft[]>([])
  const [pnd54Rows, setPnd54Rows] = React.useState<Pnd54Draft[]>([])
  const [periodType, setPeriodType] = React.useState<"monthly" | "half_year" | "annual">("monthly")
  const [ledgerStatusFilter, setLedgerStatusFilter] = React.useState<"all" | "draft" | "submitted">("all")
  /** 법인세 연간: API는 yearMonth의 연도만 사용 — UI는 연도만 고름 */
  const [citFiscalYear, setCitFiscalYear] = React.useState(() => Number(ymNow().slice(0, 4)))
  /** 부가세(ภ.พ.30) 탭: 매출/매입/정산/원천 조회 */
  const [pp30SubView, setPp30SubView] = React.useState<"output" | "input" | "settlement" | "wht">(initialPp30SubView)
  const [vatOutputViewMode, setVatOutputViewMode] = React.useState<"vendor" | "detail">("vendor")
  const [vatInputViewMode, setVatInputViewMode] = React.useState<"vendor" | "detail">("vendor")
  const allowedPp30Views = React.useMemo<("output" | "input" | "settlement" | "wht")[]>(() => {
    if (pp30Mode === "vat_only") return ["output", "input", "settlement"]
    if (pp30Mode === "wht_only") return ["wht"]
    return ["output", "input", "settlement", "wht"]
  }, [pp30Mode])
  const canShowVatSettlement = React.useMemo(
    () => allowedPp30Views.includes("output") && allowedPp30Views.includes("input"),
    [allowedPp30Views]
  )
  const [taxSummary, setTaxSummary] = React.useState<ThaiTaxFilingSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = React.useState(false)
  /** 부가세(PP30) 요약 탭: 조건 변경 시 초기화, 검색 후에만 API 조회 */
  const [pp30Queried, setPp30Queried] = React.useState(false)
  const [pp30SearchSeq, setPp30SearchSeq] = React.useState(0)
  const [pp30XlsxExporting, setPp30XlsxExporting] = React.useState(false)
  const pp30FilterBootRef = React.useRef(true)
  const vatLoadSeqRef = React.useRef(0)
  const whtLoadSeqRef = React.useRef(0)
  const taxSummaryLoadSeqRef = React.useRef(0)
  const [citData, setCitData] = React.useState<CorporateTaxComputationData | null>(null)
  const [citPdfExporting, setCitPdfExporting] = React.useState(false)
  const [citPdfHint, setCitPdfHint] = React.useState<string | null>(null)
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
  /** SSO 탭: 조건 변경 시 초기화, 검색 후에만 급여·요약 표시 */
  const [ssoQueried, setSsoQueried] = React.useState(false)
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
  const [ssoAccountingSyncing, setSsoAccountingSyncing] = React.useState(false)
  const [ssoFilingWageMode, setSsoFilingWageMode] = React.useState<SsoFilingWageMode>("contributable")
  const [ssoWorkflowRow, setSsoWorkflowRow] = React.useState<AccountingWorkflowStatusRow | null>(null)
  const [pnd1PayerTaxId, setPnd1PayerTaxId] = React.useState("")
  const [pnd1PayerBranchNo, setPnd1PayerBranchNo] = React.useState("00000")
  const [pnd1PayerName, setPnd1PayerName] = React.useState("")
  const [pnd1IncludeHeader, setPnd1IncludeHeader] = React.useState(false)
  const [pnd1FormMode, setPnd1FormMode] = React.useState<"auto" | "pnd1" | "pnd1a" | "all">("auto")
  const [pnd1Validating, setPnd1Validating] = React.useState(false)
  const [pnd1ValidationResult, setPnd1ValidationResult] = React.useState<ValidatePnd1RdPrepResult | null>(null)
  const [pnd353Validating, setPnd353Validating] = React.useState(false)
  const [pnd353ValidationResult, setPnd353ValidationResult] = React.useState<ValidatePnd3Pnd53Result | null>(null)
  const [whtSubmissionFormHint, setWhtSubmissionFormHint] = React.useState<"PND3" | "PND53" | "ALL">(
    initialWhtSubmissionFormHint
  )
  const showPnd1Area = whtFocusMode === "all" || whtFocusMode === "pnd1391"
  const showPnd353Tools = whtFocusMode !== "pp36"
  const showPp36Ledger = whtFocusMode === "all" || whtFocusMode === "pp36"
  const showPnd54Ledger = whtFocusMode === "all" || whtFocusMode === "pnd5354"
  const showWhtLedger = whtFocusMode !== "pp36"
  const [pnd1IssueFilterCodes, setPnd1IssueFilterCodes] = React.useState<Pnd1IssueCode[]>([])
  const [payrollTinGapLoading, setPayrollTinGapLoading] = React.useState(false)
  const [payrollTinGapResult, setPayrollTinGapResult] = React.useState<PayrollWhtTinGapResult | null>(null)
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
  const [pp30OpsOpen, setPp30OpsOpen] = React.useState(false)
  const [pp30PeriodClose, setPp30PeriodClose] = React.useState<{
    isClosed: boolean
    closedViaAll: boolean
    storeScope: string
  } | null>(null)
  const [pp30PeriodCloseLoading, setPp30PeriodCloseLoading] = React.useState(false)
  const [vatStoreNameGaps, setVatStoreNameGaps] = React.useState<VatLedgerStoreNameGapsReportDto | null>(null)
  const [vatStoreNameGapsLoading, setVatStoreNameGapsLoading] = React.useState(false)
  const [intercompanyVatRecon, setIntercompanyVatRecon] = React.useState<IntercompanyVatReconcileReportDto | null>(null)
  const [intercompanyVatReconLoading, setIntercompanyVatReconLoading] = React.useState(false)
  const [hqSupplyReconcileApplicable, setHqSupplyReconcileApplicable] = React.useState<boolean | null>(null)
  const [hqSupplyProbeLoading, setHqSupplyProbeLoading] = React.useState(false)
  const [citAdjustmentsDraft, setCitAdjustmentsDraft] = React.useState<
    { adjustmentType: "add_back" | "deduction"; itemName: string; amount: string; memo: string }[]
  >([])
  const citPdfValidation = React.useMemo(() => validateCorporateTaxForPdf(citData), [citData])

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
    if (!isOffice) return isManager ? scopedStoreChoices : []
    const uniq = Array.from(
      new Set((storeList || []).map((s) => String(s).trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
    return ["All", ...uniq]
  }, [isOffice, isManager, scopedStoreChoices, storeList])

  React.useEffect(() => {
    if (externalFiling) return
    if (isManager && scopedStoreChoices[0]) setInternalStoreTb(scopedStoreChoices[0])
  }, [externalFiling, isManager, scopedStoreChoices])

  React.useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  React.useEffect(() => {
    setPp30SubView(initialPp30SubView)
  }, [initialPp30SubView])
  React.useEffect(() => {
    setWhtSubmissionFormHint(initialWhtSubmissionFormHint)
  }, [initialWhtSubmissionFormHint])

  React.useEffect(() => {
    if (allowedPp30Views.includes(pp30SubView)) return
    setPp30SubView(allowedPp30Views[0] || "output")
  }, [allowedPp30Views, pp30SubView])

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
      const data = await getAccountingPeriods({
        userRole: role,
        storeFilter: storeTb && storeTb !== "All" ? storeTb : undefined,
      })
      setPeriods(data.periods || [])
    } catch {
      setPeriods([])
    }
  }, [canUse, role, storeTb])

  const loadPp30PeriodClose = React.useCallback(async () => {
    if (!canUse || storeFilterForLedger === "All") {
      setPp30PeriodClose(null)
      return
    }
    setPp30PeriodCloseLoading(true)
    try {
      const data = await getAccountingPeriodCloseStatus({
        userRole: role,
        yearMonth: taxMonth,
        storeFilter: storeFilterForApi,
      })
      if (data.snapshot) {
        setPp30PeriodClose({
          isClosed: data.snapshot.isClosed,
          closedViaAll: data.snapshot.closedViaAll,
          storeScope: data.snapshot.storeScope,
        })
      } else {
        setPp30PeriodClose(null)
      }
    } catch {
      setPp30PeriodClose(null)
    } finally {
      setPp30PeriodCloseLoading(false)
    }
  }, [canUse, role, taxMonth, storeFilterForLedger])

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
        invoice_evidence_status:
          r.invoice_evidence_status === "received" ||
          r.invoice_evidence_status === "not_required" ||
          r.invoice_evidence_status === "unobtainable"
            ? (r.invoice_evidence_status as "received" | "not_required" | "unobtainable")
            : "required_pending",
        invoice_evidence_reason_code: String(r.invoice_evidence_reason_code || ""),
        filing_status: normalizeLedgerFilingStatus(r.filing_status),
        submitted_at: String(r.submitted_at || ""),
        submitted_by: String(r.submitted_by || ""),
        memo: String(r.memo || ""),
        store_name: String(r.store_name || ""),
      })),
    [taxMonth]
  )

  const loadVatStoreNameGaps = React.useCallback(async () => {
    if (!canUse) return
    setVatStoreNameGapsLoading(true)
    try {
      const { report, error } = await getVatLedgerStoreNameGaps({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeFilterForApi,
      })
      if (error) {
        setVatStoreNameGaps(null)
        return
      }
      setVatStoreNameGaps(report)
    } catch {
      setVatStoreNameGaps(null)
    } finally {
      setVatStoreNameGapsLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeFilterForApi])

  const probeHqSupplyReconcile = React.useCallback(async () => {
    if (!canUse || storeFilterForLedger === "All" || isHeadOfficeLedgerStore) {
      setHqSupplyReconcileApplicable(false)
      setIntercompanyVatRecon(null)
      return
    }
    setHqSupplyProbeLoading(true)
    try {
      const { applicable } = await probeIntercompanyVatReconcileApplicable({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeFilterForApi,
      })
      setHqSupplyReconcileApplicable(applicable)
      if (!applicable) setIntercompanyVatRecon(null)
    } catch {
      setHqSupplyReconcileApplicable(false)
      setIntercompanyVatRecon(null)
    } finally {
      setHqSupplyProbeLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeFilterForLedger, isHeadOfficeLedgerStore])

  const loadIntercompanyVatRecon = React.useCallback(async () => {
    if (!canUse || storeFilterForLedger === "All" || hqSupplyReconcileApplicable !== true) {
      setIntercompanyVatRecon(null)
      return
    }
    setIntercompanyVatReconLoading(true)
    try {
      const { report, error } = await getIntercompanyVatReconcile({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeFilterForApi,
      })
      if (error) {
        setIntercompanyVatRecon(null)
        return
      }
      setIntercompanyVatRecon(report)
    } catch {
      setIntercompanyVatRecon(null)
    } finally {
      setIntercompanyVatReconLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeFilterForLedger, hqSupplyReconcileApplicable])

  React.useEffect(() => {
    void probeHqSupplyReconcile()
  }, [probeHqSupplyReconcile])

  React.useEffect(() => {
    if (!pp30Queried || tab !== "summary") return
    if (hqSupplyReconcileApplicable === true) void loadIntercompanyVatRecon()
    else if (hqSupplyReconcileApplicable === false) setIntercompanyVatRecon(null)
  }, [pp30Queried, tab, hqSupplyReconcileApplicable, loadIntercompanyVatRecon])

  const loadVat = React.useCallback(async () => {
    if (!canUse) return
    const seq = ++vatLoadSeqRef.current
    setLoading(true)
    try {
      const data = await withClientTimeout(
        getVatLedger({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
        }),
        PP30_FETCH_TIMEOUT_MS
      )
      if (seq !== vatLoadSeqRef.current) {
        return
      }
      if (data.error) appAlert(t("accCompLoadFail"))
      setVatRows(mapVat(data.entries || []))
      if (seq === vatLoadSeqRef.current) {
        void loadVatStoreNameGaps()
      }
    } catch {
      if (seq !== vatLoadSeqRef.current) {
        return
      }
      setVatRows([])
      appAlert(t("accCompLoadFail"))
    } finally {
      if (seq === vatLoadSeqRef.current) setLoading(false)
    }
  }, [
    canUse,
    role,
    taxMonth,
    periodType,
    ledgerStatusFilter,
    storeFilterForApi,
    mapVat,
    loadVatStoreNameGaps,
    t,
  ])

  React.useEffect(() => {
    if (tab !== "summary") return
    void loadPp30PeriodClose()
  }, [tab, taxMonth, storeFilterForLedger, loadPp30PeriodClose])

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
        direction: String(r.direction || "").toLowerCase() === "inbound" ? "inbound" : "outbound",
        source_type: String(r.source_type || ""),
      })),
    [taxMonth]
  )

  const mapPp36 = React.useCallback(
    (entries: Record<string, unknown>[]): Pp36Draft[] =>
      entries.map((r) => ({
        id: r.id != null ? Number(r.id) : undefined,
        doc_date: String(r.doc_date || "").slice(0, 10),
        tax_month: String(r.tax_month || taxMonth).slice(0, 7),
        supplier_name: String(r.supplier_name || ""),
        supplier_country: String(r.supplier_country || ""),
        supplier_tax_id: String(r.supplier_tax_id || ""),
        service_desc: String(r.service_desc || ""),
        taxable_amount: String(r.taxable_amount ?? ""),
        vat_rate: String(r.vat_rate ?? "7"),
        vat_amount: String(r.vat_amount ?? ""),
        filing_status: normalizeLedgerFilingStatus(r.filing_status),
        submitted_at: String(r.submitted_at || ""),
        submitted_by: String(r.submitted_by || ""),
        memo: String(r.memo || ""),
        store_name: String(r.store_name || ""),
      })),
    [taxMonth]
  )

  const mapPnd54 = React.useCallback(
    (entries: Record<string, unknown>[]): Pnd54Draft[] =>
      entries.map((r) => ({
        id: r.id != null ? Number(r.id) : undefined,
        payment_date: String(r.payment_date || "").slice(0, 10),
        tax_month: String(r.tax_month || taxMonth).slice(0, 7),
        payee_name: String(r.payee_name || ""),
        payee_country: String(r.payee_country || ""),
        payee_tax_id: String(r.payee_tax_id || ""),
        income_type: String(r.income_type || ""),
        gross_amount: String(r.gross_amount ?? ""),
        wht_rate: String(r.wht_rate ?? ""),
        wht_amount: String(r.wht_amount ?? ""),
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
    const seq = ++whtLoadSeqRef.current
    setLoading(true)
    try {
      const data = await withClientTimeout(
        getWithholdingTaxLedger({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
        }),
        PP30_FETCH_TIMEOUT_MS
      )
      if (seq !== whtLoadSeqRef.current) {
        return
      }
      setWhtRows(mapWht(data.entries || []))
    } catch {
      if (seq !== whtLoadSeqRef.current) {
        return
      }
      setWhtRows([])
    } finally {
      if (seq === whtLoadSeqRef.current) setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForApi, mapWht])

  const loadPp36 = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await withClientTimeout(
        getPp36Ledger({
          userRole: role,
          taxMonth,
          yearMonth: taxMonth,
          periodType,
          filingStatus: ledgerStatusFilter,
          storeFilter: storeFilterForApi,
        }),
        PP30_FETCH_TIMEOUT_MS
      )
      setPp36Rows(mapPp36(data.entries || []))
    } catch {
      setPp36Rows([])
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForApi, mapPp36])

  const loadPnd54 = React.useCallback(async () => {
    if (!canUse) return
    setLoading(true)
    try {
      const data = await withClientTimeout(
        getPnd54Ledger({
          userRole: role,
          taxMonth,
          yearMonth: taxMonth,
          periodType,
          filingStatus: ledgerStatusFilter,
          storeFilter: storeFilterForApi,
        }),
        PP30_FETCH_TIMEOUT_MS
      )
      setPnd54Rows(mapPnd54(data.entries || []))
    } catch {
      setPnd54Rows([])
    } finally {
      setLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForApi, mapPnd54])

  const loadTaxSummary = React.useCallback(async () => {
    if (!canUse) return
    const seq = ++taxSummaryLoadSeqRef.current
    setSummaryLoading(true)
    try {
      const data = await withClientTimeout(
        getThaiTaxFilingSummary({
        userRole: role,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeFilterForApi,
        }),
        PP30_FETCH_TIMEOUT_MS
      )
      if (seq !== taxSummaryLoadSeqRef.current) {
        return
      }
      setTaxSummary(data)
    } catch {
      if (seq !== taxSummaryLoadSeqRef.current) {
        return
      }
      setTaxSummary(null)
    } finally {
      if (seq === taxSummaryLoadSeqRef.current) setSummaryLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeFilterForApi])

  const loadVatRef = React.useRef(loadVat)
  const loadWhtRef = React.useRef(loadWht)
  const loadPp36Ref = React.useRef(loadPp36)
  const loadPnd54Ref = React.useRef(loadPnd54)
  const loadTaxSummaryRef = React.useRef(loadTaxSummary)
  loadVatRef.current = loadVat
  loadWhtRef.current = loadWht
  loadPp36Ref.current = loadPp36
  loadPnd54Ref.current = loadPnd54
  loadTaxSummaryRef.current = loadTaxSummary

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
      setCitPdfHint(null)
      setCitAdjustmentsDraft(
        (data.adjustments || []).map((x) => ({
          adjustmentType: x.type,
          itemName: String(x.itemName || ""),
          amount: String(x.amount ?? ""),
          memo: String(x.memo || ""),
        }))
      )
    } catch {
      setCitData(null)
      setCitAdjustmentsDraft([])
    } finally {
      setLoading(false)
    }
  }, [canUse, role, citYearMonthForApi, periodType, storeTb, auth?.store])

  const resolveCitPdfCodeLabel = React.useCallback(
    (prefix: "accCompCitPdfErr_" | "accCompCitPdfWarn_", code: string) => {
      const key = `${prefix}${String(code || "").toLowerCase()}`
      const translated = t(key)
      return translated === key ? code : translated
    },
    [t]
  )

  const exportCitPdf = React.useCallback(async () => {
    const validation = validateCorporateTaxForPdf(citData)
    if (!validation.isValid || !citData) {
      const errText = validation.errors
        .map((c) => resolveCitPdfCodeLabel("accCompCitPdfErr_", c))
        .join(", ")
      setCitPdfHint(
        `${t("accCompCitPdfBlockedPrefix")} ${errText || t("accCompCitPdfNoData")}`
      )
      return
    }
    setCitPdfExporting(true)
    setCitPdfHint(null)
    try {
      const html = buildCorporateTaxPdfHtml({
        data: citData,
        title: t("accCompCitPdfTitle"),
        subtitle: t("accCompCitPdfSubtitle"),
        amountLabel: t("amount"),
        generatedAtLabel: t("accCompCitPdfGeneratedAt"),
        storeScopeLabel: t("accCompStore"),
        storeScopeValue: storeTb,
        periodLabel: t("accCompCitPdfPeriod"),
        filingFormLabel: t("accCompCitPdfForm"),
        accountingProfitLabel: t("accCompCitAccountingProfit"),
        taxAddBackLabel: t("accCompCitTaxAddBacks"),
        taxDeductionLabel: t("accCompCitTaxDeductions"),
        taxableIncomeLabel: t("accCompCitTaxableIncome"),
        projectedAnnualTaxableIncomeLabel: t("accCompCitProjectedAnnualTaxableIncome"),
        taxRateLabel: t("accCompCitTaxRate"),
        estimatedTaxLabel: t("accCompCitEstimated"),
        filingTaxDueLabel: t("accCompCitFilingTaxDue"),
        adjustmentsTitle: t("accCompCitAdjustmentsTitle"),
        adjustmentsTypeLabel: t("accCompCitAdjustmentsType"),
        adjustmentsItemLabel: t("accCompCitAdjustmentsItem"),
        adjustmentsAmountLabel: t("accCompCitAdjustmentsAmount"),
        adjustmentsMemoLabel: t("accCompCitAdjustmentsMemo"),
        adjustmentTypeAddBackLabel: t("accCompCitAdjustmentTypeAddBack"),
        adjustmentTypeDeductionLabel: t("accCompCitAdjustmentTypeDeduction"),
        noAdjustmentsLabel: t("accCompCitNoAdjustments"),
      })
      await exportCorporateTaxPdf({ data: citData, html })
      if (validation.warnings.length > 0) {
        const warnText = validation.warnings
          .map((c) => resolveCitPdfCodeLabel("accCompCitPdfWarn_", c))
          .join(", ")
        setCitPdfHint(`${t("accCompCitPdfWarnPrefix")} ${warnText}`)
      } else {
        setCitPdfHint(t("accCompCitPdfDone"))
      }
    } catch {
      setCitPdfHint(t("accCompCitPdfExportFailed"))
    } finally {
      setCitPdfExporting(false)
    }
  }, [citData, resolveCitPdfCodeLabel, storeTb, t])

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
        appAlert(t("accCompNoClosingApprovePermission"))
        return
      }
      if (accountingHealth) {
        const hasMismatch =
          Math.abs(Number(accountingHealth.tbDiff || 0)) > 0.0001 ||
          Math.abs(Number(accountingHealth.netDiff || 0)) > 0.0001 ||
          Math.abs(Number(accountingHealth.bsDiff || 0)) > 0.0001
        if (hasMismatch) {
          const proceed = await appConfirm(
            `${t("accCompReconcileMismatchExists")}\n` +
              `- ${t("accCompTrialBalanceDiff")}: ${Number(accountingHealth.tbDiff || 0).toLocaleString()}\n` +
              `- ${t("accCompNetIncomeDiffTbIncome")}: ${Number(accountingHealth.netDiff || 0).toLocaleString()}\n` +
              `- ${t("accCompNetIncomeDiffTbBs")}: ${Number(accountingHealth.bsDiff || 0).toLocaleString()}\n` +
              `${t("accCompConfirmRunClosingContinue")}`
          )
          if (!proceed) return
        }
      }
      if (
        !(await appConfirm(
          forceReset
            ? `${closingYearMonth} ${t("accCompConfirmRerunClosing")}\n${t("accCompConfirmRerunClosingHint")}`
            : `${closingYearMonth} ${t("accCompConfirmRunClosing")}`
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
            appAlert(t("accCompAlreadyClosedUseRerun"))
            return
          }
          if (data.error === "PERIOD_CLOSED") {
            appAlert(t("accCompPeriodLockedNeedUnlockApproval"))
            return
          }
          if (data.error === "NOTHING_TO_CLOSE") {
            appAlert(t("accCompNothingToClose"))
            return
          }
          if (data.error === "TRIAL_BALANCE_NOT_BALANCED") {
            appAlert(t("accCompTrialBalanceNotBalanced"))
            return
          }
          throw new Error(data.error || "UNKNOWN_ERROR")
        }
        appAlert(
          `${t("accCompClosingEntryCreated")}${data.autoLocked ? `\n${t("accCompPeriodAutoLocked")}` : ""}`
        )
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
      appAlert(t("accCompClosingDraftSaved"))
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
      appAlert(t("accCompInvalidYear"))
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
      appAlert(t("accCompKt20kLoadFail"))
    } finally {
      setKt20kLoading(false)
    }
  }, [canUse, kt20kYear, role, storeTb, t])

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
      appAlert(t("accCompNoWritePermission"))
      return
    }
    const y = Number(kt20kYear)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      appAlert(t("accCompInvalidYear"))
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
          appAlert(t("accCompNoWritePermission"))
          return
        }
        throw new Error(res.error || "SAVE_FAILED")
      }
      appAlert(t("accCompSaved"))
      await loadKt20kSettings()
    } catch {
      appAlert(t("msg_save_fail"))
    } finally {
      setKt20kSettingsSaving(false)
    }
  }, [canUse, canWriteCompliance, auth?.user, kt20kYear, role, kt20kEmployer, loadKt20kSettings, t])

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

  const resolveSsoEmployerHeader = React.useCallback(async (): Promise<Sps110EmployerInfo> => {
    let employer: Sps110EmployerInfo = { contributionRatePercent: "5.00" }
    const year = Number(taxMonth.slice(0, 4))
    if (Number.isFinite(year) && year >= 2000) {
      try {
        const res = await apiFetch(`/api/getKt20kSettings?year=${year}`)
        const data = (await res.json()) as {
          settings?: { companyName?: string; ssoOfficePhone?: string }
        }
        if (data.settings?.companyName) {
          employer = {
            ...employer,
            companyName: data.settings.companyName,
            phone: data.settings.ssoOfficePhone || undefined,
          }
        }
      } catch {
        /* optional KT20K header */
      }
    }
    const pickStore = externalFiling ? storeTb : ssoStoreFilter
    const effectiveStore =
      isManager && managerStore ? managerStore : pickStore && pickStore !== "All" ? pickStore : ""
    const branchLabel =
      isManager && managerStore
        ? managerStore
        : pickStore && pickStore !== "All"
          ? pickStore
          : ""
    if (branchLabel) employer = { ...employer, branchName: branchLabel }
    if (effectiveStore) {
      try {
        const { profile } = await getStoreTaxFilingProfile(effectiveStore)
        if (profile) {
          employer = {
            ...employer,
            companyName: profile.taxpayerName || employer.companyName,
            branchName: branchLabel || employer.branchName,
            ssoAccountNo: String(profile.ssoAccountNo || "").trim(),
            branchCode: String(profile.ssoBranchCode || "").trim(),
            officeAddress: String(profile.ssoOfficeAddress || profile.placeOfBusiness || "").trim(),
            postcode: String(profile.ssoPostcode || "").trim(),
            phone: String(profile.ssoPhone || employer.phone || "").trim() || undefined,
            fax: String(profile.ssoFax || "").trim(),
            email: String(profile.ssoEmail || "").trim(),
          }
        }
      } catch {
        /* keep fallback header */
      }
    }
    return employer
  }, [externalFiling, isManager, managerStore, ssoStoreFilter, storeTb, taxMonth])

  const exportEserviceBulkFromPayroll = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    setSsoPayrollExporting(true)
    try {
      const rows = ssoPayrollRows.length ? ssoPayrollRows : await fetchSsoPayrollRows()
      if (!rows || rows.length === 0) return
      const employer = await resolveSsoEmployerHeader()
      downloadThaiSsoEserviceBulkFromPayrollXlsx({
        yearMonth: taxMonth,
        payrollRows: rows,
        employer,
        filingWageMode: ssoFilingWageMode,
      })
    } finally {
      setSsoPayrollExporting(false)
    }
  }, [
    canUse,
    auth?.user,
    fetchSsoPayrollRows,
    resolveSsoEmployerHeader,
    ssoFilingWageMode,
    ssoPayrollRows,
    taxMonth,
  ])

  const exportSps110FromPayroll = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    setSsoPayrollExporting(true)
    try {
      const rows = ssoPayrollRows.length ? ssoPayrollRows : await fetchSsoPayrollRows()
      if (!rows || rows.length === 0) return
      const employer = await resolveSsoEmployerHeader()
      downloadThaiSsoSps110FromPayrollXlsx({
        yearMonth: taxMonth,
        payrollRows: rows,
        employer,
        filingWageMode: ssoFilingWageMode,
      })
    } finally {
      setSsoPayrollExporting(false)
    }
  }, [
    canUse,
    auth?.user,
    fetchSsoPayrollRows,
    resolveSsoEmployerHeader,
    ssoFilingWageMode,
    ssoPayrollRows,
    taxMonth,
  ])

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

  const runSsoSearch = React.useCallback(async () => {
    if (!canUse) return
    if (isOffice && !isManager) {
      const pick = (externalFiling ? storeTb : ssoStoreFilter) || ""
      if (!String(pick).trim() || pick === "All") {
        appAlert(t("accCompSsoPickStoreBeforeSearch"))
        return
      }
    }
    setSsoQueried(true)
    await Promise.all([fetchSsoPayrollRows(true), loadSsoWorkflowStatus()])
  }, [
    canUse,
    isOffice,
    isManager,
    externalFiling,
    storeTb,
    ssoStoreFilter,
    fetchSsoPayrollRows,
    loadSsoWorkflowStatus,
    t,
  ])

  const runSsoAccountingSync = React.useCallback(async () => {
    if (!canUse || !auth?.user) return null
    const pickStore = externalFiling ? storeTb : ssoStoreFilter
    const effectiveStore = isManager && managerStore ? managerStore : pickStore
    setSsoAccountingSyncing(true)
    try {
      const res = await syncPayrollSsoExpenseAccruals({
        yearMonth: taxMonth,
        storeFilter: effectiveStore && effectiveStore !== "All" ? effectiveStore : undefined,
        postedBy: auth.user || undefined,
      })
      if (!res.success || !res.sync) {
        appAlert(res.error || t("accCompSsoAccountingSyncFail"))
        return null
      }
      const s = res.sync
      appAlert(
        tr(t, "accCompSsoAccountingSyncDone", {
          created: String(s.created),
          updated: String(s.updated),
          stores: String(s.stores.length),
        })
      )
      return res.sync
    } catch {
      appAlert(t("accCompSsoAccountingSyncFail"))
      return null
    } finally {
      setSsoAccountingSyncing(false)
    }
  }, [
    canUse,
    auth?.user,
    externalFiling,
    isManager,
    managerStore,
    ssoStoreFilter,
    storeTb,
    t,
    taxMonth,
  ])

  const markSsoSubmissionDone = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    if (!canApproveCompliance) {
      appAlert(t("accCompNoSsoDoneApprovePermission"))
      return
    }
    const preview = ssoPayrollPreview
    if (!preview || preview.rowCount <= 0) {
      appAlert(t("accCompLoadPayrollSnapshotFirst"))
      return
    }
    setSsoSubmissionSaving(true)
    try {
      const pickStore = externalFiling ? storeTb : ssoStoreFilter
      const effectiveStoreForSync =
        isManager && managerStore ? managerStore : pickStore && pickStore !== "All" ? pickStore : undefined
      try {
        await syncPayrollSsoExpenseAccruals({
          yearMonth: taxMonth,
          storeFilter: effectiveStoreForSync,
          postedBy: auth.user || undefined,
        })
      } catch {
        /* submission still recorded; user can retry 지급예정 반영 */
      }
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
      appAlert(t("accCompSsoSubmissionRecorded"))
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
    runSsoAccountingSync,
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
            appAlert(up.message || t("accCompEvidenceUploadFail"))
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
  }, [canUse, tab, loadPeriods, storeTb])

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
    if (pp30FilterBootRef.current) {
      pp30FilterBootRef.current = false
      return
    }
    if (!pp30Queried) return
    // summary 탭 재조회는 summaryEffect가 담당한다(중복 호출 방지).
    if (tab === "summary") return
    setPp30Queried(false)
    setVatRows([])
    setWhtRows([])
    setTaxSummary(null)
  }, [
    taxMonth,
    storeFilterForApi,
    periodType,
    ledgerStatusFilter,
    pp30Queried,
    tab,
    canUse,
    pp30SubView,
    loadVat,
    loadWht,
    loadTaxSummary,
  ])

  React.useEffect(() => {
    if (!canUse || tab !== "summary" || !pp30Queried) return
    let cancelled = false
    void (async () => {
      if (pp30SubView === "wht") {
        await Promise.all([loadWhtRef.current(), loadPp36Ref.current(), loadPnd54Ref.current()])
      } else {
        await loadVatRef.current()
      }
      if (cancelled) {
        return
      }
      void loadTaxSummaryRef.current()
    })()
    return () => {
      cancelled = true
    }
  }, [
    canUse,
    tab,
    pp30Queried,
    pp30SubView,
    taxMonth,
    storeFilterForApi,
    periodType,
    ledgerStatusFilter,
    pp30SearchSeq,
  ])

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
    if (canUse && (tab === "kt20k" || tab === "cit")) void loadKt20kSettings()
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
    if (externalFiling) return
    void loadSsoWorkflowStatus()
  }, [canUse, tab, loadSsoWorkflowStatus, externalFiling])

  React.useEffect(() => {
    if (!externalFiling || filingSearchTick == null || filingSearchTick < 1) return
    void runSsoSearch()
  }, [externalFiling, filingSearchTick, runSsoSearch])

  React.useEffect(() => {
    if (!isEmbeddedPp36Section || filingSearchTick == null || filingSearchTick < 1) return
    setPp30Queried(true)
    setPp30SearchSeq((prev) => prev + 1)
  }, [isEmbeddedPp36Section, filingSearchTick])

  React.useEffect(() => {
    setPnd1ValidationResult(null)
    setPnd1IssueFilterCodes([])
  }, [taxMonth, periodType, ledgerStatusFilter, storeTb, pnd1FormMode])

  React.useEffect(() => {
    setSsoQueried(false)
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
      appAlert(t("accCompNoWritePermission"))
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
          appAlert(t("accCompNoWritePermission"))
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
        appAlert(t("accCompNoPeriodLockPermission"))
        return
      }
      if (!closed && !canApproveUnlock) {
        appAlert(t("accCompNoPeriodUnlockApprovePermission"))
        return
      }
      if (!closed) {
        if (!periodUnlockReason.trim() || periodUnlockReason.trim().length < 5 || !periodUnlockApprovedBy.trim()) {
          appAlert(t("accCompUnlockReasonAndApproverRequired"))
          return
        }
        if (
          !(await appConfirm(
            `${yearMonth} ${t("accCompConfirmUnlockPeriod")}\n${t("reason")}: ${periodUnlockReason.trim()}\n${t("accCompUnlockApprover")}: ${periodUnlockApprovedBy.trim()}`
          ))
        ) {
          return
        }
      }
      const periodStoreScope =
        tab === "summary" && storeFilterForLedger !== "All"
          ? storeFilterForLedger
          : storeTb && storeTb !== "All"
            ? storeTb
            : "All"
      const res = await setAccountingPeriodClosed({
        userRole: role,
        yearMonth,
        closed,
        storeScope: periodStoreScope,
        closedBy: auth.user,
        unlockReason: closed ? undefined : periodUnlockReason.trim(),
        unlockApprovedBy: closed ? undefined : periodUnlockApprovedBy.trim(),
      })
      if (!res.success) {
        if (res.error === "UNLOCK_APPROVAL_REQUIRED") {
          appAlert(t("accCompUnlockApprovalInfoMissing"))
          return
        }
        throw new Error(res.error || "PERIOD_UPDATE_FAILED")
      }
      await loadPeriods()
      if (tab === "summary") await loadPp30PeriodClose()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const saveVatRow = async (row: VatDraft) => {
    if (!canUse) return
    if (row.filing_status === "submitted" && !canApproveCompliance) {
      appAlert(t("accCompNoSubmitApprovePermission"))
      return
    }
    if (row.filing_status !== "submitted" && !canWriteCompliance) {
      appAlert(t("accCompNoWritePermission"))
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
        invoiceEvidenceStatus: row.invoice_evidence_status,
        invoiceEvidenceReasonCode: row.invoice_evidence_reason_code || null,
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
          appAlert(t("accCompNoSubmitApprovePermission"))
          return
        }
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert(t("accCompNoWritePermission"))
          return
        }
        if (res.error === "PERIOD_CLOSED") {
          appAlert(t("accCompPeriodClosedBlocksVat"))
          return
        }
        if (res.error === "EVIDENCE_REQUIRED_FOR_SUBMIT") {
          appAlert(t("accCompEvidenceRequiredForSubmit"))
          return
        }
        if (res.error === "EVIDENCE_PENDING_IN_MONTH") {
          const rows = Array.isArray(res.pendingEvidenceRows) ? res.pendingEvidenceRows : []
          const preview = rows
            .slice(0, 8)
            .map(
              (x, i) =>
                `${i + 1}. ${x.docDate || "-"} | ${x.storeName || "-"} | ${x.counterpartyName || "-"} | ${x.invoiceNumber || "-"}`
            )
            .join("\n")
          const more =
            Number(res.pendingEvidenceCount || rows.length) > rows.length
              ? `\n... +${Number(res.pendingEvidenceCount || 0) - rows.length}건`
              : ""
          await appAlert(
            `${t("accCompEvidencePendingInMonth")}\n\n${preview || t("accCompEvidenceRequiredForSubmit")}${more}`
          )
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
      appAlert(t("accCompNoWritePermission"))
      return
    }
    try {
      const res = await deleteVatLedgerEntry({ userRole: role, id: row.id })
      if (!res.success) {
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert(t("accCompNoWritePermission"))
          return
        }
        if (res.error === "PERIOD_CLOSED") {
          appAlert(t("accCompPeriodClosedBlocksVat"))
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
      appAlert(t("accCompNoSubmitApprovePermission"))
      return
    }
    if (row.filing_status !== "submitted" && !canWriteCompliance) {
      appAlert(t("accCompNoWritePermission"))
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
        direction: row.direction,
        sourceType: row.source_type || "manual",
        createdBy: auth?.user,
      })
      if (!res.success) {
        if (res.error === "FORBIDDEN_APPROVE") {
          appAlert(t("accCompNoSubmitApprovePermission"))
          return
        }
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert(t("accCompNoWritePermission"))
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
      appAlert(t("accCompNoWritePermission"))
      return
    }
    try {
      const res = await deleteWithholdingTaxLedgerEntry({ userRole: role, id: row.id })
      if (!res.success) {
        if (res.error === "FORBIDDEN_WRITE") {
          appAlert(t("accCompNoWritePermission"))
          return
        }
        throw new Error(res.error || "DELETE_FAILED")
      }
      await loadWht()
    } catch {
      appAlert(t("msg_delete_fail"))
    }
  }

  const savePp36Row = async (row: Pp36Draft) => {
    if (!canUse) return
    if (row.filing_status === "submitted" && !canApproveCompliance) {
      appAlert(t("accCompNoSubmitApprovePermission"))
      return
    }
    if (row.filing_status !== "submitted" && !canWriteCompliance) {
      appAlert(t("accCompNoWritePermission"))
      return
    }
    try {
      const res = await savePp36LedgerEntry({
        userRole: role,
        id: row.id,
        docDate: row.doc_date,
        taxMonth: row.tax_month,
        supplierName: row.supplier_name || null,
        supplierCountry: row.supplier_country || null,
        supplierTaxId: row.supplier_tax_id || null,
        serviceDesc: row.service_desc || null,
        taxableAmount: Number(row.taxable_amount) || 0,
        vatRate: Number(row.vat_rate) || 7,
        vatAmount: Number(row.vat_amount) || 0,
        filingStatus: row.filing_status,
        submittedAt: row.submitted_at || null,
        submittedBy: row.submitted_by || null,
        memo: row.memo || null,
        storeName: row.store_name?.trim() ? row.store_name.trim() : null,
        createdBy: auth?.user,
      })
      if (!res.success) throw new Error(res.error || "SAVE_FAILED")
      await loadPp36()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const removePp36 = async (row: Pp36Draft) => {
    if (!row.id) {
      setPp36Rows((prev) => prev.filter((r) => r !== row))
      return
    }
    if (!canUse || !canWriteCompliance) return
    try {
      const res = await deletePp36LedgerEntry({ userRole: role, id: row.id })
      if (!res.success) throw new Error(res.error || "DELETE_FAILED")
      await loadPp36()
    } catch {
      appAlert(t("msg_delete_fail"))
    }
  }

  const savePnd54Row = async (row: Pnd54Draft) => {
    if (!canUse) return
    if (row.filing_status === "submitted" && !canApproveCompliance) {
      appAlert(t("accCompNoSubmitApprovePermission"))
      return
    }
    if (row.filing_status !== "submitted" && !canWriteCompliance) {
      appAlert(t("accCompNoWritePermission"))
      return
    }
    try {
      const res = await savePnd54LedgerEntry({
        userRole: role,
        id: row.id,
        paymentDate: row.payment_date,
        taxMonth: row.tax_month,
        payeeName: row.payee_name || null,
        payeeCountry: row.payee_country || null,
        payeeTaxId: row.payee_tax_id || null,
        incomeType: row.income_type || null,
        grossAmount: Number(row.gross_amount) || 0,
        whtRate: row.wht_rate ? Number(row.wht_rate) : null,
        whtAmount: Number(row.wht_amount) || 0,
        filingStatus: row.filing_status,
        submittedAt: row.submitted_at || null,
        submittedBy: row.submitted_by || null,
        memo: row.memo || null,
        storeName: row.store_name?.trim() ? row.store_name.trim() : null,
        createdBy: auth?.user,
      })
      if (!res.success) throw new Error(res.error || "SAVE_FAILED")
      await loadPnd54()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }

  const removePnd54 = async (row: Pnd54Draft) => {
    if (!row.id) {
      setPnd54Rows((prev) => prev.filter((r) => r !== row))
      return
    }
    if (!canUse || !canWriteCompliance) return
    try {
      const res = await deletePnd54LedgerEntry({ userRole: role, id: row.id })
      if (!res.success) throw new Error(res.error || "DELETE_FAILED")
      await loadPnd54()
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
      appAlert(t("accCompNoReviewDoneChangePermission"))
      return
    }
    if ((status === "todo" || status === "in_progress") && !canWriteCompliance) {
      appAlert(t("accCompNoWorkflowWritePermission"))
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
      appAlert(t("accCompSenderEmailMustBeGmail"))
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
        appAlert(t("accCompNoEtaxDoneApprovePermission"))
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
      appAlert(t("accCompEtaxProgressSaved"))
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
    () =>
      vatOutputRows.filter((r) => {
        if (ledgerStatusFilter !== "all" && r.filing_status !== ledgerStatusFilter) return false
        if (isHeadOfficeLedgerStore && isPosAutoVatOutputRow(r)) return false
        return true
      }),
    [vatOutputRows, ledgerStatusFilter, isHeadOfficeLedgerStore]
  )
  const vatInputRowsFiltered = React.useMemo(
    () => vatInputRows.filter((r) => ledgerStatusFilter === "all" || r.filing_status === ledgerStatusFilter),
    [vatInputRows, ledgerStatusFilter]
  )
  const vatInputClaimable = React.useMemo(() => {
    const claimableRows = vatInputRowsFiltered.filter(
      (r) => r.invoice_evidence_status === "received" || r.invoice_evidence_status === "not_required"
    )
    const pendingRows = vatInputRowsFiltered.filter((r) => r.invoice_evidence_status === "required_pending")
    const unobtainableRows = vatInputRowsFiltered.filter((r) => r.invoice_evidence_status === "unobtainable")
    return {
      claimableVat: claimableRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0),
      pendingVat: pendingRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0),
      unobtainableVat: unobtainableRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0),
      claimableCount: claimableRows.length,
      pendingCount: pendingRows.length,
      unobtainableCount: unobtainableRows.length,
    }
  }, [vatInputRowsFiltered])
  const nonPosOutputCount = React.useMemo(
    () => vatOutputRowsFiltered.filter((r) => !isPosAutoVatOutputRow(r)).length,
    [vatOutputRowsFiltered]
  )
  const posFilingOutputSummaries = React.useMemo(() => {
    if (isHeadOfficeLedgerStore) return []
    const ledgers: VatLedgerRow[] = vatOutputRowsFiltered.map((r) => ({
      id: r.id,
      doc_date: r.doc_date,
      tax_month: r.tax_month,
      direction: "output",
      counterparty_name: r.counterparty_name,
      counterparty_tax_id: r.counterparty_tax_id,
      invoice_number: r.invoice_number,
      net_amount: r.net_amount,
      vat_amount: r.vat_amount,
      total_amount: r.total_amount,
      vat_status: r.vat_status,
      filing_status: r.filing_status,
      submitted_at: r.submitted_at,
      submitted_by: r.submitted_by,
      memo: r.memo,
      store_name: r.store_name,
    }))
    const posOnly = ledgers.filter(isPosAutoVatOutputRow)
    if (!posOnly.length) return []
    return consolidatePosOutputRowsForTaxExport(posOnly)
  }, [vatOutputRowsFiltered, isHeadOfficeLedgerStore])
  const vatOutputVendorSummaries = React.useMemo(() => {
    const grouped = new Map<string, { name: string; count: number; net: number; vat: number; total: number }>()
    for (const row of vatOutputRowsFiltered) {
      if (isPosAutoVatOutputRow(row)) continue
      const name = String(row.counterparty_name || "").trim() || t("accCompUnnamedVendor")
      const hit = grouped.get(name) || { name, count: 0, net: 0, vat: 0, total: 0 }
      hit.count += 1
      hit.net += Number(row.net_amount || 0)
      hit.vat += Number(row.vat_amount || 0)
      hit.total += Number(row.total_amount || 0)
      grouped.set(name, hit)
    }
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total)
  }, [vatOutputRowsFiltered, t])
  const vatOutputVendorTotals = React.useMemo(
    () =>
      vatOutputVendorSummaries.reduce(
        (acc, row) => ({
          count: acc.count + row.count,
          net: acc.net + row.net,
          vat: acc.vat + row.vat,
          total: acc.total + row.total,
        }),
        { count: 0, net: 0, vat: 0, total: 0 }
      ),
    [vatOutputVendorSummaries]
  )
  const vatInputVendorSummaries = React.useMemo(() => {
    const grouped = new Map<string, { name: string; count: number; net: number; vat: number; total: number }>()
    for (const row of vatInputRowsFiltered) {
      const name = String(row.counterparty_name || "").trim() || t("accCompUnnamedVendor")
      const hit = grouped.get(name) || { name, count: 0, net: 0, vat: 0, total: 0 }
      hit.count += 1
      hit.net += Number(row.net_amount || 0)
      hit.vat += Number(row.vat_amount || 0)
      hit.total += Number(row.total_amount || 0)
      grouped.set(name, hit)
    }
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total)
  }, [vatInputRowsFiltered, t])
  const vatInputVendorTotals = React.useMemo(
    () =>
      vatInputVendorSummaries.reduce(
        (acc, row) => ({
          count: acc.count + row.count,
          net: acc.net + row.net,
          vat: acc.vat + row.vat,
          total: acc.total + row.total,
        }),
        { count: 0, net: 0, vat: 0, total: 0 }
      ),
    [vatInputVendorSummaries]
  )
  const vatSettlement = React.useMemo(() => {
    const outputNet = vatOutputRowsFiltered.reduce((sum, row) => sum + Number(row.net_amount || 0), 0)
    const outputVat = vatOutputRowsFiltered.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0)
    const outputTotal = vatOutputRowsFiltered.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
    const inputNet = vatInputRowsFiltered.reduce((sum, row) => sum + Number(row.net_amount || 0), 0)
    const inputVat = vatInputRowsFiltered.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0)
    const inputTotal = vatInputRowsFiltered.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
    const payableVat = outputVat - inputVat
    return {
      outputNet,
      outputVat,
      outputTotal,
      inputNet,
      inputVat,
      inputTotal,
      payableVat,
      dueVat: payableVat > 0 ? payableVat : 0,
      creditVat: payableVat < 0 ? Math.abs(payableVat) : 0,
      outputCount: vatOutputRowsFiltered.length,
      inputCount: vatInputRowsFiltered.length,
      summaryPayableVat: Number(taxSummary?.vat?.payableVat || 0),
    }
  }, [vatOutputRowsFiltered, vatInputRowsFiltered, taxSummary?.vat?.payableVat])
  const vatFilteredStats = React.useMemo(() => {
    const all = [...vatOutputRowsFiltered, ...vatInputRowsFiltered]
    let missingTaxIdCount = 0
    let missingInvoiceCount = 0
    for (const row of all) {
      if (!String(row.counterparty_tax_id || "").trim()) missingTaxIdCount += 1
      if (!String(row.invoice_number || "").trim()) missingInvoiceCount += 1
    }
    return {
      rowCount: all.length,
      missingTaxIdCount,
      missingInvoiceCount,
    }
  }, [vatOutputRowsFiltered, vatInputRowsFiltered])
  const vatSettlementHeadline = React.useMemo(() => {
    if (vatSettlement.payableVat > 0) {
      return {
        tone: t("accCompVatTonePayableDue"),
        className: "border-rose-300/50 bg-rose-50/85 dark:bg-rose-950/25",
      }
    }
    if (vatSettlement.payableVat < 0) {
      return {
        tone: t("accCompVatToneCreditRefund"),
        className: "border-violet-300/50 bg-violet-50/85 dark:bg-violet-950/25",
      }
    }
    return {
      tone: t("accCompVatToneZero"),
      className: "border-emerald-300/50 bg-emerald-50/85 dark:bg-emerald-950/25",
    }
  }, [vatSettlement.payableVat, t])
  const outputSummaryNet = vatSettlement.outputNet
  const outputSummaryVat = vatSettlement.outputVat
  const outputSummaryPayable = vatSettlement.payableVat
  const whtRowsFiltered = React.useMemo(
    () => whtRows.filter((r) => ledgerStatusFilter === "all" || r.filing_status === ledgerStatusFilter),
    [whtRows, ledgerStatusFilter]
  )
  const whtPayeeTinGapCount = React.useMemo(
    () =>
      countWhtPayeeTinGaps(whtRowsFiltered, storeFilterForLedger, storeLabels, legacyToCanonical),
    [whtRowsFiltered, storeFilterForLedger, storeLabels, legacyToCanonical]
  )
  const headOfficeRef = React.useRef<HeadOfficeCompany | null>(null)
  const loadHeadOfficeForWht = React.useCallback(async (): Promise<HeadOfficeCompany> => {
    if (headOfficeRef.current?.companyName) return headOfficeRef.current
    const ho = await getHeadOfficeInfo()
    headOfficeRef.current = {
      companyName: ho.companyName || "",
      taxId: ho.taxId || "",
      address: ho.address || "",
      phone: ho.phone,
    }
    return headOfficeRef.current
  }, [])
  const printWhtCertificates = React.useCallback(
    async (rows: WhtDraft[]) => {
      const eligible = rows.filter((r) => Math.max(0, Number(r.wht_amount) || 0) > 0)
      if (!eligible.length) {
        appAlert(t("whtCertPrintNoWht"))
        return
      }
      const ho = await loadHeadOfficeForWht()
      const items = eligible.map((r) =>
        whtCertificateFromLedgerRow(
          {
            payment_date: r.payment_date,
            tax_month: r.tax_month,
            payee_name: r.payee_name,
            payee_tax_id: r.payee_tax_id,
            income_type: r.income_type,
            gross_amount: r.gross_amount,
            wht_rate: r.wht_rate,
            wht_amount: r.wht_amount,
            form_hint: r.form_hint,
            certificate_no: r.certificate_no,
            memo: r.memo,
            store_name: r.store_name,
            direction: r.direction,
          },
          ho
        )
      )
      if (!openWhtCertificatePrintWindow(items, lang)) {
        appAlert(t("whtCertPrintBlocked"))
      }
    },
    [loadHeadOfficeForWht, lang, t]
  )
  const citKt20kTinMissing = React.useMemo(
    () => isOffice && !isThaiTaxId13(kt20kEmployer.companyTaxId),
    [isOffice, kt20kEmployer.companyTaxId]
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
      msgs.push(tr(t, "accCompEtaxReminderRdEmail", { days: String(elapsed) }))
    }
    if (etaxDocsUploaded && !etaxActivateCodeReceived && elapsed != null && elapsed >= 15) {
      msgs.push(tr(t, "accCompEtaxReminderActivate", { days: String(elapsed) }))
    }
    if (etaxSenderEmailRegistered && !etaxPilotIssued) {
      msgs.push(t("accCompEtaxReminderPilot"))
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
    t,
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
  const ssoStep2Ready = ssoQueried && !!ssoPayrollPreview && ssoPayrollPreview.rowCount > 0
  const ssoEmployeePreviewRows = React.useMemo(
    () => (ssoQueried ? ssoPayrollRows.slice(0, 150) : []),
    [ssoQueried, ssoPayrollRows]
  )
  const ssoSearchBtnClass = cn(
    "h-9 min-w-[88px] font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
    "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
    "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
  )
  const ssoStep3Ready = ssoStep2Ready
  const ssoStep4Ready = (ssoWorkflowRow?.status || "") === "done"
  const summaryPeriodLabel = React.useMemo(() => {
    if (!taxSummary?.period) return taxMonth
    if (taxSummary.period.startMonth === taxSummary.period.endMonth) return taxSummary.period.startMonth
    return `${taxSummary.period.startMonth} ~ ${taxSummary.period.endMonth}`
  }, [taxSummary?.period, taxMonth])

  const handleDownloadPp30VatReconcileXlsx = React.useCallback(async () => {
    if (!pp30Queried) {
      appAlert(t("accCompPp30ExportNeedSearch"))
      return
    }
    setPp30XlsxExporting(true)
    try {
      const y = Number(taxMonth.slice(0, 4))
      let companyName = String(kt20kEmployer.companyName || "").trim()
      let taxDigits = String(etaxTaxId || kt20kEmployer.companyTaxId || "")
        .replace(/\D/g, "")
        .trim()
      let placeOfBusiness = ""
      let branchNo = String(etaxBranchCode || "").trim() || "00000"
      if (storeFilterForLedger !== "All") {
        try {
          const { profile } = await getStoreTaxFilingProfile(storeFilterForLedger)
          if (profile) {
            const profileTaxDigits = String(profile.taxId || "")
              .replace(/\D/g, "")
              .trim()
            const profileName = String(profile.taxpayerName || "").trim()
            if (profileName && profileTaxDigits.length === 13) {
              companyName = profileName
              taxDigits = profileTaxDigits
              placeOfBusiness = String(profile.placeOfBusiness || "").trim()
              branchNo =
                String(profile.branchNo || "")
                  .replace(/\D/g, "")
                  .trim() || "00000"
            }
          }
        } catch {
          /* fallback to KT20k / E-tax below */
        }
      }
      if ((!companyName || taxDigits.length !== 13) && canUse && Number.isFinite(y) && y >= 2000) {
        try {
          const data = await getKt20kSettings({ userRole: role, year: y })
          companyName = companyName || String(data.settings.companyName || "").trim()
          const t2 = String(data.settings.companyTaxId || "")
            .replace(/\D/g, "")
            .trim()
          if (t2.length === 13) taxDigits = t2
        } catch {
          // ignore
        }
      }
      const branchOfficeLabel = (() => {
        const st = String(storeTb || "").trim()
        if (st && st !== "All") return `${st} ${branchNo}`.trim()
        return branchNo ? `สำนักงานใหญ่ ${branchNo}` : ""
      })()
      const companyBlock = {
        companyName,
        companyTaxIdDigits: taxDigits,
        placeOfBusiness,
        branchOfficeLabel,
      }
      const mod = await import("@/lib/pp30-vat-reconcile-xlsx")
      const gaps = mod.listPp30VatReconcileFieldGaps(companyBlock)
      if (gaps.required.length > 0) {
        const fields = gaps.required.map((k) => t(`accCompPp30ExportField_${k}`)).join(", ")
        appAlert(tr(t, "accCompPp30ExportRequiredMissing", { fields }))
        return
      }
      if (gaps.optional.length > 0) {
        appAlert(
          `${tr(t, "accCompPp30ExportOptionalGaps", {
            fields: gaps.optional.map((k) => t(`accCompPp30ExportField_${k}`)).join(", "),
          })}\n${t("accCompPp30ExportRowGapsNote")}`
        )
      }
      const periodDescriptionLine =
        taxSummary?.period && taxSummary.period.startMonth !== taxSummary.period.endMonth
          ? `สำหรับงวดภาษี ${summaryPeriodLabel}`
          : mod.formatThaiVatPeriodLine(taxMonth)
      let filingRound = mod.filingRoundLabelFromTaxMonth(taxMonth)
      if (taxSummary?.period?.startMonth && taxSummary?.period?.endMonth) {
        const a = taxSummary.period.startMonth
        const b = taxSummary.period.endMonth
        if (a !== b) filingRound = `${a.slice(5, 7)}-${a.slice(0, 4)} ~ ${b.slice(5, 7)}-${b.slice(0, 4)} (ยื่นปกติ)`
      }
      const toLedger = (r: VatDraft): VatLedgerRow => ({
        id: r.id,
        doc_date: r.doc_date,
        tax_month: r.tax_month,
        direction: r.direction,
        counterparty_name: r.counterparty_name,
        counterparty_tax_id: r.counterparty_tax_id,
        invoice_number: r.invoice_number,
        net_amount: r.net_amount,
        vat_amount: r.vat_amount,
        total_amount: r.total_amount,
        vat_status: r.vat_status,
        filing_status: r.filing_status,
        submitted_at: r.submitted_at,
        submitted_by: r.submitted_by,
        memo: r.memo,
        store_name: r.store_name,
      })
      const buf = mod.buildPp30VatReconcileXlsxBuffer({
        taxMonth,
        periodDescriptionLine,
        company: companyBlock,
        storeLabel: storeTb !== "All" ? storeTb : undefined,
        outputRows: vatOutputRowsFiltered.map(toLedger),
        inputRows: vatInputRowsFiltered.map(toLedger),
        totals: {
          outputNet: vatSettlement.outputNet,
          outputVat: vatSettlement.outputVat,
          inputNet: vatSettlement.inputNet,
          inputVat: vatSettlement.inputVat,
        },
        filingStatusLabel: (fs) =>
          String(fs || "").toLowerCase() === "submitted" ? "ยื่นแล้ว" : "รอยื่นแบบภาษี",
        filingRoundLabel: filingRound,
      })
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safeStore = String(storeTb || "All")
        .replace(/[^\w\u0E00-\u0E7F\-]+/g, "_")
        .slice(0, 80)
      a.download = `VAT-Reconcile_${taxMonth}_${safeStore}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      appAlert(t("msg_save_fail"))
    } finally {
      setPp30XlsxExporting(false)
    }
  }, [
    pp30Queried,
    taxMonth,
    taxSummary?.period,
    summaryPeriodLabel,
    kt20kEmployer.companyName,
    kt20kEmployer.companyTaxId,
    etaxTaxId,
    etaxBranchCode,
    storeTb,
    storeFilterForLedger,
    role,
    canUse,
    vatOutputRowsFiltered,
    vatInputRowsFiltered,
    vatSettlement.outputNet,
    vatSettlement.outputVat,
    vatSettlement.inputNet,
    vatSettlement.inputVat,
    t,
    tr,
  ])

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
        storeFilter: storeFilterForApi,
        excludePosAuto: isHeadOfficeLedgerStore,
      }),
    [role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, isHeadOfficeLedgerStore]
  )
  const whtExportUrl = React.useMemo(
    () =>
      getExportWithholdingTaxLedgerCsvUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
      }),
    [role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger]
  )
  const whtSubmissionExportUrl = React.useMemo(
    () =>
      getExportWithholdingTaxLedgerCsvUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
        format: "submission",
        formHint: whtSubmissionFormHint,
      }),
    [role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, whtSubmissionFormHint]
  )
  const pp36ExportUrl = React.useMemo(
    () =>
      getExportPp36LedgerCsvUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
      }),
    [role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger]
  )
  const pnd54ExportUrl = React.useMemo(
    () =>
      getExportPnd54LedgerCsvUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
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
        storeFilter: storeFilterForApi,
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
            appAlert(up.message || t("accCompEtaxEvidenceUploadFail"))
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
    lang === "th" ? "ส่งออก RD Prep ภ.ง.ด.1 TXT" : t("accCompPnd1ExportTxt")
  const pnd1RdPrepGuideTitle =
    lang === "th" ? "แนวทางยื่น RD Prep (ภ.ง.ด.1 / ภ.ง.ด.1ก)" : t("accCompPnd1GuideTitle")
  const pnd1RdPrepGuideNote =
    lang === "th"
      ? "ไฟล์นี้เป็นแบบคั่นด้วย | เพื่อนำเข้าใน RD Prep โดยแมปคอลัมน์ในขั้นตอนโอนย้ายข้อมูล"
      : t("accCompPnd1GuideNotePipe")
  const pnd1ValidateBtnLabel =
    lang === "th" ? "ตรวจสอบก่อนส่งออก" : t("accCompPnd1ValidateBeforeExport")
  const pnd1FormLabel =
    lang === "th" ? "แบบยื่น" : t("accCompPnd1FilingForm")
  const pnd1PayerBoxTitle =
    lang === "th" ? "ข้อมูลผู้จ่าย (ผู้หัก ณ ที่จ่าย)" : t("accCompPnd1PayerInfoBox")
  const pnd1ValidationTableTitle =
    lang === "th" ? "ผลตรวจสอบ RD Prep" : t("accCompPnd1ValidationResults")
  const pnd1GoLedgerBtnLabel =
    lang === "th" ? "ไปที่รายการ" : t("accCompPnd1GoToLedgerRow")
  const pnd1ClearValidationLabel =
    lang === "th" ? "ล้างผลตรวจสอบ" : t("accCompPnd1ClearValidation")
  const pnd1IssueFilterLabel =
    lang === "th" ? "ตัวกรองปัญหา" : t("accCompPnd1IssueFilter")
  const pnd1IssueExportCsvLabel =
    lang === "th" ? "ส่งออกผลตรวจสอบ CSV" : t("accCompPnd1ExportValidationCsv")
  const pnd1NoIssueTooltip =
    lang === "th" ? "ไม่มีปัญหาประเภทนี้ในช่วงที่เลือก" : t("accCompPnd1NoIssuesInFilter")
  const kt20kExportUrl = React.useMemo(() => {
    const y = Number(kt20kYear)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return "#"
    return getExportKt20kCsvUrl({ userRole: role, year: y, storeFilter: storeTb })
  }, [kt20kYear, role, storeTb])
  const pnd1IssueCodeLabel = React.useCallback(
    (code: string) => {
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
      const key = `accCompPnd1Issue_${code}`
      const label = t(key)
      return label === key ? code : label
    },
    [lang, t]
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
      const th: Record<string, string> = {
        missing_in_pnd1a: "ไม่มีใน PND1A",
        missing_in_kt20k: "ไม่มีใน KT20K",
        amount_mismatch: "ยอดไม่ตรงกัน",
        possible_store_mismatch: "อาจแมปสาขาผิด",
        possible_name_mismatch: "อาจแมปชื่อผิด",
      }
      if (lang === "th") return th[tag] || tag
      const key = `accCompKt20kTag_${tag}`
      const label = t(key)
      return label === key ? tag : label
    },
    [lang, t]
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
        storeFilter: storeFilterForApi,
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
          ? `${t("accCompValidationDoneWarnings")}: ${warningTotal.toLocaleString()} (${t("accCompValidationCheckTable")})`
          : t("accCompValidationDoneNoWarnings")
      )
    } catch {
      setPnd1ValidationResult(null)
      appAlert(t("accCompValidationFailed"))
    } finally {
      setPnd1Validating(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, pnd1FilingForm, t])

  const runPnd353Validation = React.useCallback(async () => {
    if (!canUse) return
    setPnd353Validating(true)
    try {
      const data = await validatePnd3Pnd53({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
        formHint: whtSubmissionFormHint,
      })
      setPnd353ValidationResult(data)
      const wc = data.warningCounts
      const warningTotal =
        wc.missingPayeeName +
        wc.missingPayeeTaxId +
        wc.missingIncomeType +
        wc.missingCertificateNo +
        wc.invalidWhtRate +
        wc.nonPositiveWithheldAmount
      appAlert(
        warningTotal > 0
          ? `PND3/53 검증 경고 ${warningTotal.toLocaleString()}건`
          : "PND3/53 검증 완료 (경고 없음)"
      )
    } catch {
      setPnd353ValidationResult(null)
      appAlert("PND3/53 검증에 실패했습니다.")
    } finally {
      setPnd353Validating(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, whtSubmissionFormHint])

  const saveCitAdjustmentsDraft = React.useCallback(async () => {
    if (!canUse || !canWriteCompliance) {
      appAlert(t("accCompNoWritePermission"))
      return
    }
    try {
      const adjustments = citAdjustmentsDraft
        .map((x) => ({
          adjustmentType: x.adjustmentType,
          itemName: String(x.itemName || "").trim(),
          amount: Number(x.amount) || 0,
          memo: String(x.memo || "").trim() || null,
        }))
        .filter((x) => x.itemName)
      const res = await saveCorporateTaxAdjustments({
        userRole: role,
        yearMonth: citYearMonthForApi,
        periodType,
        adjustments,
      })
      if (!res.success) throw new Error(res.error || "SAVE_FAILED")
      await loadCit()
      appAlert(t("accCompSaved"))
    } catch {
      appAlert(t("msg_save_fail"))
    }
  }, [canUse, canWriteCompliance, citAdjustmentsDraft, role, citYearMonthForApi, periodType, loadCit, t])

  const runPayrollTinGapCheck = React.useCallback(async () => {
    if (!canUse) return
    setPayrollTinGapLoading(true)
    try {
      const data = await getPayrollWhtTinGaps({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        storeFilter: storeFilterForApi,
      })
      setPayrollTinGapResult(data)
      if (data.gapRowCount > 0) {
        const sample = data.gaps
          .slice(0, 5)
          .map((x) => (x.storeName ? `${x.storeName}/${x.payeeName || '-'}` : x.payeeName || '-'))
          .join(', ')
        appAlert(
          `${t("accCompTinGapCheckDone")}: ${data.gapRowCount.toLocaleString()} · ${t("accCompImpactedEmployees")} ${data.uniqueEmployeeCount.toLocaleString()}\n` +
            (sample ? `${t("example")}: ${sample}` : "")
        )
      } else {
        appAlert(t("accCompTinGapCheckDoneNoMissing"))
      }
    } catch {
      setPayrollTinGapResult(null)
      appAlert(t("accCompTinGapCheckFailed"))
    } finally {
      setPayrollTinGapLoading(false)
    }
  }, [canUse, role, taxMonth, periodType, storeFilterForLedger, t])

  const storeOptionLabel = React.useCallback(
    (code: string) => (code === "All" ? t("all") : formatStoreLabel(code) || code),
    [t, formatStoreLabel]
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
          <AdminTabsBarWithHelp>
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
          </AdminTabsBarWithHelp>
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
                {lang === "th" ? "เทียบยอด KT20K vs PND1A" : t("accCompKt20kVsPnd1aTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {kt20kData?.reconciliation ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs text-muted-foreground">
                      {lang === "th" ? "เกณฑ์ส่วนต่าง (บาท)" : t("accCompKt20kDiffToleranceLabel")}
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
                      <div className="text-muted-foreground">{t("accCompKt20kCardTotalWage1")}</div>
                      <div className="font-medium text-sm">
                        {kt20kData.reconciliation.annual.kt20kTotalWage.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <div className="text-muted-foreground">{t("accCompKt20kCardPnd1aLedgerGross")}</div>
                      <div className="font-medium text-sm">
                        {kt20kData.reconciliation.annual.pnd1aLedgerGross.toLocaleString()}
                      </div>
                    </div>
                    <div className="rounded border border-border/60 p-2">
                      <div className="text-muted-foreground">{t("accCompKt20kCardDiffTotalMinusPnd1a")}</div>
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
                          <th className="text-left p-2">{t("month")}</th>
                          <th className="text-right p-2">{t("accCompKt20kCol1TotalWage")}</th>
                          <th className="text-right p-2">{t("accCompKt20kColPnd1aGross")}</th>
                          <th className="text-right p-2">{t("accCompKt20kColDiff1MinusPnd1a")}</th>
                          <th className="text-right p-2">{t("accCompKt20kColDiff3MinusPnd1a")}</th>
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
                              {lang === "th" ? "ไม่พบส่วนต่างตามเกณฑ์" : t("accCompKt20kNoMonthlyDiff")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {lang === "th" ? "ตัวกรองแท็กสาเหตุ" : t("accCompKt20kReasonTagQuickFilter")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={kt20kReasonTagFilter.length === 0 ? "default" : "outline"}
                        onClick={() => setKt20kReasonTagFilter([])}
                      >
                        {lang === "th" ? "ทั้งหมด" : t("all")}
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
                                  : t("accCompKt20kNoTagInFilter")
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
                          <th className="text-left p-2">{t("store")}</th>
                          <th className="text-left p-2">{t("accCompColName")}</th>
                          <th className="text-right p-2">{t("accCompKt20kTotal")}</th>
                          <th className="text-right p-2">{t("accCompKt20kColPnd1aGross")}</th>
                          <th className="text-right p-2">{t("accCompDiff")}</th>
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
                              {lang === "th" ? "ไม่พบส่วนต่างรายบุคคล" : t("accCompKt20kNoEmployeeDiff")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {lang === "th" ? "ยังไม่มีข้อมูลเทียบยอด" : t("accCompKt20kNoReconcileData")}
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
            {t("accCompPeriodLockRoleHint")}
            {storeTb && storeTb !== "All" ? (
              <span className="block mt-1">
                {t("store")}: <span className="font-mono">{storeTb}</span>
              </span>
            ) : (
              <span className="block mt-1">{t("accCompVatPeriodPickStoreForLock")}</span>
            )}
          </div>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <div className="mb-3 grid grid-cols-1 lg:grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompUnlockReasonRequired")}</div>
                  <Input
                    className="h-9"
                    value={periodUnlockReason}
                    onChange={(e) => setPeriodUnlockReason(e.target.value)}
                    placeholder={t("accCompUnlockReasonPlaceholder")}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompUnlockApprover")}</div>
                  <Input
                    className="h-9"
                    value={periodUnlockApprovedBy}
                    onChange={(e) => setPeriodUnlockApprovedBy(e.target.value)}
                    placeholder={t("accCompUnlockApproverPlaceholder")}
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
                            {t("accCompUnlockedAt")}: {formatBangkokDateTime(String(p.unlockedAt || ""))}
                            {p.unlockApprovedBy ? ` / ${t("approval")} ${p.unlockApprovedBy}` : ""}
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
              <CardTitle className="text-base">{t("accCompHealthCheckTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => void loadAccountingHealth()} disabled={accountingHealthLoading}>
                  {accountingHealthLoading ? t("loading") : t("accCompReloadReconcile")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("accCompHealthBase")}: {closingYearMonth} / {t("store")}: {storeTb}
                </span>
              </div>
              {accountingHealth ? (
                <div className="rounded border border-border/60 p-3 space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                    <div>{t("accCompTbRevenue4xx")}: {accountingHealth.tbRevenue.toLocaleString()}</div>
                    <div>{t("accCompTbExpense5xx")}: {accountingHealth.tbExpense.toLocaleString()}</div>
                    <div>{t("accCompTbNetIncome")}: {accountingHealth.tbNetIncome.toLocaleString()}</div>
                    <div>{t("accCompIncomeStatementNetIncome")}: {accountingHealth.incomeNetProfit.toLocaleString()}</div>
                    <div>{t("accCompBsCurrentPeriodProfit")}: {accountingHealth.bsCurrentPeriodProfit.toLocaleString()}</div>
                    <div>{t("accCompClosingPreviewNetIncome")}: {accountingHealth.closingPreviewNetIncome.toLocaleString()}</div>
                    <div>{t("accCompNetIncomeDiffTbIncome")}: {accountingHealth.netDiff.toLocaleString()}</div>
                    <div>{t("accCompNetIncomeDiffTbBs")}: {accountingHealth.bsDiff.toLocaleString()}</div>
                    <div>{t("accCompNetIncomeDiffTbClosing")}: {accountingHealth.closingDiff.toLocaleString()}</div>
                    <div>{t("accCompTrialBalanceDiff")}: {accountingHealth.tbDiff.toLocaleString()}</div>
                  </div>
                  {Math.abs(accountingHealth.netDiff) > 0.0001 ||
                  Math.abs(accountingHealth.bsDiff) > 0.0001 ||
                  Math.abs(accountingHealth.closingDiff) > 0.0001 ||
                  Math.abs(accountingHealth.tbDiff) > 0.0001 ? (
                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                      {t("accCompHealthDiffDetected")}
                    </div>
                  ) : (
                    <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-800">
                      {t("accCompHealthAligned")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">{t("accCompHealthLoadFailed")}</div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("accCompClosingFlowTitle")}</CardTitle>
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
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompClosingProfitLossAccount")}</div>
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
                    {t("accCompAuditCsv")}
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">{t("accCompClosingMemoLabel")}</div>
                <Textarea
                  className="min-h-[72px]"
                  value={closingMemo}
                  onChange={(e) => setClosingMemo(e.target.value)}
                  placeholder={t("accCompClosingMemoPlaceholder")}
                />
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={closingAutoLock}
                    onChange={(e) => setClosingAutoLock(e.target.checked)}
                  />
                  {t("accCompClosingAutoLock")}
                </label>
              </div>
              {closingPreview ? (
                <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div>{t("accCompClosingRevenueTotal")}: {closingPreview.revenueTotal.toLocaleString()}</div>
                    <div>{t("accCompClosingExpenseTotal")}: {closingPreview.expenseTotal.toLocaleString()}</div>
                    <div>{t("accCompClosingNetIncome")}: {closingPreview.netIncome.toLocaleString()}</div>
                    <div>{t("accCompClosingGeneratedLineCount")}: {closingPreview.lineCount.toLocaleString()}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("accCompClosingProfitLossAccountApplied")}: {closingPreview.profitLossAccountCode} (
                    {closingPreview.profitLossAccountName})
                  </div>
                  <div className="overflow-x-auto rounded border border-border/60">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2">{t("accCompAccountCode")}</th>
                          <th className="text-left p-2">{t("accCompAccountName")}</th>
                          <th className="text-left p-2">{t("accCompDebitCredit")}</th>
                          <th className="text-right p-2">{t("amount")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closingPreview.lines.slice(0, 200).map((ln, i) => (
                          <tr key={`${ln.accountCode}-${ln.side}-${i}`} className="border-b border-border/40">
                            <td className="p-2 font-mono">{ln.accountCode}</td>
                            <td className="p-2">{ln.accountName || "-"}</td>
                            <td className="p-2">{ln.side === "debit" ? t("accCompDebit") : t("accCompCredit")}</td>
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
                      {closingDraftSaving ? t("loading") : t("accCompClosingSaveDraft")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void runIncomeExpenseClosing(false)}
                      disabled={closingPosting || closingPreview.lineCount === 0 || !canApproveCompliance}
                    >
                      {closingPosting ? t("loading") : t("accCompClosingRunApproved")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void runIncomeExpenseClosing(true)}
                      disabled={closingPosting || closingPreview.lineCount === 0 || !canApproveCompliance}
                    >
                      {closingPosting ? t("loading") : t("accCompClosingRerunAfterReset")}
                    </Button>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("accCompClosingLatestDraft")}:{" "}
                    {closingDraft?.created_at ? formatBangkokDateTime(String(closingDraft.created_at)) : "-"}
                    {closingDraft?.created_by ? ` / ${closingDraft.created_by}` : ""}
                    {closingDraft?.memo ? ` / ${closingDraft.memo}` : ""}
                  </div>
                  {closingDraftDiff ? (
                    <div className="rounded border border-border/60 p-2">
                      <div className="text-xs font-medium mb-1">{t("accCompClosingDiffVsDraft")}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-[11px]">
                        <div>{t("accCompClosingRevenueDiff")}: {closingDraftDiff.revenueDiff.toLocaleString()}</div>
                        <div>{t("accCompClosingExpenseDiff")}: {closingDraftDiff.expenseDiff.toLocaleString()}</div>
                        <div>{t("accCompClosingNetIncomeDiff")}: {closingDraftDiff.netIncomeDiff.toLocaleString()}</div>
                        <div>{t("accCompClosingLineDiff")}: {closingDraftDiff.lineCountDiff.toLocaleString()}</div>
                        <div>{t("accCompClosingChangedItems")}: {closingDraftDiff.changedCount.toLocaleString()}</div>
                      </div>
                      {closingDraftDiff.changedSample.length ? (
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {closingDraftDiff.changedSample.map((item) => (
                            <div key={item.key}>
                              {item.key} / {t("accCompCurrent")} {item.current.toLocaleString()} / {t("accCompDraft")}{" "}
                              {item.draft.toLocaleString()} / {t("accCompDiff")}{" "}
                              {item.diff.toLocaleString()}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="text-[11px] text-muted-foreground">
                    {t("accCompClosingLatestPosting")}: {closingPosted?.entry_no || "-"} /{" "}
                    {formatBangkokDateTime(String(closingPosted?.posted_at || ""))}
                    {closingPosted?.posted_by ? ` / ${closingPosted.posted_by}` : ""}
                  </div>
                  <div className="rounded border border-border/60 p-2">
                    <div className="text-xs font-medium mb-1">{t("accCompClosingDocHistoryRecent30")}</div>
                    {closingHistory.length ? (
                      <div className="space-y-1 text-[11px]">
                        {closingHistory.map((h) => (
                          <div key={String(h.id)} className="border-b border-border/40 pb-1">
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>{h.status || "-"}</span>
                              <span>[{h.store_scope || "-"}]</span>
                              <span>{formatBangkokDateTime(String(h.created_at || ""))}</span>
                              <span>{h.created_by || "-"}</span>
                              <span>
                                {t("accCompClosingNetIncomeShort")} {Number(h.net_income || 0).toLocaleString()}
                              </span>
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
                                  {closingHistoryExpandedId === Number(h.id || 0) ? t("collapse") : t("viewDetails")}
                                </Button>
                              ) : null}
                            </div>
                            {closingHistoryExpandedId === Number(h.id || 0) &&
                            Array.isArray((h.payload as { lines?: unknown[] } | null)?.lines) ? (
                              <div className="mt-1 overflow-x-auto rounded border border-border/50">
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="text-left p-1">{t("code")}</th>
                                      <th className="text-left p-1">{t("account")}</th>
                                      <th className="text-left p-1">{t("accCompDebitCredit")}</th>
                                      <th className="text-right p-1">{t("amount")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {((h.payload as IncomeExpenseClosingPreview).lines || []).slice(0, 80).map((ln, idx) => (
                                      <tr key={`${ln.accountCode}-${ln.side}-${idx}`} className="border-b border-border/30">
                                        <td className="p-1 font-mono">{ln.accountCode}</td>
                                        <td className="p-1">{ln.accountName || "-"}</td>
                                        <td className="p-1">{ln.side === "debit" ? t("accCompDebit") : t("accCompCredit")}</td>
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
                      <div className="text-[11px] text-muted-foreground">{t("accCompClosingDocHistoryEmpty")}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">{t("accCompClosingRunSearchForPreview")}</div>
              )}
            </CardContent>
          </Card>
          <Card className="mt-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("accCompComplianceAuditLogTitle")}</CardTitle>
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
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompAuditFilterDecision")}</div>
                  <Select value={auditDecision} onValueChange={(v) => setAuditDecision(v as "all" | "allow" | "deny" | "error")}>
                    <SelectTrigger className="h-9 w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all")}</SelectItem>
                      <SelectItem value="allow">{t("accCompDecisionAllow")}</SelectItem>
                      <SelectItem value="deny">{t("accCompDecisionDeny")}</SelectItem>
                      <SelectItem value="error">{t("accCompDecisionError")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompAuditActionKeywordLabel")}</div>
                  <Input
                    className="h-9 w-[220px]"
                    value={auditActionKeyword}
                    onChange={(e) => setAuditActionKeyword(e.target.value)}
                    placeholder={t("accCompAuditActionKeywordPh")}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void loadComplianceAuditLogs()} disabled={auditLoading}>
                  {auditLoading ? t("loading") : t("accCompAuditQueryButton")}
                </Button>
                <a href={complianceAuditCsvUrl} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button type="button" variant="outline" className="h-9">
                    {t("accCompAuditCsv")}
                    <ExternalLink className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </a>
              </div>
              {auditFallbackUsed ? (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  {t("accCompAuditTableMissingFallback")}
                </div>
              ) : null}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">{t("accCompAuditKpiTotalCount")}</div>
                  <div className="text-sm font-semibold">{auditKpi.total.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">{t("accCompAuditKpiAllowShort")}</div>
                  <div className="text-sm font-semibold text-emerald-700">{auditKpi.allowCount.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">{t("accCompAuditKpiDenyShort")}</div>
                  <div className="text-sm font-semibold text-amber-700">{auditKpi.denyCount.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">{t("accCompAuditKpiErrorShort")}</div>
                  <div className="text-sm font-semibold text-rose-700">{auditKpi.errorCount.toLocaleString()}</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">{t("accCompAuditDenyRateShort")}</div>
                  <div className="text-sm font-semibold">{auditKpi.denyRate.toFixed(1)}%</div>
                </div>
                <div className="rounded border border-border/60 p-2">
                  <div className="text-[10px] text-muted-foreground">{t("accCompAuditErrorRateShort")}</div>
                  <div className="text-sm font-semibold">{auditKpi.errorRate.toFixed(1)}%</div>
                </div>
              </div>
              <div className="rounded border border-border/60 p-2 text-[11px]">
                <span className="text-muted-foreground">
                  {tr(t, "accCompAuditMoMCompare", {
                    month: auditPrevMonthStats?.yearMonth || "-",
                    sampleCount: Number(auditPrevMonthStats?.total || 0).toLocaleString(),
                  })}
                </span>
                {auditDenyRateDelta == null ? (
                  <span className="ml-2 text-muted-foreground">{t("accCompAuditNoMoMData")}</span>
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
                    {tr(t, "accCompAuditDenyRateMoMLine", {
                      current: auditKpi.denyRate.toFixed(1),
                      prev: Number(auditPrevMonthStats?.denyRate || 0).toFixed(1),
                      delta: `${auditDenyRateDelta > 0.0001 ? "+" : ""}${auditDenyRateDelta.toFixed(1)}`,
                    })}
                  </span>
                )}
              </div>
              <div className="rounded border border-border/60 p-2">
                <div className="text-[11px] font-medium mb-1">{t("accCompAuditTopReasonCodes")}</div>
                {auditKpi.topReasons.length ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {auditKpi.topReasons.map(([reason, count]) => (
                      <span key={reason}>
                        {reason}: {count.toLocaleString()}
                        {t("accCompAuditCaseSuffix")}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">{t("accCompAuditNoReasonStats")}</div>
                )}
              </div>
              <div className="rounded border border-border/60 p-2">
                <div className="text-[11px] font-medium mb-1">{t("accCompAuditLast3MonthsTrend")}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-1.5">{t("accCompAuditTableMonth")}</th>
                        <th className="text-right p-1.5">{t("accCompAuditTableCount")}</th>
                        <th className="text-right p-1.5">{t("accCompAuditTableDenyRate")}</th>
                        <th className="text-right p-1.5">{t("accCompAuditTableErrorRate")}</th>
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
                            {t("accCompAuditTrendEmpty")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {tr(t, "accCompAuditRecentMeta", {
                  n: auditRows.length.toLocaleString(),
                  ym: auditYearMonth,
                  store: storeTb,
                })}
              </div>
              <div className="overflow-x-auto rounded border border-border/60">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2">{t("accCompAuditThTime")}</th>
                      <th className="text-left p-2">{t("accCompAuditFilterDecision")}</th>
                      <th className="text-left p-2">{t("accCompAuditThAction")}</th>
                      <th className="text-left p-2">{t("accCompAuditThReasonCode")}</th>
                      <th className="text-left p-2">{t("accCompAuditThTarget")}</th>
                      <th className="text-left p-2">{t("accCompAuditThMonthStore")}</th>
                      <th className="text-left p-2">{t("accCompAuditThActor")}</th>
                      <th className="text-left p-2">{t("accCompAuditThDetail")}</th>
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
                              {row.decision === "allow"
                                ? t("accCompDecisionAllow")
                                : row.decision === "deny"
                                  ? t("accCompDecisionDeny")
                                  : row.decision === "error"
                                    ? t("accCompDecisionError")
                                    : "-"}
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
                                {auditExpandedRowKey === `${row.id || "noid"}-${idx}` ? t("collapse") : t("accCompDetailShort")}
                              </Button>
                            </td>
                          </tr>
                          {auditExpandedRowKey === `${row.id || "noid"}-${idx}` ? (
                            <tr className="border-b border-border/30 bg-muted/10">
                              <td className="p-2" colSpan={8}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                  <div className="rounded border border-border/50 p-2">
                                    <div className="font-medium mb-1">{t("accCompAuditMetaHeading")}</div>
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
                          {t("accCompAuditNoLogs")}
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
              <CardTitle className="text-base">{t("accCompEtaxTimestampFlowTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="text-xs text-muted-foreground">
                {t("accCompEtaxGuideRecommended")}
                <a
                  href="https://flowaccount.com/help-center/category/platform/register-e-tax-invoice-by-time-stamp"
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 underline underline-offset-2"
                >
                  {t("accCompEtaxFlowaccountStepsLink")}
                </a>
                <a href={etaxAuditCsvUrl} target="_blank" rel="noreferrer" className="ml-3 underline underline-offset-2">
                  {t("accCompEtaxAuditCsvLink")}
                </a>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                <Input value={etaxTaxId} onChange={(e) => setEtaxTaxId(e.target.value)} placeholder={t("accCompPhCompanyTaxId13")} />
                <Input
                  value={etaxBranchCode}
                  onChange={(e) => setEtaxBranchCode(e.target.value)}
                  placeholder={t("accCompPhBranch00000")}
                />
                <Input
                  value={etaxRdContactEmail}
                  onChange={(e) => setEtaxRdContactEmail(e.target.value)}
                  placeholder={t("accCompPhRdEmail")}
                />
                <Input
                  value={etaxSenderGmail}
                  onChange={(e) => setEtaxSenderGmail(e.target.value)}
                  placeholder={t("accCompPhIssuingGmail")}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  value={etaxActivateCodeRef}
                  onChange={(e) => setEtaxActivateCodeRef(e.target.value)}
                  placeholder={t("accCompPhActivateOrCmRef")}
                />
                <Input
                  value={etaxAttachmentInput}
                  onChange={(e) => setEtaxAttachmentInput(e.target.value)}
                  placeholder={t("accCompPhEvidenceUrlsMultiline")}
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
                <span className="text-muted-foreground">
                  {etaxEvidenceUploading ? t("accCompUploading") : t("accCompEtaxFileUploadHintIdle")}
                </span>
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
                  <div className="font-medium">{t("accCompEvidenceLinksHeading")}</div>
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
                          if (!(await appConfirm(t("accCompConfirmDeleteThisLink")))) return
                          setEtaxAttachmentInput((prev) => parseAttachmentUrlsFromInput(prev).filter((x) => x !== u).join("\n"))
                        }}
                      >
                        {t("accCompDelete")}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="rounded border border-border/60 p-2">
                <div className="text-xs font-medium mb-2">
                  {tr(t, "accCompEtaxChecklistProgress", { done: String(etaxStepCountDone) })}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 text-xs">
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxApplySubmitted} onChange={(e) => toggleEtaxStep("applySubmitted", e.target.checked)} />
                      {t("accCompEtaxStep1RdApplyDone")}
                    </label>
                    {etaxStepAudit.applySubmitted ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("applySubmitted")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxKo01Printed} onChange={(e) => toggleEtaxStep("ko01Printed", e.target.checked)} />
                      {t("accCompEtaxStep2Ko01")}
                    </label>
                    {etaxStepAudit.ko01Printed ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("ko01Printed")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxDocsUploaded} onChange={(e) => toggleEtaxStep("docsUploaded", e.target.checked)} />
                      {t("accCompEtaxStep3PdfThree")}
                    </label>
                    {etaxStepAudit.docsUploaded ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("docsUploaded")}</div> : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxEmailConfirmed} onChange={(e) => toggleEtaxStep("emailConfirmed", e.target.checked)} />
                      {t("accCompEtaxStep4RdEmailVerify")}
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
                      {t("accCompEtaxStep5ActivateCode")}
                    </label>
                    {etaxStepAudit.activateCodeReceived ? (
                      <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("activateCodeReceived")}</div>
                    ) : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxPasswordSet} onChange={(e) => toggleEtaxStep("passwordSet", e.target.checked)} />
                      {t("accCompEtaxStep6RdPassword")}
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
                      {t("accCompEtaxStep7SenderEmail")}
                    </label>
                    {etaxStepAudit.senderEmailRegistered ? (
                      <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("senderEmailRegistered")}</div>
                    ) : null}
                  </div>
                  <div>
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={etaxPilotIssued} onChange={(e) => toggleEtaxStep("pilotIssued", e.target.checked)} />
                      {t("accCompEtaxStep8Pilot")}
                    </label>
                    {etaxStepAudit.pilotIssued ? <div className="pl-6 text-[10px] text-muted-foreground">{etaxStepStamp("pilotIssued")}</div> : null}
                  </div>
                </div>
              </div>
              <Textarea
                value={etaxMemo}
                onChange={(e) => setEtaxMemo(e.target.value)}
                className="min-h-[72px]"
                placeholder={t("accCompEtaxOpsMemoPlaceholder")}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void saveEtaxTimestampProgress()} disabled={etaxSaving || !canWriteCompliance}>
                  {etaxSaving ? t("loading") : t("accCompEtaxSaveProgressButton")}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {t("accCompEtaxStatusPrefix")}{" "}
                  {workflowStatusLabel((etaxWorkflowRow?.status as "todo" | "in_progress" | "review" | "done") || "todo")}
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
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2 space-y-1">
              <CardTitle className="text-base">
                {isEmbeddedPp36Section ? t("accCompTabPp36") : t("accCompTabPp30")}
              </CardTitle>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isEmbeddedPp36Section ? t("accCompPp36ScreenIntro") : t("accCompPp30ScreenIntro")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEmbeddedPp36Section ? (
              <div className="flex max-w-full flex-nowrap items-end gap-2 overflow-x-auto pb-1">
                <div className="shrink-0">
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompYearMonth")}</div>
                  <Input
                    type="month"
                    className="h-9 w-[160px]"
                    value={taxMonth}
                    onChange={(e) => setTaxMonth(e.target.value)}
                  />
                </div>
                {isOffice ? (
                  <div className="shrink-0">
                    <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                    <Select value={storeTb} onValueChange={setStoreTb}>
                      <SelectTrigger className="h-9 w-[180px]">
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
                ) : isManager && managerStore ? (
                  <div className="shrink-0">
                    <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                    <div className="flex h-9 min-w-[140px] max-w-[220px] items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground">
                      <span className="truncate">{managerStore}</span>
                    </div>
                  </div>
                ) : null}
                <div className="shrink-0">
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompPeriodType")}</div>
                  <Select
                    value={periodType}
                    onValueChange={(v) => setPeriodType(v as "monthly" | "half_year" | "annual")}
                  >
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">{t("accCompPeriodMonthly")}</SelectItem>
                      <SelectItem value="half_year">{t("accCompPeriodHalfYear")}</SelectItem>
                      <SelectItem value="annual">{t("accCompPeriodAnnual")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="shrink-0">
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompColStatus")}</div>
                  <Select
                    value={ledgerStatusFilter}
                    onValueChange={(v) => setLedgerStatusFilter(v as "all" | "draft" | "submitted")}
                  >
                    <SelectTrigger className="h-9 w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("all")}</SelectItem>
                      <SelectItem value="draft">{t("accCompWorkflowStatusTodo")}</SelectItem>
                      <SelectItem value="submitted">{t("accCompWorkflowStatusDone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="shrink-0">
                  <Button
                    type="button"
                    variant="default"
                    className={cn(
                      "h-9 min-w-[88px] font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
                      "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
                      "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
                      "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                    )}
                    onClick={() => {
                      setPp30Queried(true)
                      setPp30SearchSeq((prev) => prev + 1)
                      onFilingSearch?.()
                    }}
                  >
                    {t("search")}
                  </Button>
                </div>
                <div className="shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-9 min-w-[88px] font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
                      "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
                      "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
                      "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                    )}
                    disabled={loading || summaryLoading || pp30XlsxExporting}
                    onClick={() => void handleDownloadPp30VatReconcileXlsx()}
                  >
                    <Download className="h-4 w-4 mr-1 shrink-0" aria-hidden />
                    {pp30XlsxExporting ? t("loading") : t("accCompPp30VatReconcileXlsx")}
                  </Button>
                </div>
              </div>
              ) : null}

              {!isEmbeddedPp36Section ? (
              <StoreVendorTaxLinkBanner
                t={t}
                tr={tr}
                loading={taxLinkMetaLoading}
                storeFilter={storeFilterForLedger}
                isOffice={isOffice}
                storeLinkEval={pp30StoreLinkEval}
                vendorLinkCounts={pp30VendorLinkCounts}
                onOpenStoreProfiles={onOpenStoreProfiles}
                showProfileShortcut
              />
              ) : null}

              {!isEmbeddedPp36Section ? (
              <Collapsible open={pp30OpsOpen} onOpenChange={setPp30OpsOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="w-full justify-between px-2 h-9 font-normal">
                    <span>{t("accCompPp30OpsSectionTitle")}</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", pp30OpsOpen && "rotate-180")} aria-hidden />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  {storeFilterForLedger === "All" ? (
                    <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/60 px-3 py-2">{t("accCompPp30OpsPickStore")}</p>
                  ) : (
                    <>
                      <div className="rounded-lg border border-border/70 bg-background p-3 space-y-2 text-sm">
                        <div className="text-xs font-medium">{t("accCompVatPeriodLockTitle")}</div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{t("accCompVatPeriodLockHint")}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{taxMonth}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-mono text-xs">{storeFilterForLedger}</span>
                          {pp30PeriodCloseLoading ? (
                            <span className="text-xs text-muted-foreground">{t("loading")}</span>
                          ) : pp30PeriodClose?.isClosed ? (
                            <span className="text-xs text-amber-700 dark:text-amber-300">{t("accCompPeriodClosedLabel")}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("accCompPeriodProgress")}</span>
                          )}
                        </div>
                        {pp30PeriodClose?.closedViaAll ? (
                          <p className="text-xs text-amber-800/90 dark:text-amber-200/80">{t("accCompVatPeriodClosedViaAll")}</p>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant={pp30PeriodClose?.isClosed ? "secondary" : "default"}
                          disabled={pp30PeriodCloseLoading || (pp30PeriodClose?.isClosed ? !canApproveUnlock : !canApproveCompliance)}
                          onClick={() => void togglePeriod(taxMonth, !pp30PeriodClose?.isClosed)}
                        >
                          {pp30PeriodClose?.isClosed ? t("accCompPeriodOpen") : t("accCompPeriodClose")}
                        </Button>
                      </div>
                      {hqSupplyProbeLoading ? (
                        <p className="text-xs text-muted-foreground">{t("accCompIntercompanyProbeLoading")}</p>
                      ) : hqSupplyReconcileApplicable ? (
                      <div className="rounded-lg border border-border/70 bg-background p-3 space-y-2 text-sm">
                        <div className="text-xs font-medium">{t("accCompIntercompanyReconcileTitle")}</div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{t("accCompIntercompanyReconcileHint")}</p>
                        <Button type="button" size="sm" variant="secondary" onClick={() => void loadIntercompanyVatRecon()} disabled={intercompanyVatReconLoading}>
                          {intercompanyVatReconLoading ? t("loading") : t("accCompReloadReconcile")}
                        </Button>
                        {intercompanyVatRecon ? (
                          <div className="space-y-2 text-xs">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                              <div>{t("accCompIntercompanyIssued")}: <b>{intercompanyVatRecon.issuedCount.toLocaleString()}</b></div>
                              <div>{t("accCompIntercompanyMissing")}: <b>{intercompanyVatRecon.missingInStoreCount.toLocaleString()}</b></div>
                              <div>{t("accCompIntercompanyDiff")}: <b>{intercompanyVatRecon.diffCount.toLocaleString()}</b></div>
                              <div>{t("accCompIntercompanyMatched")}: <b>{intercompanyVatRecon.matchedCount.toLocaleString()}</b></div>
                            </div>
                            {intercompanyVatRecon.rows.length > 0 ? (
                              <div className="rounded border border-border/60 overflow-auto max-h-48">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b bg-muted/30">
                                      <th className="text-left p-2">{t("accCompColStatus")}</th>
                                      <th className="text-left p-2">{t("accCompPhInvoiceNo")}</th>
                                      <th className="text-right p-2">{t("accCompIntercompanyHqNet")}</th>
                                      <th className="text-right p-2">{t("accCompIntercompanyStoreNet")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {intercompanyVatRecon.rows.slice(0, 15).map((r, idx) => (
                                      <tr key={`${r.referenceNo}-${idx}`} className="border-b border-border/40">
                                        <td className="p-2">
                                          {r.status === "missing_in_store_input"
                                            ? t("accCompIntercompanyStatusMissing")
                                            : r.status === "extra_in_store_input"
                                              ? t("accCompIntercompanyStatusExtra")
                                              : t("accCompIntercompanyStatusDiff")}
                                        </td>
                                        <td className="p-2 font-mono">{r.referenceNo || "-"}</td>
                                        <td className="p-2 text-right">{r.hqIssuedNet.toLocaleString()}</td>
                                        <td className="p-2 text-right">{r.storeInputNet.toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-emerald-700 dark:text-emerald-300">{t("accCompIntercompanyOk")}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t("accCompIntercompanyAfterSearch")}</p>
                        )}
                      </div>
                      ) : hqSupplyReconcileApplicable === false ? (
                        <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border/60 px-3 py-2 leading-relaxed">
                          {t("accCompIntercompanyNotApplicable")}
                        </p>
                      ) : null}
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>
              ) : null}

              {!isEmbeddedPp36Section ? (
                            <p className="text-[11px] text-muted-foreground">{t("accCompPp30XlsxIncludesEfiling")}</p>
              ) : null}

              {!pp30Queried ? (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/15 py-10 px-4 text-center text-sm text-muted-foreground">
                  {isEmbeddedPp36Section ? t("accCompPp36EmbeddedSearchHint") : t("accCompPp30EmptySearchHint")}
                </div>
              ) : (
                <>
              {vatStoreNameGapsLoading ? (
                <p className="text-xs text-muted-foreground">{t("accCompStoreNameGapsLoading")}</p>
              ) : null}
              {vatStoreNameGaps && vatStoreNameGaps.emptyStoreNameRowCount > 0 ? (
                <div className="rounded-md border border-amber-300/80 bg-amber-50/90 dark:bg-amber-950/30 px-3 py-3 text-xs space-y-2">
                  <div className="font-medium text-amber-900 dark:text-amber-100">{t("accCompStoreNameGapsTitle")}</div>
                  <p className="text-amber-800/90 dark:text-amber-200/80 leading-relaxed whitespace-pre-line">
                    {tr(t, "accCompStoreNameGapsBody", {
                      count: String(vatStoreNameGaps.emptyStoreNameRowCount),
                      outVat: Math.round(vatStoreNameGaps.emptyStoreNameOutputVat).toLocaleString(),
                      inVat: Math.round(vatStoreNameGaps.emptyStoreNameInputVat).toLocaleString(),
                    })}
                  </p>
                  {storeFilterForLedger !== "All" ? (
                    <p className="text-amber-800/80 dark:text-amber-200/70">{t("accCompStoreNameGapsPerStoreNote")}</p>
                  ) : null}
                </div>
              ) : null}
              {!isEmbeddedPp36Section ? (
              <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
                {allowedPp30Views.includes("output") && (
                  <Button
                    type="button"
                    size="sm"
                    variant={pp30SubView === "output" ? "default" : "outline"}
                    onClick={() => setPp30SubView("output")}
                  >
                    {t("accCompTaxOutputDocs")}
                  </Button>
                )}
                {allowedPp30Views.includes("input") && (
                  <Button
                    type="button"
                    size="sm"
                    variant={pp30SubView === "input" ? "default" : "outline"}
                    onClick={() => setPp30SubView("input")}
                  >
                    {t("accCompTaxInputDocs")}
                  </Button>
                )}
                {canShowVatSettlement && (
                  <Button
                    type="button"
                    size="sm"
                    variant={pp30SubView === "settlement" ? "default" : "outline"}
                    onClick={() => setPp30SubView("settlement")}
                  >
                    {t("accCompVatSettlementShort")}
                  </Button>
                )}
                {allowedPp30Views.includes("wht") && (
                  <Button
                    type="button"
                    size="sm"
                    variant={pp30SubView === "wht" ? "default" : "outline"}
                    onClick={() => setPp30SubView("wht")}
                  >
                    {t("accCompTaxWhtDocs")}
                  </Button>
                )}
              </div>
              ) : null}
              {!isEmbeddedPp36Section ? (
              <div className="text-xs text-muted-foreground">
                {t("accCompPeriodType")}: {summaryPeriodLabel}
              </div>
              ) : null}

              {loading ? (
                <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
                  {t("loading")}
                </div>
              ) : null}
              {summaryLoading ? (
                <div className="rounded-md border border-border/40 bg-background px-3 py-2 text-[11px] text-muted-foreground" aria-live="polite">
                  {t("accCompSummaryLoading")}
                </div>
              ) : null}

              <>
              {pp30SubView === "output" && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      {t("accCompVatOutputNet")}: {Math.round(outputSummaryNet).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatOutputVat")}: {Math.round(outputSummaryVat).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatPayable")}: {Math.round(outputSummaryPayable).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatRowsSales")}: {nonPosOutputCount.toLocaleString()}
                      {posFilingOutputSummaries.length > 0
                        ? ` · ${tr(t, "accCompPosAutoFilingLinesNote", { n: posFilingOutputSummaries.length.toLocaleString() })}`
                        : ""}{" "}
                      / {t("accCompVatTotalRows")}: {vatFilteredStats.rowCount.toLocaleString()}
                    </div>
                    {isHeadOfficeLedgerStore ? (
                      <div className="md:col-span-2 text-[11px] text-muted-foreground">
                        {t("accCompHqPosOutputExcludedNote")}
                      </div>
                    ) : null}
                    <div>
                      {t("accCompMissingTin")}: {vatFilteredStats.missingTaxIdCount.toLocaleString()}
                    </div>
                    <div>
                      {t("accCompMissingInvoice")}: {vatFilteredStats.missingInvoiceCount.toLocaleString()}
                    </div>
                  </div>
                  {taxSummary && allowedPp30Views.includes("wht") ? (
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
                    <Button
                      type="button"
                      variant={vatOutputViewMode === "vendor" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVatOutputViewMode("vendor")}
                    >
                      {t("accCompVatByVendor")}
                    </Button>
                    <Button
                      type="button"
                      variant={vatOutputViewMode === "detail" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVatOutputViewMode("detail")}
                    >
                      {t("accCompVatByLine")}
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="p-2 overflow-x-auto space-y-3">
                      {posFilingOutputSummaries.length > 0 ? (
                        <div className="rounded-md border border-primary/25 bg-primary/5 p-3 space-y-2 text-xs">
                          <div className="font-medium text-foreground">{t("accCompPosSalesAutoTitle")}</div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {t("accCompPosSalesAutoDescription")}
                          </p>
                          <div className="space-y-2">
                            {posFilingOutputSummaries.map((row, sidx) => (
                              <div
                                key={`pos-sum-${row.tax_month}-${sidx}`}
                                className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 border rounded p-2 bg-background/80"
                              >
                                <div className="text-muted-foreground">{t("accCompLabelTaxMonth")}</div>
                                <div>{String(row.tax_month || "")}</div>
                                <div className="text-muted-foreground">{t("accCompLabelNetAmount")}</div>
                                <div className="text-right tabular-nums">{Number(row.net_amount || 0).toLocaleString()}</div>
                                <div className="text-muted-foreground">VAT</div>
                                <div className="text-right tabular-nums">{Number(row.vat_amount || 0).toLocaleString()}</div>
                                <div className="text-muted-foreground">{t("accCompLabelGrandTotal")}</div>
                                <div className="text-right tabular-nums font-medium">
                                  {Number(row.total_amount || 0).toLocaleString()}
                                </div>
                                <div className="col-span-2 sm:col-span-4 text-[10px] text-muted-foreground break-all">
                                  {String(row.memo || "")}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {nonPosOutputCount > 0 ? (
                        <div className="text-[11px] font-medium text-muted-foreground px-0.5">{t("accCompNonPosSalesEdit")}</div>
                      ) : null}
                      {vatOutputViewMode === "vendor" ? (
                        <div className="rounded-md border border-border/70 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/30">
                              <tr className="border-b border-border/70">
                                <th className="p-2 text-left">{t("accCompColVendorName")}</th>
                                <th className="p-2 text-right">{t("accCompColCount")}</th>
                                <th className="p-2 text-right">{t("accCompLabelNetAmount")}</th>
                                <th className="p-2 text-right">{t("accCompPhVat")}</th>
                                <th className="p-2 text-right">{t("accCompLabelGrandTotal")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vatOutputVendorSummaries.map((row) => (
                                <tr key={`vendor-sum-${row.name}`} className="border-b border-border/50">
                                  <td className="p-2">{row.name}</td>
                                  <td className="p-2 text-right tabular-nums">{row.count.toLocaleString()}</td>
                                  <td className="p-2 text-right tabular-nums">{Math.round(row.net).toLocaleString()}</td>
                                  <td className="p-2 text-right tabular-nums">{Math.round(row.vat).toLocaleString()}</td>
                                  <td className="p-2 text-right tabular-nums font-medium">{Math.round(row.total).toLocaleString()}</td>
                                </tr>
                              ))}
                              {!vatOutputVendorSummaries.length ? (
                                <tr>
                                  <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                                    {t("emp_result_empty")}
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                            {vatOutputVendorSummaries.length ? (
                              <tfoot className="bg-muted/20">
                                <tr className="border-t border-border/70 font-medium">
                                  <td className="p-2">{t("accCompTotalsFooter")}</td>
                                  <td className="p-2 text-right tabular-nums">
                                    {vatOutputVendorTotals.count.toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {Math.round(vatOutputVendorTotals.net).toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {Math.round(vatOutputVendorTotals.vat).toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {Math.round(vatOutputVendorTotals.total).toLocaleString()}
                                  </td>
                                </tr>
                              </tfoot>
                            ) : null}
                          </table>
                        </div>
                      ) : null}
                      {vatOutputViewMode === "detail" ? vatRows.map((row, idx) => {
                        if (row.direction !== "output") return null
                        if (ledgerStatusFilter !== "all" && row.filing_status !== ledgerStatusFilter) return null
                        if (isPosAutoVatOutputRow(row)) return null
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
                            <Select
                              value={row.invoice_evidence_status}
                              onValueChange={(v) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) =>
                                    i === idx
                                      ? {
                                          ...x,
                                          invoice_evidence_status: v as
                                            | "required_pending"
                                            | "received"
                                            | "not_required"
                                            | "unobtainable",
                                        }
                                      : x
                                  )
                                )
                              }
                            >
                              <SelectTrigger className="md:col-span-2">
                                <SelectValue placeholder="증빙 상태" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="required_pending">증빙미완료</SelectItem>
                                <SelectItem value="received">증빙완료</SelectItem>
                                <SelectItem value="not_required">증빙불요</SelectItem>
                                <SelectItem value="unobtainable">수취불가/신고제외</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              className="md:col-span-2"
                              placeholder="증빙 사유 코드 (small_amount, supplier_refused...)"
                              value={row.invoice_evidence_reason_code}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, invoice_evidence_reason_code: e.target.value } : x
                                  )
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
                                {t("accCompSubmittedAt")}: {formatBangkokDateTime(row.submitted_at)}
                                {row.submitted_by ? ` · ${t("accCompSubmittedBy")}: ${row.submitted_by}` : ""}
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
                      }) : null}
                      {!posFilingOutputSummaries.length &&
                      ((vatOutputViewMode === "vendor" && !vatOutputVendorSummaries.length) ||
                        (vatOutputViewMode === "detail" && !nonPosOutputCount)) ? (
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
                      {t("accCompVatInputNet")}: {Math.round(vatSettlement.inputNet).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatInputVat")}: {Math.round(vatSettlement.inputVat).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatPayable")}: {Math.round(vatSettlement.payableVat).toLocaleString()}
                    </div>
                    <div>
                      {t("accCompVatRowsPurchase")}: {vatInputRowsFiltered.length.toLocaleString()} / {t("accCompVatTotalRows")}:{" "}
                      {vatFilteredStats.rowCount.toLocaleString()}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs rounded-md border border-dashed border-border/70 bg-muted/10 p-2">
                    <div>
                      신고가능 매입VAT: <b>{Math.round(vatInputClaimable.claimableVat).toLocaleString()}</b>
                    </div>
                    <div>
                      증빙미완료 VAT: <b>{Math.round(vatInputClaimable.pendingVat).toLocaleString()}</b>
                    </div>
                    <div>
                      신고제외 VAT: <b>{Math.round(vatInputClaimable.unobtainableVat).toLocaleString()}</b>
                    </div>
                    <div>
                      체크 건수(완료/미완료/제외):{" "}
                      <b>
                        {vatInputClaimable.claimableCount}/{vatInputClaimable.pendingCount}/{vatInputClaimable.unobtainableCount}
                      </b>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{t("accCompInputVatFromExpenseHint")}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{t("accCompVatInputSourcesHint")}</p>
                  {taxSummary && allowedPp30Views.includes("wht") ? (
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={loading}
                      onClick={async () => {
                        if (!canUse) return
                        setLoading(true)
                        try {
                          const res = await apiFetch("/api/syncExpenseInputVatLedgers", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              userRole: role,
                              yearMonth: taxMonth,
                              storeFilter: storeFilterForApi !== "All" ? storeFilterForLedger : undefined,
                            }),
                          })
                          const j = (await res.json()) as {
                            success?: boolean
                            processed?: number
                            failed?: number
                            error?: string
                          }
                          if (!res.ok || !j.success) {
                            appAlert(j.error || t("accCompLoadFail"))
                            return
                          }
                          appAlert(
                            tr(t, "accCompInputVatBackfillToast", {
                              processed: String(j.processed ?? 0),
                              failedPart:
                                (j.failed ?? 0) > 0
                                  ? tr(t, "accCompInputVatBackfillToastFailed", { failed: String(j.failed ?? 0) })
                                  : "",
                            })
                          )
                          setPp30Queried(true)
                          await loadVat()
                        } catch {
                          appAlert(t("accCompLoadFail"))
                        } finally {
                          setLoading(false)
                        }
                      }}
                    >
                      {tr(t, "accCompInputVatBackfillButton", { month: taxMonth })}
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
                    <Button
                      type="button"
                      variant={vatInputViewMode === "vendor" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVatInputViewMode("vendor")}
                    >
                      {t("accCompVatByVendor")}
                    </Button>
                    <Button
                      type="button"
                      variant={vatInputViewMode === "detail" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVatInputViewMode("detail")}
                    >
                      {t("accCompVatByLine")}
                    </Button>
                  </div>
                  <Card>
                    <CardContent className="p-2 overflow-x-auto space-y-3">
                      {vatInputViewMode === "vendor" ? (
                        <div className="rounded-md border border-border/70 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/30">
                              <tr className="border-b border-border/70">
                                <th className="p-2 text-left">{t("accCompColVendorName")}</th>
                                <th className="p-2 text-right">{t("accCompColCount")}</th>
                                <th className="p-2 text-right">{t("accCompLabelNetAmount")}</th>
                                <th className="p-2 text-right">{t("accCompPhVat")}</th>
                                <th className="p-2 text-right">{t("accCompLabelGrandTotal")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {vatInputVendorSummaries.map((row) => (
                                <tr key={`vendor-input-sum-${row.name}`} className="border-b border-border/50">
                                  <td className="p-2">{row.name}</td>
                                  <td className="p-2 text-right tabular-nums">{row.count.toLocaleString()}</td>
                                  <td className="p-2 text-right tabular-nums">{Math.round(row.net).toLocaleString()}</td>
                                  <td className="p-2 text-right tabular-nums">{Math.round(row.vat).toLocaleString()}</td>
                                  <td className="p-2 text-right tabular-nums font-medium">{Math.round(row.total).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                            {vatInputVendorSummaries.length ? (
                              <tfoot className="bg-muted/20">
                                <tr className="border-t border-border/70 font-medium">
                                  <td className="p-2">{t("accCompTotalsFooter")}</td>
                                  <td className="p-2 text-right tabular-nums">
                                    {vatInputVendorTotals.count.toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {Math.round(vatInputVendorTotals.net).toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {Math.round(vatInputVendorTotals.vat).toLocaleString()}
                                  </td>
                                  <td className="p-2 text-right tabular-nums">
                                    {Math.round(vatInputVendorTotals.total).toLocaleString()}
                                  </td>
                                </tr>
                              </tfoot>
                            ) : null}
                          </table>
                        </div>
                      ) : null}
                      {vatInputViewMode === "detail" ? vatRows.map((row, idx) => {
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
                            <Select
                              value={row.invoice_evidence_status}
                              onValueChange={(v) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) =>
                                    i === idx
                                      ? {
                                          ...x,
                                          invoice_evidence_status: v as
                                            | "required_pending"
                                            | "received"
                                            | "not_required"
                                            | "unobtainable",
                                        }
                                      : x
                                  )
                                )
                              }
                            >
                              <SelectTrigger className="md:col-span-2">
                                <SelectValue placeholder="증빙 상태" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="required_pending">증빙미완료</SelectItem>
                                <SelectItem value="received">증빙완료</SelectItem>
                                <SelectItem value="not_required">증빙불요</SelectItem>
                                <SelectItem value="unobtainable">수취불가/신고제외</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              className="md:col-span-2"
                              placeholder="증빙 사유 코드 (small_amount, supplier_refused...)"
                              value={row.invoice_evidence_reason_code}
                              onChange={(e) =>
                                setVatRows((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, invoice_evidence_reason_code: e.target.value } : x
                                  )
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
                                {t("accCompSubmittedAt")}: {formatBangkokDateTime(row.submitted_at)}
                                {row.submitted_by ? ` · ${t("accCompSubmittedBy")}: ${row.submitted_by}` : ""}
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
                      }) : null}
                      {(vatInputViewMode === "vendor" && !vatInputVendorSummaries.length) ||
                      (vatInputViewMode === "detail" && !vatInputRowsFiltered.length) ? (
                        <div className="p-6 text-center text-muted-foreground text-xs">{t("emp_result_empty")}</div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )}

              {pp30SubView === "settlement" && (
                <div className="space-y-3 text-sm">
                  <div className={cn("sticky top-0 z-10 rounded-md border p-4 backdrop-blur-sm", vatSettlementHeadline.className)}>
                    <div className="text-xs text-muted-foreground">{t("accCompVatExpectedForMonth")}</div>
                    <div className="mt-1 flex flex-wrap items-end gap-2">
                      <span className="text-3xl md:text-4xl font-bold tabular-nums">
                        {Math.round(Math.abs(vatSettlement.payableVat)).toLocaleString()}
                      </span>
                      <span className="text-sm font-medium text-muted-foreground pb-1">THB</span>
                    </div>
                    <div className="text-xs mt-1">
                      {tr(t, "accCompVatSettlementFormulaLine", { tone: vatSettlementHeadline.tone })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="rounded-md border border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3">
                      <div className="text-xs text-muted-foreground">{t("accCompVatOutputVatSumLabel")}</div>
                      <div className="text-lg font-semibold tabular-nums">{Math.round(vatSettlement.outputVat).toLocaleString()}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {tr(t, "accCompVatNetAndRows", {
                          net: Math.round(vatSettlement.outputNet).toLocaleString(),
                          count: vatSettlement.outputCount.toLocaleString(),
                        })}
                      </div>
                    </div>
                    <div className="rounded-md border border-sky-300/40 bg-sky-50/40 dark:bg-sky-950/20 p-3">
                      <div className="text-xs text-muted-foreground">{t("accCompVatInputVatSumLabel")}</div>
                      <div className="text-lg font-semibold tabular-nums">{Math.round(vatSettlement.inputVat).toLocaleString()}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {tr(t, "accCompVatNetAndRows", {
                          net: Math.round(vatSettlement.inputNet).toLocaleString(),
                          count: vatSettlement.inputCount.toLocaleString(),
                        })}
                      </div>
                    </div>
                    <div
                      className={cn(
                        "rounded-md border p-3",
                        vatSettlement.payableVat >= 0
                          ? "border-rose-300/40 bg-rose-50/40 dark:bg-rose-950/20"
                          : "border-violet-300/40 bg-violet-50/40 dark:bg-violet-950/20"
                      )}
                    >
                      <div className="text-xs text-muted-foreground">{t("accCompVatExpectedPayableCreditLabel")}</div>
                      <div className="text-lg font-semibold tabular-nums">
                        {Math.round(Math.abs(vatSettlement.payableVat)).toLocaleString()}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {vatSettlement.payableVat >= 0 ? t("accCompVatPayableDueShort") : t("accCompVatCreditCarryoverShort")}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-border/70 bg-muted/10 p-3 text-xs space-y-2">
                    <div className="font-medium text-foreground">{t("accCompVatCalcFormulaTitle")}</div>
                    <div className="tabular-nums">
                      {tr(t, "accCompVatCalcFormulaDetail", {
                        out: Math.round(vatSettlement.outputVat).toLocaleString(),
                        inp: Math.round(vatSettlement.inputVat).toLocaleString(),
                        payable: Math.round(vatSettlement.payableVat).toLocaleString(),
                      })}
                    </div>
                    <div className="text-muted-foreground">{t("accCompVatCalcDisclaimer")}</div>
                  </div>

                  {taxSummary ? (
                    <div className="rounded-md border border-dashed border-border/70 bg-background p-3 text-xs">
                      <span className="text-muted-foreground">{t("accCompVatSummaryApiNote")}</span>{" "}
                      <span className="font-medium tabular-nums">{Math.round(vatSettlement.summaryPayableVat).toLocaleString()}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {pp30SubView === "wht" && (
                <div className="space-y-3 text-sm">
                  {showWhtLedger ? (
                    <>
                      {pp30Mode !== "wht_only" ? (
                        <StoreVendorTaxLinkBanner
                          t={t}
                          tr={tr}
                          loading={taxLinkMetaLoading}
                          storeFilter={storeFilterForLedger}
                          isOffice={isOffice}
                          storeLinkEval={pp30StoreLinkEval}
                          vendorLinkCounts={pp30VendorLinkCounts}
                          onOpenStoreProfiles={onOpenStoreProfiles}
                          extra={
                            whtPayeeTinGapCount > 0 ? (
                              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive leading-relaxed">
                                {tr(t, "accCompWhtPayeeTinGapLine", { count: String(whtPayeeTinGapCount) })}
                              </div>
                            ) : null
                          }
                        />
                      ) : whtPayeeTinGapCount > 0 ? (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive leading-relaxed">
                          {tr(t, "accCompWhtPayeeTinGapLine", { count: String(whtPayeeTinGapCount) })}
                        </div>
                      ) : null}
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
                    </>
                  ) : null}
                  {showPnd1Area ? (
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
                          placeholder={lang === "th" ? "ชื่อนิติบุคคลผู้จ่าย" : t("accCompPnd1PayerLegalNamePlaceholder")}
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
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {showWhtLedger ? (
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
                    ) : null}
                    {showWhtLedger ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a
                          href={whtExportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("accCompWhtExportCsv")}
                        </a>
                      </Button>
                    ) : null}
                    {showWhtLedger ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void printWhtCertificates(whtRowsFiltered)}
                        disabled={!whtRowsFiltered.some((r) => Number(r.wht_amount) > 0)}
                      >
                        <Printer className="h-4 w-4 mr-1" />
                        {t("whtCertPrintBulk")}
                      </Button>
                    ) : null}
                    {showPnd1Area ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a
                          href={pnd1RdPrepUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {pnd1RdPrepBtnLabel}
                        </a>
                      </Button>
                    ) : null}
                    {showPnd353Tools ? (
                      <Select
                        value={whtSubmissionFormHint}
                        onValueChange={(v) => setWhtSubmissionFormHint(v as "PND3" | "PND53" | "ALL")}
                      >
                        <SelectTrigger className="h-9 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">PND3/53 전체</SelectItem>
                          <SelectItem value="PND3">PND3</SelectItem>
                          <SelectItem value="PND53">PND53</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                    {showPnd353Tools ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a href={whtSubmissionExportUrl} target="_blank" rel="noopener noreferrer">
                          신고 제출형 CSV
                        </a>
                      </Button>
                    ) : null}
                    {showPnd1Area ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void runPnd1Validation()}
                        disabled={pnd1Validating}
                      >
                        {pnd1Validating ? t("loading") : pnd1ValidateBtnLabel}
                      </Button>
                    ) : null}
                    {showPnd353Tools ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void runPnd353Validation()}
                        disabled={pnd353Validating}
                      >
                        {pnd353Validating ? t("loading") : "PND3/53 검증"}
                      </Button>
                    ) : null}
                    {showPnd1Area ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void runPayrollTinGapCheck()}
                        disabled={payrollTinGapLoading}
                      >
                        {payrollTinGapLoading ? t("loading") : lang === "th" ? "ตรวจสอบ TIN พนักงาน" : t("accCompPayrollTinCheckBtn")}
                      </Button>
                    ) : null}
                  </div>
                  {showPnd353Tools && pnd353ValidationResult ? (
                    <div className="rounded-md border border-border/70 bg-muted/10 p-3 text-xs space-y-1">
                      <div className="font-medium">PND3/53 검증 결과</div>
                      <div>검증 행: {pnd353ValidationResult.totalRows.toLocaleString()}</div>
                      <div>정상 행: {pnd353ValidationResult.validRows.toLocaleString()}</div>
                      <div>경고 건수: {(pnd353ValidationResult.issues || []).length.toLocaleString()}</div>
                    </div>
                  ) : null}
                  {(showPp36Ledger || showPnd54Ledger) ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {showPp36Ledger ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">PP.36 원장</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setPp36Rows((prev) => [...prev, emptyPp36(taxMonth, storeTb !== "All" ? storeTb : "")])}>
                            <Plus className="h-3 w-3 mr-1" /> 행 추가
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => void loadPp36()}>조회</Button>
                          <Button type="button" size="sm" variant="outline" asChild>
                            <a href={pp36ExportUrl} target="_blank" rel="noopener noreferrer">CSV</a>
                          </Button>
                        </div>
                        {(pp36Rows || []).slice(0, 20).map((row, idx) => (
                          <div key={row.id ?? `pp36-${idx}`} className="grid grid-cols-2 gap-2 rounded border p-2">
                            <Input type="date" value={row.doc_date} onChange={(e) => setPp36Rows((prev) => prev.map((x, i) => i === idx ? { ...x, doc_date: e.target.value } : x))} />
                            <Input placeholder="Supplier" value={row.supplier_name} onChange={(e) => setPp36Rows((prev) => prev.map((x, i) => i === idx ? { ...x, supplier_name: e.target.value } : x))} />
                            <Input placeholder="Taxable" value={row.taxable_amount} onChange={(e) => setPp36Rows((prev) => prev.map((x, i) => i === idx ? { ...x, taxable_amount: e.target.value } : x))} />
                            <Input placeholder="VAT" value={row.vat_amount} onChange={(e) => setPp36Rows((prev) => prev.map((x, i) => i === idx ? { ...x, vat_amount: e.target.value } : x))} />
                            <div className="col-span-2 flex gap-2 justify-end">
                              <Button type="button" size="sm" onClick={() => void savePp36Row(row)}>{t("accCompSave")}</Button>
                              <Button type="button" size="sm" variant="destructive" onClick={() => void removePp36(row)}>{t("accCompDelete")}</Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    ) : null}
                    {showPnd54Ledger ? (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">PND54 원장</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setPnd54Rows((prev) => [...prev, emptyPnd54(taxMonth, storeTb !== "All" ? storeTb : "")])}>
                            <Plus className="h-3 w-3 mr-1" /> 행 추가
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => void loadPnd54()}>조회</Button>
                          <Button type="button" size="sm" variant="outline" asChild>
                            <a href={pnd54ExportUrl} target="_blank" rel="noopener noreferrer">CSV</a>
                          </Button>
                        </div>
                        {(pnd54Rows || []).slice(0, 20).map((row, idx) => (
                          <div key={row.id ?? `pnd54-${idx}`} className="grid grid-cols-2 gap-2 rounded border p-2">
                            <Input type="date" value={row.payment_date} onChange={(e) => setPnd54Rows((prev) => prev.map((x, i) => i === idx ? { ...x, payment_date: e.target.value } : x))} />
                            <Input placeholder="Payee" value={row.payee_name} onChange={(e) => setPnd54Rows((prev) => prev.map((x, i) => i === idx ? { ...x, payee_name: e.target.value } : x))} />
                            <Input placeholder="Gross" value={row.gross_amount} onChange={(e) => setPnd54Rows((prev) => prev.map((x, i) => i === idx ? { ...x, gross_amount: e.target.value } : x))} />
                            <Input placeholder="WHT" value={row.wht_amount} onChange={(e) => setPnd54Rows((prev) => prev.map((x, i) => i === idx ? { ...x, wht_amount: e.target.value } : x))} />
                            <div className="col-span-2 flex gap-2 justify-end">
                              <Button type="button" size="sm" onClick={() => void savePnd54Row(row)}>{t("accCompSave")}</Button>
                              <Button type="button" size="sm" variant="destructive" onClick={() => void removePnd54(row)}>{t("accCompDelete")}</Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                    ) : null}
                  </div>
                  ) : null}
                  {showPnd1Area ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground space-y-1">
                    <div className="font-medium text-foreground/90">{pnd1RdPrepGuideTitle}</div>
                    <p>{pnd1RdPrepGuideNote}</p>
                    <a
                      href="https://flowaccount.com/blog/rd-prep-pnd1/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary underline"
                    >
                      {t("accCompFlowRdPrepExample")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  ) : null}
                  {showPnd1Area && payrollTinGapResult ? (
                    <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-medium">
                          {lang === "th" ? "ผลตรวจ TIN พนักงาน (รายเดือน)" : t("accCompPayrollTinGapTitleMonthly")}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPayrollTinGapResult(null)}
                        >
                          {lang === "th" ? "ล้างผลลัพธ์" : t("accCompPayrollTinGapClearResult")}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div>
                          {lang === "th" ? "แถวเงินเดือนรวม" : t("accCompPayrollStatWhtRows")}:{" "}
                          {payrollTinGapResult.payrollRowCount.toLocaleString()}
                        </div>
                        <div>
                          {lang === "th" ? "แถวที่ TIN หาย" : t("accCompPayrollStatTinMissingRows")}:{" "}
                          {payrollTinGapResult.gapRowCount.toLocaleString()}
                        </div>
                        <div>
                          {lang === "th" ? "พนักงานที่ได้รับผลกระทบ" : t("accCompPayrollStatImpactedEmployees")}:{" "}
                          {payrollTinGapResult.uniqueEmployeeCount.toLocaleString()}
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded border border-border/60">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left p-2">{t("month")}</th>
                              <th className="text-left p-2">{t("accCompPayrollGapColPayDate")}</th>
                              <th className="text-left p-2">{t("accCompPayrollGapColStore")}</th>
                              <th className="text-left p-2">{t("accCompPayrollGapColEmployeeName")}</th>
                              <th className="text-right p-2">{t("accCompPayrollGapColWht")}</th>
                              <th className="text-left p-2">{t("accCompPayrollGapColCertNo")}</th>
                              <th className="text-right p-2">{t("accCompColAction")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payrollTinGapResult.gaps.slice(0, 200).map((row, i) => (
                              <tr key={`${row.id ?? 'gap'}-${i}`} className="border-b border-border/40">
                                <td className="p-2">{row.taxMonth || '-'}</td>
                                <td className="p-2">{row.paymentDate || '-'}</td>
                                <td className="p-2">{row.storeName || '-'}</td>
                                <td className="p-2">{row.payeeName || '-'}</td>
                                <td className="p-2 text-right">{row.whtAmount.toLocaleString()}</td>
                                <td className="p-2">{row.certificateNo || '-'}</td>
                                <td className="p-2 text-right">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={!row.id}
                                    onClick={() => jumpToWhtLedgerRow(row.id)}
                                  >
                                    {pnd1GoLedgerBtnLabel}
                                  </Button>
                                </td>
                              </tr>
                            ))}
                            {!payrollTinGapResult.gaps.length ? (
                              <tr>
                                <td colSpan={7} className="p-4 text-center text-muted-foreground">
                                  {lang === "th" ? "ไม่พบพนักงานที่ TIN หาย" : t("accCompPayrollNoTinGaps")}
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {showPnd1Area && pnd1ValidationResult ? (
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
                              <span>{lang === "th" ? "ทั้งหมด" : t("all")}</span>
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
                                  {lang === "th" ? "ไม่พบข้อมูล" : t("accCompPnd1ValidationNoIssues")}
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  {showWhtLedger ? (
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
                          <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground justify-center">
                            <span>
                              {row.direction === "inbound"
                                ? t("whtDirectionInbound")
                                : t("whtDirectionOutbound")}
                            </span>
                            {row.source_type ? (
                              <span className="truncate" title={row.source_type}>
                                {row.source_type}
                              </span>
                            ) : null}
                          </div>
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
                              {t("accCompSubmittedAt")}: {formatBangkokDateTime(row.submitted_at)}
                              {row.submitted_by ? ` · ${t("accCompSubmittedBy")}: ${row.submitted_by}` : ""}
                            </div>
                          ) : null}
                          <div className="flex gap-2 md:col-span-4">
                            <Button type="button" size="sm" onClick={() => void saveWhtRow(row)}>
                              <Save className="h-3 w-3 mr-1" />
                              {t("accCompSave")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!(Number(row.wht_amount) > 0)}
                              onClick={() => void printWhtCertificates([row])}
                            >
                              <Printer className="h-3 w-3 mr-1" />
                              {t("whtCertPrint")}
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
                  ) : null}
                </div>
              )}
                </>
                </>
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
            <Button
              type="button"
              variant="outline"
              disabled={!citData || loading || citPdfExporting || !citPdfValidation.isValid}
              onClick={() => void exportCitPdf()}
            >
              <Download className="h-4 w-4 mr-1" />
              {citPdfExporting ? t("pL_exportBusy") : t("accCompCitPackagePdf")}
            </Button>
          </div>
          {citData && citPdfValidation.warnings.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              {citPdfValidation.warnings
                .map((c) => resolveCitPdfCodeLabel("accCompCitPdfWarn_", c))
                .join(" / ")}
            </div>
          ) : null}
          {citPdfHint ? (
            <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {citPdfHint}
            </div>
          ) : null}
          <StoreVendorTaxLinkBanner
            t={t}
            tr={tr}
            loading={taxLinkMetaLoading}
            storeFilter={storeFilterForLedger}
            isOffice={isOffice}
            storeLinkEval={pp30StoreLinkEval}
            vendorLinkCounts={pp30VendorLinkCounts}
            onOpenStoreProfiles={onOpenStoreProfiles}
            showProfileShortcut
            extra={
              citKt20kTinMissing ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
                  {t("accCompCitKt20kTinMissing")}
                </div>
              ) : null
            }
          />
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
              <div>
                신고폼: {String(citData?.pdfMeta?.formCode || citData?.filingForm || "-").toUpperCase()}
              </div>
              <div>
                {t("accCompCitProjectedAnnualTaxableIncome")}: {(citData?.projectedAnnualTaxableIncome || 0).toLocaleString()}
              </div>
              <div>
                {t("accCompCitFilingTaxDue")}: {(citData?.filingTaxDue || 0).toLocaleString()}
              </div>
              <div>
                {t("accCompCitPdfPeriod")}: {citData?.pdfMeta?.periodLabel || citData?.periodKey || "-"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">세무조정(가산/차감) 초안</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCitAdjustmentsDraft((prev) => [
                      ...prev,
                      { adjustmentType: "add_back", itemName: "", amount: "", memo: "" },
                    ])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  행 추가
                </Button>
                <Button type="button" size="sm" onClick={() => void saveCitAdjustmentsDraft()}>
                  {t("accCompSave")}
                </Button>
              </div>
              {(citAdjustmentsDraft || []).map((row, idx) => (
                <div key={`cit-adj-${idx}`} className="grid grid-cols-1 md:grid-cols-5 gap-2 rounded border p-2">
                  <Select
                    value={row.adjustmentType}
                    onValueChange={(v) =>
                      setCitAdjustmentsDraft((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, adjustmentType: v as "add_back" | "deduction" } : x))
                      )
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add_back">Add-back</SelectItem>
                      <SelectItem value="deduction">Deduction</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="항목명"
                    value={row.itemName}
                    onChange={(e) =>
                      setCitAdjustmentsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, itemName: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="금액"
                    value={row.amount}
                    onChange={(e) =>
                      setCitAdjustmentsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="메모"
                    value={row.memo}
                    onChange={(e) =>
                      setCitAdjustmentsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, memo: e.target.value } : x)))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setCitAdjustmentsDraft((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    {t("accCompDelete")}
                  </Button>
                </div>
              ))}
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
              {!ssoQueried ? (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/15 py-8 px-4 text-center text-sm text-muted-foreground">
                  {t("accCompSsoEmptySearchHint")}
                </div>
              ) : null}
              <div className="rounded-md border border-border/70 bg-muted/20 p-3 space-y-2">
                <div className="text-xs font-medium">{t("accCompSsoStep1Title")}</div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ssoOnlineEnabled}
                    onChange={(e) => setSsoOnlineEnabled(e.target.checked)}
                  />
                  {t("accCompSsoStep1ChecklistOnline")}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ssoEmployeeRegReady}
                    onChange={(e) => setSsoEmployeeRegReady(e.target.checked)}
                  />
                  {t("accCompSsoStep1ChecklistEmployment")}
                </label>
                <div className="text-[11px] text-muted-foreground">
                  {t("accCompColStatus")}: {ssoStep1Ready ? t("accCompWorkflowStatusDone") : t("accCompNotCompleted")}
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
                <div className="shrink-0">
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompSsoFilingWageMode")}</div>
                  <Select
                    value={ssoFilingWageMode}
                    onValueChange={(v) => setSsoFilingWageMode(v as SsoFilingWageMode)}
                  >
                    <SelectTrigger className="h-9 w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contributable">{t("accCompSsoFilingWageContributable")}</SelectItem>
                      <SelectItem value="gross">{t("accCompSsoFilingWageGross")}</SelectItem>
                      <SelectItem value="basic">{t("accCompSsoFilingWageBasic")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {!externalFiling ? (
                  <Button
                    type="button"
                    variant="default"
                    className={ssoSearchBtnClass}
                    onClick={() => void runSsoSearch()}
                    disabled={ssoPayrollLoading}
                  >
                    {ssoPayrollLoading ? t("loading") : t("search")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="default"
                  onClick={() => void exportEserviceBulkFromPayroll()}
                  disabled={ssoPayrollExporting || !ssoQueried || !ssoStep1Ready || !ssoStep2Ready}
                  title={t("accCompSsoEserviceBulkHint")}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {ssoPayrollExporting ? t("loading") : t("accCompSsoEserviceBulkFromPayroll")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void exportSps110FromPayroll()}
                  disabled={ssoPayrollExporting || !ssoQueried || !ssoStep1Ready || !ssoStep2Ready}
                  title={t("accCompSsoSps110Hint")}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {ssoPayrollExporting ? t("loading") : t("accCompSsoSps110FromPayroll")}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href="https://www.sso.go.th/eservices" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {t("accCompSsoOpenSsoSite")}
                  </a>
                </Button>
              </div>
              {ssoQueried ? (
                <>
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium">{t("accCompSsoStep2Title")}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t("accCompMonth")}: {taxMonth} / {t("store")}: {ssoSelectedStore || t("accCompAll")} /{" "}
                  {t("accCompLoadTime")}:{" "}
                  {ssoPayrollLoadedAt ? formatBangkokDateTime(ssoPayrollLoadedAt) : "-"}
                </div>
                {ssoPayrollLoading ? (
                  <div className="text-xs text-muted-foreground">{t("loading")}</div>
                ) : ssoPayrollPreview ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                    <div>{t("accCompSsoTargetEmployees")}: {ssoPayrollPreview.rowCount.toLocaleString()}</div>
                    <div>{t("accCompSsoStoreCount")}: {ssoPayrollPreview.storeCount.toLocaleString()}</div>
                    <div>{t("accCompSsoEmployeeContribution")}: {Math.round(ssoPayrollPreview.totalEmployeeSso).toLocaleString()}</div>
                    <div>{t("accCompSsoEmployerContribution")}: {Math.round(ssoPayrollPreview.totalEmployerSso).toLocaleString()}</div>
                    <div>{t("accCompSsoTotalContribution")}: {Math.round(ssoPayrollPreview.totalContribution).toLocaleString()}</div>
                    <div>{t("accCompSsoMissingCitizenId")}: {ssoPayrollPreview.missingCitizenIdCount.toLocaleString()}</div>
                    <div>{t("accCompSsoMissingMemberNo")}: {ssoPayrollPreview.missingSsoMemberNoCount.toLocaleString()}</div>
                    <div>{t("accCompColStatus")}: {ssoStep2Ready ? t("accCompWorkflowStatusDone") : t("accCompNoTarget")}</div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{t("accCompSsoSnapshotNotLoaded")}</div>
                )}
                {ssoEmployeePreviewRows.length > 0 ? (
                  <div className="space-y-2 pt-2">
                    <div className="text-xs font-medium">{t("accCompSsoEmployeeListTitle")}</div>
                    {ssoPayrollRows.length > ssoEmployeePreviewRows.length ? (
                      <p className="text-[11px] text-muted-foreground">
                        {tr(t, "accCompSsoEmployeeListTruncated", {
                          shown: String(ssoEmployeePreviewRows.length),
                          total: String(ssoPayrollRows.length),
                        })}
                      </p>
                    ) : null}
                    <div className="rounded border border-border/60 overflow-auto max-h-72">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            <th className="text-left p-2 font-medium">{t("store")}</th>
                            <th className="text-left p-2 font-medium">{t("accCompSsoColEmployeeName")}</th>
                            <th className="text-left p-2 font-medium">{t("accCompSsoColCitizenId")}</th>
                            <th className="text-left p-2 font-medium">{t("accCompSsoColMemberNo")}</th>
                            <th className="text-right p-2 font-medium">{t("accCompSsoEmployeeContribution")}</th>
                            <th className="text-right p-2 font-medium">{t("accCompSsoEmployerContribution")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ssoEmployeePreviewRows.map((row, idx) => {
                            const store = String(row.store || "").trim() || "-"
                            const name = String(row.name || "").trim() || "-"
                            const idNumber = String(row.idNumber || "").trim() || "-"
                            const memberNo = String(row.ssoMemberNo || "").trim() || "-"
                            const empSso = Math.round(asNum(row.sso))
                            const erSso = Math.round(asNum(row.employerSso))
                            const rowKey = `${store}-${idNumber}-${memberNo}-${idx}`
                            return (
                              <tr key={rowKey} className="border-b border-border/40">
                                <td className="p-2 font-mono text-[11px]">{store}</td>
                                <td className="p-2">{name}</td>
                                <td className="p-2 font-mono text-[11px]">{idNumber}</td>
                                <td className="p-2 font-mono text-[11px]">{memberNo}</td>
                                <td className="p-2 text-right tabular-nums">{empSso.toLocaleString()}</td>
                                <td className="p-2 text-right tabular-nums">{erSso.toLocaleString()}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : ssoPayrollPreview && ssoPayrollPreview.rowCount === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("accCompSsoPayrollEmpty")}</p>
                ) : null}
              </div>
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium">{t("accCompSsoStep3Title")}</div>
                <div className="text-[11px] text-muted-foreground whitespace-pre-line">
                  {t("accCompSsoStep3Guide")}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void runSsoAccountingSync()}
                    disabled={
                      ssoAccountingSyncing ||
                      ssoSubmissionSaving ||
                      !ssoQueried ||
                      !ssoStep2Ready
                    }
                  >
                    {ssoAccountingSyncing ? t("loading") : t("accCompSsoAccountingSyncBtn")}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("accCompColStatus")}: {ssoStep3Ready ? t("accCompReady") : t("accCompNeedsPreparation")}
                </div>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="text-xs font-medium">{t("accCompSsoStep4Title")}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t("accCompSsoStep4Guide")}
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{t("accCompEvidenceMemo")}</div>
                  <Textarea
                    rows={2}
                    value={ssoSubmissionMemo}
                    onChange={(e) => setSsoSubmissionMemo(e.target.value)}
                    placeholder={t("accCompSsoSubmissionMemoPlaceholder")}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{t("accCompEvidenceAttachmentUrls")}</div>
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
                      {tr(t, "accCompSsoAttachmentListTitle", {
                        count: ssoAttachmentUrls.length.toLocaleString(),
                      })}
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
                                t("msg_delete_confirm_check_item") || t("accCompDeleteEvidenceLinkConfirm")
                              )
                              if (!ok) return
                              const next = ssoAttachmentUrls.filter((x) => x !== u)
                              setSsoAttachmentInput(next.join("\n"))
                            }}
                          >
                            {t("accCompDelete")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{t("accCompDirectUploadGuide")}</div>
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
                    <div className="text-[11px] text-muted-foreground">{t("accCompUploading")}</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void markSsoSubmissionDone()}
                    disabled={!ssoStep1Ready || !ssoStep2Ready || ssoSubmissionSaving || !canApproveCompliance}
                  >
                    {ssoSubmissionSaving ? t("loading") : t("accCompMarkSsoSubmissionDone")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t("accCompCurrentStatus")}: {ssoStep4Ready ? t("accCompWorkflowStatusDone") : t("accCompNotCompleted")}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("accCompSubmittedAt")}: {formatBangkokDateTime(String(ssoWorkflowRow?.updated_at || ""))}
                  {ssoWorkflowRow?.updated_by ? ` · ${t("accCompSubmittedBy")}: ${ssoWorkflowRow.updated_by}` : ""}
                </div>
                {ssoWorkflowMeta?.memo ? (
                  <div className="text-[11px] text-muted-foreground">{t("memo")}: {ssoWorkflowMeta.memo}</div>
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
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("accCompSsoColumnGuideTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto pt-0">
              <p className="text-[11px] text-muted-foreground mb-2">{t("accCompSsoColumnGuideNote")}</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2 font-medium">ไทย</th>
                    <th className="text-left p-2 font-medium">{t("accCompEnglish")}</th>
                  </tr>
                </thead>
                <tbody>
                  {SSO_ESERVICE_BULK_COLUMN_HELP.map((c) => (
                    <tr key={c.labelTh} className="border-b border-border/50">
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
              <CardTitle className="text-base">{t("accCompKt20kTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {lang === "th" ? "โครง UI และสรุปข้อมูลรายเดือนสำหรับ KT20K (MVP)" : t("accCompKt20kMvpScaffoldNote")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
                <Input
                  placeholder={lang === "th" ? "เลขผู้เสียภาษีบริษัท" : t("accCompKt20kPhCompanyTaxId")}
                  value={kt20kEmployer.companyTaxId}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, companyTaxId: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  className="lg:col-span-2"
                  placeholder={lang === "th" ? "ชื่อบริษัท" : t("accCompKt20kPhCompanyName")}
                  value={kt20kEmployer.companyName}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, companyName: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "สำนักงานประกันสังคม (จังหวัด)" : t("accCompKt20kPhSsoProvince")}
                  value={kt20kEmployer.ssoProvince}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, ssoProvince: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "เบอร์โทรสำนักงานประกันสังคม" : t("accCompKt20kPhSsoPhone")}
                  value={kt20kEmployer.ssoPhone}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, ssoPhone: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "รหัสกิจการ 5 หลัก" : t("accCompKt20kPhBusinessCode5")}
                  value={kt20kEmployer.businessCode5}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, businessCode5: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={lang === "th" ? "อัตราเงินสมทบ %" : t("accCompKt20kPhFundRatePercent")}
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
                  {kt20kSettingsSaving ? t("loading") : lang === "th" ? "บันทึกการตั้งค่า" : t("accCompKt20kSaveSettings")}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={kt20kExportUrl} target="_blank" rel="noopener noreferrer">
                    {lang === "th" ? "ส่งออก CSV" : t("accCompVatExport")}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {lang === "th" ? "สรุปรายเดือน (ม.ค.-ธ.ค.)" : t("accCompKt20kMonthlySummaryTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[980px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-2">{t("month")}</th>
                    <th className="text-right p-2">{t("accCompKt20kEmployees")}</th>
                    <th className="text-right p-2">{t("accCompKt20kSalary")}</th>
                    <th className="text-right p-2">{t("accCompKt20kDailyWage")}</th>
                    <th className="text-right p-2">{t("accCompKt20kOtherComp")}</th>
                    <th className="text-right p-2">{t("accCompKt20kTotalWage1")}</th>
                    <th className="text-right p-2">{t("accCompKt20kExcessOver20k2")}</th>
                    <th className="text-right p-2">{t("accCompKt20kNetWage3")}</th>
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
                      <td className="p-2">{t("annual")}</td>
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
                  {lang === "th" ? "ยังไม่มีข้อมูล" : t("accCompKt20kNoData")}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className={cn(tabsContentClass, "space-y-3")}>
          <div className="text-[11px] text-muted-foreground">{t("accCompWorkflowPermissionNote")}</div>
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
              {t("accCompWorkflowPeriodKeyFallback")}
            </div>
          ) : null}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("accCompFilingCalendarTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="text-muted-foreground">
                {tr(t, "accCompFilingCalendarIntro", { month: taxMonth, store: storeTb })}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700">
                  {t("accCompReminderSeverityCritical")} {Number(workflowReminderSummary?.critical || 0).toLocaleString()}
                </span>
                <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700">
                  {t("accCompReminderSeverityWarn")} {Number(workflowReminderSummary?.warn || 0).toLocaleString()}
                </span>
                <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-700">
                  {t("accCompReminderSeverityInfo")} {Number(workflowReminderSummary?.info || 0).toLocaleString()}
                </span>
              </div>
              {workflowReminderRows.length ? (
                <div className="rounded border border-border/60 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-1.5">{t("accCompReminderColSeverity")}</th>
                        <th className="text-left p-1.5">{t("accCompReminderColFiling")}</th>
                        <th className="text-left p-1.5">{t("accCompReminderColPeriodMonth")}</th>
                        <th className="text-left p-1.5">{t("accCompReminderColDueBangkok")}</th>
                        <th className="text-left p-1.5">{t("accCompReminderColStatus")}</th>
                        <th className="text-left p-1.5">{t("accCompReminderColMessage")}</th>
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
                              {r.severity === "critical"
                                ? t("accCompReminderSeverityCritical")
                                : r.severity === "warn"
                                  ? t("accCompReminderSeverityWarn")
                                  : t("accCompReminderSeverityInfo")}
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
                <div className="text-muted-foreground">{t("accCompReminderEmpty")}</div>
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
