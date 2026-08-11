"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
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
  getExportPnd53RdFilingTxtUrl,
  getExportPp30RdPrepTxtUrl,
  getExportPp36LedgerCsvUrl,
  getExportPnd54LedgerCsvUrl,
  getExportPnd1RdPrepTxtUrl,
  validatePnd1RdPrep,
  validatePnd3Pnd53,
  saveCorporateTaxAdjustments,
  getPayrollWhtTinGaps,
  getPnd91AnnualSummary,
  getExportPnd91AnnualCsvUrl,
  type Pnd91AnnualSummaryResult,
  type ValidatePnd1RdPrepResult,
  type ValidatePnd3Pnd53Result,
  getHeadOfficeInfo,
  getVendorsForPurchase,
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
  getSsoSubmissionHistory,
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
import {
  AccountingEmptyState,
  AccountingPeriodChip,
  AccountingStatCard,
  AccountingStatGrid,
  AccountingTableBodyRow,
  AccountingTableFootRow,
  AccountingTableHead,
  AccountingTableShell,
} from "@/components/admin/accounting-result-primitives"
import {
  accountingLedgerEntryGridCn,
  accountingResultTdCn,
  accountingResultTdRightCn,
  accountingResultThCn,
  accountingResultThRightCn,
} from "@/lib/accounting-result-ui"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import { appAlert, appConfirm } from "@/lib/app-message"
import type {
  VatDraft,
  WhtDraft,
  Pp36Draft,
  Pnd54Draft,
  Pnd1IssueCode,
  Kt20kSummaryResponse,
  Kt20kReasonTag,
  SsoPayrollPreview,
  SsoSubmissionMeta,
  EtaxTimestampMeta,
  EtaxStepKey,
  AdminAccountingComplianceProps,
} from "./admin-accounting-compliance-types"
import {
  PND1_ISSUE_CODES,
  KT20K_REASON_TAGS,
  KT20K_TAGS_QUERY_KEY,
  KT20K_TOL_QUERY_KEY,
  KT20K_YEAR_QUERY_KEY,
  KT20K_STORE_QUERY_KEY,
  KT20K_TAB_QUERY_KEY,
  PP30_FETCH_TIMEOUT_MS,
  SSO_WORKFLOW_NOTE_PREFIX,
  ETAX_TIMESTAMP_NOTE_PREFIX,
} from "./admin-accounting-compliance-types"
import {
  ymNow,
  emptyVat,
  emptyWht,
  emptyPp36,
  emptyPnd54,
  normalizeLedgerFilingStatus,
  formatBangkokDateTime,
  daysFromNow,
  withClientTimeout,
  asNum,
  buildSsoPayrollPreview,
  parseAttachmentUrlsFromInput,
  displayNameFromUrl,
  parseSsoWorkflowNote,
  buildSsoWorkflowNote,
  parseEtaxTimestampWorkflowNote,
  buildEtaxTimestampWorkflowNote,
  pickPayrollApiMsg,
  csvCell,
} from "./admin-accounting-compliance-utils"
import { openWhtCertificatePrintWindow } from "@/lib/open-wht-certificate-print"
import { downloadAuthenticatedFile } from "@/lib/download-authenticated-file"
import { whtCertificateFromLedgerRow, resolveVendorPayeeForWht, resolveWhtWithholdingAgentCompany, type HeadOfficeCompany } from "@/lib/wht-certificate-data"
import { whtLedgerRowMatchesFocusMode } from "@/lib/withholding-tax-csv"
import {
  downloadThaiSsoSps110FromPayrollXlsx,
  type Sps110EmployerInfo,
} from "@/lib/thai-sso-sps1-10-export"
import {
  downloadThaiSsoOfficialUploadFromPayrollXlsx,
  mapPayrollRowToOfficialUploadRow,
  resolveSsoOfficialUploadColumnLabel,
  SSO_OFFICIAL_UPLOAD_COLUMN_HELP,
  type SsoOfficialUploadSheet,
} from "@/lib/thai-sso-official-upload-export"
import { type SsoFilingWageMode } from "@/lib/payroll-utils"
import {
  readPnd91ChecklistEntry,
  readPnd91ChecklistForScope,
  writePnd91ChecklistEntry,
  type Pnd91ChecklistStatus,
} from "@/lib/pnd91-checklist-storage"
import { consolidatePosOutputRowsForTaxExport, isPosAutoVatOutputRow, isStockAutoVatRow } from "@/lib/vat-ledger-pos"
import { formatTaxEntityScopeLabel } from "@/lib/tax-entity-scope-label"
import type { VatLedgerRow } from "@/lib/vat-ledger-csv"
import {
  buildCorporateTaxPdfHtml,
  exportCorporateTaxPdf,
  validateCorporateTaxForPdf,
} from "@/lib/corporate-tax-pdf"
import { AccountingCompliancePeriodTab } from "./accounting-compliance-period-tab"
import { AccountingComplianceSummaryTab } from "./accounting-compliance-summary-tab"
import { AccountingComplianceSsoTab } from "./accounting-compliance-sso-tab"

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
  citFilingShell = false,
}: AdminAccountingComplianceProps = {}) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const formatLoadFailMessage = React.useCallback(
    (detail?: unknown) => {
      const base = t("accCompLoadFail")
      const raw = String(detail || "").trim()
      if (!raw) return base
      if (/tenant_id|column.*tenant_id|42703/i.test(raw)) {
        return `${base}\n(pos_orders.tenant_id 컬럼이 없어 조회에 실패했습니다. SQL 패치를 먼저 실행해 주세요.)`
      }
      return `${base}\n(${raw.slice(0, 220)})`
    },
    [t]
  )
  const role = auth?.role || ""
  const canUse = canManageAccountingCompliance(role, auth?.store)
  const canWriteCompliance = canWriteAccountingCompliance(role)
  const canApproveCompliance = canApproveAccountingCompliance(role)
  const canApproveUnlock = canApproveAccountingPeriodUnlock(role)
  const { stores: franchiseStoreList, posStores, resolveStoreKey, storeLabels, legacyToCanonical, formatStoreLabel } = useStoreList()
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
    Record<
      string,
      { storeCode: string; vendorCode?: string; taxpayerName?: string; taxId?: string; branchNo?: string }
    >
  >({})
  const [taxLinkMetaLoading, setTaxLinkMetaLoading] = React.useState(false)
  const [taxEntityScopeOptions, setTaxEntityScopeOptions] = React.useState<
    Array<{ value: string; label: string; stores?: string[]; taxId?: string; entityName?: string }>
  >([])

  const franchiseStoreCodes = React.useMemo(
    () =>
      (franchiseStoreList || [])
        .map((s) => String(s).trim())
        .filter((s) => s && s !== "All" && !isHeadOfficeLikeStoreName(s) && !isOfficeStore(s)),
    [franchiseStoreList]
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
        const map: Record<
          string,
          { storeCode: string; vendorCode?: string; taxpayerName?: string; taxId?: string; branchNo?: string }
        > = {}
        for (const p of profRes.profiles || []) {
          const sc = String(p.storeCode || "").trim()
          if (!sc) continue
          map[sc] = {
            storeCode: sc,
            vendorCode: p.vendorCode,
            taxpayerName: p.taxpayerName,
            taxId: p.taxId,
            branchNo: p.branchNo,
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

  const findTaxLinkProfileForStore = React.useCallback(
    (storeKey: string) => {
      const key = String(storeKey || "").trim()
      if (!key || key === "All") return null
      const candidates = [key, ...aliasKeysForStore(key, storeLabels, legacyToCanonical)]
      for (const c of candidates) {
        const hit = taxLinkProfilesByStore[c]
        if (hit) return hit
      }
      const want = new Set(candidates.map((c) => c.toLowerCase()).filter(Boolean))
      for (const [code, p] of Object.entries(taxLinkProfilesByStore)) {
        if (want.has(String(code || "").trim().toLowerCase())) return p
      }
      return null
    },
    [taxLinkProfilesByStore, storeLabels, legacyToCanonical]
  )

  const pp30StoreLinkEval = React.useMemo(() => {
    const scope = String(storeFilterForApi || "").trim()
    if (!scope || scope === "All") return null

    // 법인 스코프: 매핑 매장의 납세자/거래처 프로필을 우선 사용
    if (scope.startsWith("entity:")) {
      const ent = taxEntityScopeOptions.find((o) => o.value === scope)
      const mappedStores = Array.isArray(ent?.stores) ? ent!.stores! : []
      let best: ReturnType<typeof evaluateStoreTaxLink> | null = null
      for (const st of mappedStores) {
        const extras = aliasKeysForStore(st, storeLabels, legacyToCanonical)
        const profile = findTaxLinkProfileForStore(st)
        const ev = evaluateStoreTaxLink(st, profile, taxLinkVendors, extras)
        if (ev.status === "linked") return ev
        if (ev.status === "inferred") {
          if (!best || best.status === "missing" || best.status === "profile_only") best = ev
        } else if (ev.status === "profile_only") {
          if (!best || best.status === "missing") best = ev
        }
      }
      if (best) return best

      const taxId = String(ent?.taxId || "")
        .replace(/\D/g, "")
        .trim()
        .slice(0, 13)
      const name = String(ent?.entityName || "").trim()
      if (taxId.length === 13 && name) {
        return {
          status: "profile_only" as const,
          vendorCode: "",
          vendorName: name,
          taxId,
          matchVia: "profile_fields" as const,
        }
      }
      return {
        status: "missing" as const,
        vendorCode: "",
        vendorName: name,
        taxId,
        matchVia: null,
      }
    }

    if (storeFilterForLedger === "All") return null
    const extras = aliasKeysForStore(storeFilterForLedger, storeLabels, legacyToCanonical)
    const profile = findTaxLinkProfileForStore(storeFilterForLedger)
    return evaluateStoreTaxLink(storeFilterForLedger, profile, taxLinkVendors, extras)
  }, [
    storeFilterForApi,
    storeFilterForLedger,
    taxEntityScopeOptions,
    findTaxLinkProfileForStore,
    taxLinkVendors,
    storeLabels,
    legacyToCanonical,
  ])

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
  const [periodType, setPeriodType] = React.useState<"monthly" | "half_year" | "annual">(() =>
    citFilingShell ? "half_year" : "monthly"
  )
  const [ledgerStatusFilter, setLedgerStatusFilter] = React.useState<"all" | "draft" | "submitted">("all")
  /** 법인세 연간: API는 yearMonth의 연도만 사용 — UI는 연도만 고름 */
  const [citFiscalYear, setCitFiscalYear] = React.useState(() => Number(ymNow().slice(0, 4)))
  /** 부가세(ภ.พ.30) 탭: 매출/매입/정산/원천 조회 */
  const [pp30SubView, setPp30SubView] = React.useState<"output" | "input" | "settlement" | "wht">(initialPp30SubView)
  /** P.N.D.53/54 탭: 법인 원천(53) / 해외 지급(54) 신고 분리 */
  const [pnd5354SubView, setPnd5354SubView] = React.useState<"pnd53" | "pnd54">("pnd53")
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
  const [ssoSubmissionMemo, setSsoSubmissionMemo] = React.useState("")
  const [ssoAttachmentInput, setSsoAttachmentInput] = React.useState("")
  const [ssoEvidenceUploading, setSsoEvidenceUploading] = React.useState(false)
  const [ssoSubmissionSaving, setSsoSubmissionSaving] = React.useState(false)
  const [ssoAccountingSyncing, setSsoAccountingSyncing] = React.useState(false)
  const [ssoFilingWageMode, setSsoFilingWageMode] = React.useState<SsoFilingWageMode>("contributable")
  const [ssoSubView, setSsoSubView] = React.useState<"filing" | "history">("filing")
  const [ssoHistoryRows, setSsoHistoryRows] = React.useState<AccountingWorkflowStatusRow[]>([])
  const [ssoHistoryLoading, setSsoHistoryLoading] = React.useState(false)
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
  /** 월별 ภ.ง.ด.1 / 1ก 신고 도구·원장 (PND91과 분리) */
  const showPnd1Area =
    whtFocusMode === "all" || whtFocusMode === "pnd1391" || whtFocusMode === "pnd1"
  /** 연간 ภ.ง.ด.91 체크리스트 — pnd1 탭과 결과·신고를 섞지 않음 */
  const showPnd91Area =
    whtFocusMode === "all" || whtFocusMode === "pnd1391" || whtFocusMode === "pnd91"
  const showPnd353Tools =
    whtFocusMode === "all" ||
    whtFocusMode === "pnd1391" ||
    whtFocusMode === "pnd3" ||
    whtFocusMode === "pnd5354" ||
    whtFocusMode === "pnd53"
  const showPp36Ledger = whtFocusMode === "all" || whtFocusMode === "pp36"
  const showPnd54Ledger =
    whtFocusMode === "all" || whtFocusMode === "pnd5354" || whtFocusMode === "pnd54"
  const showWhtLedger =
    whtFocusMode !== "pp36" && whtFocusMode !== "pnd54" && whtFocusMode !== "pnd91"
  const isPnd5354CompactList =
    whtFocusMode === "pnd5354" || whtFocusMode === "pnd53" || whtFocusMode === "pnd54"
  /** 탭이 이미 53/54로 분리된 경우 하위 토글 숨김 */
  const showPnd5354SubToggle = whtFocusMode === "pnd5354"
  const lockWhtSubmissionFormHint = whtFocusMode === "pnd3" || whtFocusMode === "pnd53"

  React.useEffect(() => {
    if (whtFocusMode === "pnd53") setPnd5354SubView("pnd53")
    else if (whtFocusMode === "pnd54") setPnd5354SubView("pnd54")
  }, [whtFocusMode])

  React.useEffect(() => {
    if (whtFocusMode === "pnd3") setWhtSubmissionFormHint("PND3")
    else if (whtFocusMode === "pnd53") setWhtSubmissionFormHint("PND53")
  }, [whtFocusMode])
  const isCitFilingShell = citFilingShell === true
  const [pnd1IssueFilterCodes, setPnd1IssueFilterCodes] = React.useState<Pnd1IssueCode[]>([])
  const [payrollTinGapLoading, setPayrollTinGapLoading] = React.useState(false)
  const [payrollTinGapResult, setPayrollTinGapResult] = React.useState<PayrollWhtTinGapResult | null>(null)
  const [pnd91Loading, setPnd91Loading] = React.useState(false)
  const [pnd91Summary, setPnd91Summary] = React.useState<Pnd91AnnualSummaryResult | null>(null)
  const [pnd91ChecklistTick, setPnd91ChecklistTick] = React.useState(0)
  const whtRowRefs = React.useRef<Record<number, HTMLElement | null>>({})
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
      new Set((posStores || []).map((s) => String(s).trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b))
    return ["All", ...uniq]
  }, [isOffice, isManager, scopedStoreChoices, posStores])

  React.useEffect(() => {
    if (!canUse || !isOffice) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch('/api/getTaxEntityScopes')
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        const rows = Array.isArray(data?.scopes) ? data.scopes : []
        const next = rows
          .map((r: Record<string, unknown>) => {
            const storeCount = Number(r.storeCount) || 0
            const entityName = String(r.entityName || r.label || '').trim()
            const taxId = String(r.taxId || '').trim()
            const entityCode = String(r.entityCode || '').trim()
            const value = String(r.value || '').trim()
            return {
              value,
              label: formatTaxEntityScopeLabel({
                entityName,
                entityCode,
                taxId,
                storeCount,
                storeCountLabel:
                  storeCount > 0
                    ? t('accCompTaxEntityStoreCount').replace('{{n}}', String(storeCount))
                    : '',
              }),
              stores: Array.isArray(r.stores)
                ? r.stores.map((s) => String(s || '').trim()).filter(Boolean)
                : [],
              taxId,
              entityName,
            }
          })
          .filter((r: { value: string }) => !!r.value)
        setTaxEntityScopeOptions(next)
      } catch {
        if (!cancelled) setTaxEntityScopeOptions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [canUse, isOffice, t])

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

  const citHalfYearSlot = React.useMemo<"H1" | "H2">(() => {
    const m = Number(String(taxMonth).slice(5, 7))
    return m <= 6 ? "H1" : "H2"
  }, [taxMonth])

  const setCitHalfYearControls = React.useCallback(
    (next: { year?: number; slot?: "H1" | "H2" }) => {
      const year = next.year ?? citFiscalYear
      const slot = next.slot ?? citHalfYearSlot
      setTaxMonth?.(`${year}-${slot === "H1" ? "01" : "07"}`)
      if (next.year != null) setCitFiscalYear(next.year)
    },
    [citFiscalYear, citHalfYearSlot, setTaxMonth]
  )

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
        direction: String(r.direction || "").trim().toLowerCase() === "input" ? "input" : "output",
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

  const loadVat = React.useCallback(async (opts?: { forceSync?: boolean }) => {
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
          forceSync: !!opts?.forceSync,
        }),
        opts?.forceSync ? Math.max(PP30_FETCH_TIMEOUT_MS, 180000) : PP30_FETCH_TIMEOUT_MS
      )
      if (seq !== vatLoadSeqRef.current) {
        return
      }
      const rows = data.entries || []
      setVatRows(mapVat(rows))
      if (data.error && rows.length === 0) {
        appAlert(formatLoadFailMessage(data.error))
      } else if (opts?.forceSync) {
        if (data.syncWarning === "POS_SYNC_FAILED") {
          appAlert(t("accCompVatSyncPosFail"))
        } else if (data.syncWarning === "FULL_SYNC_PARTIAL") {
          appAlert(t("accCompVatSyncPartial") || t("accCompVatSyncPosFail"))
        } else if (isHeadOfficeLedgerStore) {
          appAlert(t("accCompVatSyncHqOk"))
        } else {
          appAlert(tr(t, "accCompVatSyncOk", { n: String(data.posSynced || 0) }))
        }
      }
      if (seq === vatLoadSeqRef.current) {
        void loadVatStoreNameGaps()
      }
    } catch (e) {
      if (seq !== vatLoadSeqRef.current) {
        return
      }
      const msg = e instanceof Error ? e.message : String(e || "")
      if (msg === "CLIENT_TIMEOUT") {
        appAlert(t("accCompVatSyncTimeout"))
      } else {
        setVatRows([])
        appAlert(formatLoadFailMessage(msg))
      }
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
    formatLoadFailMessage,
    isHeadOfficeLedgerStore,
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

  const exportOfficialUploadFromPayroll = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    setSsoPayrollExporting(true)
    try {
      const rows = ssoPayrollRows.length ? ssoPayrollRows : await fetchSsoPayrollRows()
      if (!rows || rows.length === 0) return

      const byStore = new Map<string, Record<string, unknown>[]>()
      for (const r of rows) {
        const store = String(r.store || "").trim() || "_"
        const bucket = byStore.get(store)
        if (bucket) bucket.push(r)
        else byStore.set(store, [r])
      }

      const employer = await resolveSsoEmployerHeader()
      const sheets: SsoOfficialUploadSheet[] = []
      let missingBranch = false

      for (const [store, storeRows] of byStore) {
        let branchCode = ""
        if (store && store !== "_") {
          try {
            const { profile } = await getStoreTaxFilingProfile(store)
            branchCode = String(profile?.ssoBranchCode || "").trim()
          } catch {
            /* optional per-store profile */
          }
        }
        if (!branchCode) {
          missingBranch = true
          branchCode = String(employer.branchCode || "").trim()
        }
        sheets.push({ branchCode, rows: storeRows })
      }

      if (missingBranch) {
        appAlert(t("accCompSsoOfficialUploadMissingBranch"))
      }

      await downloadThaiSsoOfficialUploadFromPayrollXlsx({
        yearMonth: taxMonth,
        sheets,
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
    t,
  ])

  const exportSps110FromPayroll = React.useCallback(async () => {
    if (!canUse || !auth?.user) return
    setSsoPayrollExporting(true)
    try {
      const rows = ssoPayrollRows.length ? ssoPayrollRows : await fetchSsoPayrollRows()
      if (!rows || rows.length === 0) return
      const employer = await resolveSsoEmployerHeader()
      await downloadThaiSsoSps110FromPayrollXlsx({
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

  const loadSsoSubmissionHistory = React.useCallback(async () => {
    if (!canUse) return
    setSsoHistoryLoading(true)
    try {
      const pickStore = externalFiling ? storeTb : ssoStoreFilter
      const effectiveStore = isManager && managerStore ? managerStore : pickStore
      const data = await getSsoSubmissionHistory({
        storeFilter: effectiveStore && effectiveStore !== "All" ? effectiveStore : undefined,
      })
      setSsoHistoryRows(data.rows || [])
    } catch {
      setSsoHistoryRows([])
    } finally {
      setSsoHistoryLoading(false)
    }
  }, [canUse, externalFiling, isManager, managerStore, ssoStoreFilter, storeTb])

  const openSsoHistoryRow = React.useCallback(
    async (row: AccountingWorkflowStatusRow) => {
      const ym = String(row.year_month || "").trim().slice(0, 7)
      if (ym) setTaxMonth(ym)
      const scope = String(row.store_scope || "").trim()
      if (scope && scope !== "*") {
        setSsoStoreFilter(scope)
      }
      setSsoSubView("filing")
      setSsoQueried(true)
      await Promise.all([fetchSsoPayrollRows(false), loadSsoWorkflowStatus()])
    },
    [fetchSsoPayrollRows, loadSsoWorkflowStatus]
  )

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
      await loadSsoSubmissionHistory()
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
    loadSsoSubmissionHistory,
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
    if (canUse && tab === "sso" && ssoSubView === "history") void loadSsoSubmissionHistory()
  }, [canUse, tab, ssoSubView, loadSsoSubmissionHistory])

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
    setPnd91Summary(null)
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
        // PND91 전용 탭은 월별 원장 조회 없이 연간 체크리스트만(별도 effect)
        if (whtFocusMode !== "pnd91") {
          await Promise.all([loadWhtRef.current(), loadPp36Ref.current(), loadPnd54Ref.current()])
        }
      } else {
        await loadVatRef.current()
      }
      if (cancelled) {
        return
      }
      if (whtFocusMode !== "pnd91") {
        void loadTaxSummaryRef.current()
      }
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
    whtFocusMode,
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
    if (canUse && (tab === "kt20k" || tab === "cit" || tab === "summary")) void loadKt20kSettings()
  }, [canUse, tab, loadKt20kSettings])

  /**
   * 매장 납세자 프로필(메모리→API) → 거래처 연동 → (본사) KT20k/E-tax 순으로 RD Prep 헤더 소스를 채움.
   * 프로필 UI에 이미 저장된 TIN/법인명을 PP30 다운로드가 못 읽던 버그 보완.
   */
  const loadRdPayerFromStoreSources = React.useCallback(async (): Promise<{
    payerName: string
    payerTaxId: string
    payerBranchNo: string
  }> => {
    let payerName = ""
    let payerTaxId = ""
    let payerBranchNo = "00000"

    const applyGaps = (name: string, taxIdRaw: string, branch?: string) => {
      const taxId = String(taxIdRaw || "")
        .replace(/\D/g, "")
        .trim()
      if (!payerName && name) payerName = name
      if (payerTaxId.length !== 13 && taxId.length === 13) payerTaxId = taxId
      if (branch) payerBranchNo = branch
    }

    const storeKey =
      storeFilterForLedger !== "All" ? storeFilterForApi || storeFilterForLedger : ""

    // 1) 이미 로드된 매장 납세자 프로필 (Store taxpayer profiles와 동일 데이터)
    if (storeKey) {
      if (storeKey.startsWith("entity:")) {
        const ent = taxEntityScopeOptions.find((o) => o.value === storeKey)
        applyGaps(String(ent?.entityName || "").trim(), String(ent?.taxId || ""))
        for (const st of ent?.stores || []) {
          if (payerTaxId.length === 13 && payerName) break
          const cached = findTaxLinkProfileForStore(st)
          if (cached) {
            applyGaps(
              String(cached.taxpayerName || "").trim(),
              String(cached.taxId || ""),
              String(cached.branchNo || "").trim() || undefined
            )
          }
        }
      } else {
        const cached = findTaxLinkProfileForStore(storeKey)
        if (cached) {
          applyGaps(
            String(cached.taxpayerName || "").trim(),
            String(cached.taxId || ""),
            String(cached.branchNo || "").trim() || undefined
          )
        }
      }
    }

    // 2) 거래처 연동 판정(HQ 등) — 프로필 필드가 비어 있을 때 보완
    if ((payerTaxId.length !== 13 || !payerName) && pp30StoreLinkEval) {
      applyGaps(
        String(pp30StoreLinkEval.vendorName || "").trim(),
        String(pp30StoreLinkEval.taxId || "")
      )
    }

    // 3) API resolve (canonical store_code + vendor fallback)
    if (storeKey && (payerTaxId.length !== 13 || !payerName)) {
      const resolveKeys = storeKey.startsWith("entity:")
        ? taxEntityScopeOptions.find((o) => o.value === storeKey)?.stores || []
        : [storeKey]
      for (const rk of resolveKeys) {
        if (payerTaxId.length === 13 && payerName) break
        try {
          const { profile } = await getStoreTaxFilingProfile(rk)
          if (profile) {
            applyGaps(
              String(profile.taxpayerName || "").trim(),
              String(profile.taxId || ""),
              String(profile.branchNo || "").trim() || undefined
            )
          }
        } catch {
          /* keep current */
        }
      }
    }

    // 4) 본사 전역 설정
    if (isHeadOfficeLedgerStore && (payerTaxId.length !== 13 || !payerName)) {
      applyGaps(String(kt20kEmployer.companyName || "").trim(), String(kt20kEmployer.companyTaxId || ""))
      if (payerTaxId.length !== 13) applyGaps("", String(etaxTaxId || ""))
    }

    return { payerName, payerTaxId, payerBranchNo }
  }, [
    storeFilterForLedger,
    storeFilterForApi,
    findTaxLinkProfileForStore,
    pp30StoreLinkEval,
    isHeadOfficeLedgerStore,
    kt20kEmployer.companyName,
    kt20kEmployer.companyTaxId,
    etaxTaxId,
    taxEntityScopeOptions,
  ])

  React.useEffect(() => {
    if (!canUse || storeFilterForLedger === "All") return
    let cancelled = false
    void (async () => {
      const header = await loadRdPayerFromStoreSources()
      if (cancelled) return
      setPnd1PayerName(header.payerName)
      setPnd1PayerTaxId(header.payerTaxId)
      setPnd1PayerBranchNo(header.payerBranchNo || "00000")
    })()
    return () => {
      cancelled = true
    }
  }, [canUse, storeFilterForLedger, loadRdPayerFromStoreSources])

  React.useEffect(() => {
    setKt20kReasonTagFilter([])
  }, [kt20kYear, storeTb])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    // 세무 신고 셸(hideTabBar)은 탭·매장 필터를 셸이 소유 — KT20K 쿼리로 내부 탭을 덮어쓰지 않음
    if (hideTabBar) return
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
  }, [hideTabBar])

  React.useEffect(() => {
    if (!kt20kPendingStoreFromQuery) return
    if (hideTabBar) {
      setKt20kPendingStoreFromQuery("")
      return
    }
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
  }, [kt20kPendingStoreFromQuery, storeOptions, storeTb, setStoreTb, isOffice, hideTabBar])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    // SSO/PP30 등에서 매장만 바꿔도 kt20k_store 쿼리가 바뀌면 keep-alive 캐시 키가 갈라져
    // 세무 신고 셸이 새로 마운트되며 기본 탭(PP.30)으로 튕긴다. KT20K 탭에서만 URL 동기화.
    if (hideTabBar || tab !== "kt20k") return
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
    url.searchParams.set(KT20K_TAB_QUERY_KEY, "1")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
  }, [kt20kReasonTagFilter, kt20kDiffTolerance, kt20kYear, storeTb, tab, hideTabBar])

  React.useEffect(() => {
    if (!canUse || tab !== "sso") return
    if (externalFiling) return
    void loadSsoWorkflowStatus()
  }, [canUse, tab, loadSsoWorkflowStatus, externalFiling])

  React.useEffect(() => {
    if (!externalFiling || filingSearchTick == null || filingSearchTick < 1) return
    if (initialTab !== "sso" && tab !== "sso") return
    void runSsoSearch()
  }, [externalFiling, filingSearchTick, runSsoSearch, initialTab, tab])

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
              ? `\n${tr(t, "accCompMoreCountSuffix", {
                  count: String(Number(res.pendingEvidenceCount || 0) - rows.length),
                })}`
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
        // 본사: POS 시연 매출 제외 → 물류 출고가 매출 VAT
        if (isHeadOfficeLedgerStore && isPosAutoVatOutputRow(r)) return false
        // 가맹 매장: 물류 출고 output은 본사 공급 성격 → 매장 PP.30 매출에서 제외 (POS만)
        if (!isHeadOfficeLedgerStore && isStockAutoVatRow(r)) return false
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
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    return {
      claimableVat: round2(claimableRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0)),
      claimableNet: round2(claimableRows.reduce((sum, r) => sum + (Number(r.net_amount) || 0), 0)),
      pendingVat: round2(pendingRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0)),
      unobtainableVat: round2(unobtainableRows.reduce((sum, r) => sum + (Number(r.vat_amount) || 0), 0)),
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
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
    const outputNet = round2(vatOutputRowsFiltered.reduce((sum, row) => sum + Number(row.net_amount || 0), 0))
    const outputVat = round2(vatOutputRowsFiltered.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0))
    const outputTotal = round2(vatOutputRowsFiltered.reduce((sum, row) => sum + Number(row.total_amount || 0), 0))
    const inputNet = round2(vatInputRowsFiltered.reduce((sum, row) => sum + Number(row.net_amount || 0), 0))
    const inputVat = round2(vatInputRowsFiltered.reduce((sum, row) => sum + Number(row.vat_amount || 0), 0))
    const inputTotal = round2(vatInputRowsFiltered.reduce((sum, row) => sum + Number(row.total_amount || 0), 0))
    let posOutputVat = 0
    let posOutputNet = 0
    let posOutputCount = 0
    let otherOutputVat = 0
    let otherOutputNet = 0
    let otherOutputCount = 0
    for (const row of vatOutputRowsFiltered) {
      const vat = Number(row.vat_amount || 0)
      const net = Number(row.net_amount || 0)
      if (isPosAutoVatOutputRow(row)) {
        posOutputVat += vat
        posOutputNet += net
        posOutputCount += 1
      } else {
        otherOutputVat += vat
        otherOutputNet += net
        otherOutputCount += 1
      }
    }
    // 신고 예상액: 증빙 공제 가능한 매입 VAT만 차감 (대기·불가 제외)
    const claimableInputVat = vatInputClaimable.claimableVat
    const payableVat = round2(outputVat - claimableInputVat)
    return {
      outputNet,
      outputVat,
      outputTotal,
      inputNet,
      inputVat,
      inputTotal,
      claimableInputVat,
      claimableInputNet: vatInputClaimable.claimableNet,
      claimableInputCount: vatInputClaimable.claimableCount,
      payableVat,
      dueVat: payableVat > 0 ? payableVat : 0,
      creditVat: payableVat < 0 ? Math.abs(payableVat) : 0,
      outputCount: vatOutputRowsFiltered.length,
      inputCount: vatInputRowsFiltered.length,
      posOutputVat: round2(posOutputVat),
      posOutputNet: round2(posOutputNet),
      posOutputCount,
      otherOutputVat: round2(otherOutputVat),
      otherOutputNet: round2(otherOutputNet),
      otherOutputCount,
      summaryPayableVat: Number(taxSummary?.vat?.payableVat || 0),
    }
  }, [vatOutputRowsFiltered, vatInputRowsFiltered, vatInputClaimable, taxSummary?.vat?.payableVat])
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
    () =>
      whtRows.filter((r) => {
        if (ledgerStatusFilter !== "all" && r.filing_status !== ledgerStatusFilter) return false
        return whtLedgerRowMatchesFocusMode(r, whtFocusMode)
      }),
    [whtRows, ledgerStatusFilter, whtFocusMode]
  )
  const whtRowsPnd53Display = React.useMemo(() => {
    // pnd53 탭·구 pnd5354 뷰: PND53만 (PND1/PND3 제외)
    if (whtFocusMode === "pnd53" || whtFocusMode === "pnd5354" || isPnd5354CompactList) {
      return whtRowsFiltered.filter((r) => whtLedgerRowMatchesFocusMode(r, "pnd53"))
    }
    return whtRowsFiltered
  }, [isPnd5354CompactList, whtFocusMode, whtRowsFiltered])
  const pnd54RowsFiltered = React.useMemo(
    () => pnd54Rows.filter((r) => ledgerStatusFilter === "all" || r.filing_status === ledgerStatusFilter),
    [pnd54Rows, ledgerStatusFilter]
  )
  const pnd53Summary = React.useMemo(() => {
    const rows =
      whtFocusMode === "pnd53" || whtFocusMode === "pnd5354" || isPnd5354CompactList
        ? whtRowsPnd53Display
        : whtRowsFiltered
    return {
      gross: rows.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0),
      withheld: rows.reduce((s, r) => s + (Number(r.wht_amount) || 0), 0),
      count: rows.length,
    }
  }, [isPnd5354CompactList, whtFocusMode, whtRowsFiltered, whtRowsPnd53Display])
  const whtFocusSummary = React.useMemo(() => {
    const rows = whtRowsFiltered
    return {
      totalGross: rows.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0),
      totalWithheld: rows.reduce((s, r) => s + (Number(r.wht_amount) || 0), 0),
      rowCount: rows.length,
      missingTaxIdCount: rows.filter((r) => !String(r.payee_tax_id || "").trim()).length,
      missingCertificateCount: rows.filter((r) => !String(r.certificate_no || "").trim()).length,
    }
  }, [whtRowsFiltered])
  const pnd54Summary = React.useMemo(
    () => ({
      gross: pnd54RowsFiltered.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0),
      withheld: pnd54RowsFiltered.reduce((s, r) => s + (Number(r.wht_amount) || 0), 0),
      count: pnd54RowsFiltered.length,
    }),
    [pnd54RowsFiltered]
  )
  const summaryCardTitle = React.useMemo(() => {
    if (isEmbeddedPp36Section || whtFocusMode === "pp36") return t("accCompTabPp36")
    if (whtFocusMode === "pnd53") return t("taxFilingTabPnd53")
    if (whtFocusMode === "pnd54") return t("taxFilingTabPnd54")
    if (isPnd5354CompactList) return t("taxFilingTabPnd5354")
    if (whtFocusMode === "pnd1") return t("taxFilingTabPnd1")
    if (whtFocusMode === "pnd91") return t("taxFilingTabPnd91")
    if (whtFocusMode === "pnd3") return t("taxFilingTabPnd3")
    if (whtFocusMode === "pnd1391") return t("taxFilingTabPnd1391")
    return t("accCompTabPp30")
  }, [isEmbeddedPp36Section, isPnd5354CompactList, whtFocusMode, t])
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
      const vendors = await getVendorsForPurchase().catch(() => [])
      const profileCache = new Map<string, Awaited<ReturnType<typeof getStoreTaxFilingProfile>>["profile"]>()
      const resolveAgentForStore = async (
        storeRaw: string,
        payeeTaxId?: string,
        opts?: { hqEntityBranchesOnly?: boolean }
      ) => {
        const storeKey = String(storeRaw || "").trim()
        if (!storeKey) return ho
        if (!profileCache.has(storeKey)) {
          const res = await getStoreTaxFilingProfile(storeKey).catch(() => ({ profile: null }))
          profileCache.set(storeKey, res.profile)
        }
        return resolveWhtWithholdingAgentCompany({
          headOffice: ho,
          storeName: storeKey,
          profile: profileCache.get(storeKey),
          payeeTaxId,
          hqEntityBranchesOnly: opts?.hqEntityBranchesOnly,
        })
      }
      const items = await Promise.all(
        eligible.map(async (r) => {
          const payeeName = String(r.payee_name || "").trim()
          const fromVendor = resolveVendorPayeeForWht(vendors, "", payeeName)
          const payeeTaxId = String(r.payee_tax_id || "").trim() || fromVendor.taxId
          const payeeAddress = fromVendor.address
          // 발주 자동분(레거시 inbound 포함)은 당사 발급 증명서 → 원천징수자 상단
          const src = String(r.source_type || "").trim().toLowerCase()
          const dirRaw = String(r.direction || "").trim().toLowerCase()
          const direction =
            src === "purchase_order" ? "outbound" : dirRaw === "inbound" ? "inbound" : "outbound"
          // 발주 원장 store_name은 relatedStore일 수 있음 → 직영(본사 TIN)만 매장 표기
          const agent = await resolveAgentForStore(String(r.store_name || ""), payeeTaxId, {
            hqEntityBranchesOnly: src === "purchase_order",
          })
          return whtCertificateFromLedgerRow(
            {
              payment_date: r.payment_date,
              tax_month: r.tax_month,
              payee_name: r.payee_name,
              payee_tax_id: payeeTaxId,
              payee_address: payeeAddress,
              income_type: r.income_type,
              gross_amount: r.gross_amount,
              wht_rate: r.wht_rate,
              wht_amount: r.wht_amount,
              form_hint: r.form_hint,
              certificate_no: r.certificate_no,
              memo: r.memo,
              store_name: r.store_name,
              direction,
            },
            agent
          )
        })
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

  const resolvePp30RdPrepPayer = React.useCallback(async () => {
    let payerName = String(pnd1PayerName || "").trim()
    let payerTaxId = String(pnd1PayerTaxId || "")
      .replace(/\D/g, "")
      .trim()
    let payerBranchNo = String(pnd1PayerBranchNo || "").trim() || "00000"

    if (payerTaxId.length !== 13 || !payerName) {
      const fromStore = await loadRdPayerFromStoreSources()
      if (!payerName) payerName = fromStore.payerName
      if (payerTaxId.length !== 13) payerTaxId = fromStore.payerTaxId
      if (!payerBranchNo || payerBranchNo === "00000") {
        payerBranchNo = fromStore.payerBranchNo || payerBranchNo
      }
      if (payerName) setPnd1PayerName(payerName)
      if (payerTaxId) setPnd1PayerTaxId(payerTaxId)
      if (payerBranchNo) setPnd1PayerBranchNo(payerBranchNo)
    }

    if (payerTaxId.length !== 13 || !payerName) {
      appAlert(
        tr(t, "accCompPp30ExportRequiredMissing", {
          fields: [
            !payerName ? t("accCompPp30ExportField_companyName") : "",
            payerTaxId.length !== 13 ? t("accCompPp30ExportField_companyTaxId13") : "",
          ]
            .filter(Boolean)
            .join(", "),
        })
      )
      return null
    }
    return { payerName, payerTaxId, payerBranchNo }
  }, [
    pnd1PayerName,
    pnd1PayerTaxId,
    pnd1PayerBranchNo,
    loadRdPayerFromStoreSources,
    t,
    tr,
  ])

  const handleDownloadPp30RdPrepFile = React.useCallback(
    async (format: "txt" | "xlsx") => {
      if (!pp30Queried) {
        appAlert(t("accCompPp30ExportNeedSearch"))
        return
      }
      const payer = await resolvePp30RdPrepPayer()
      if (!payer) return
      const url = getExportPp30RdPrepTxtUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
        payerTaxId: payer.payerTaxId,
        payerBranchNo: payer.payerBranchNo,
        payerName: payer.payerName,
        outputNet: vatSettlement.outputNet,
        outputVat: vatSettlement.outputVat,
        inputNet: vatSettlement.claimableInputNet,
        inputVat: vatSettlement.claimableInputVat,
        format,
      })
      const fallback =
        format === "xlsx"
          ? `PP30_${payer.payerTaxId}_${taxMonth}_review.xlsx`
          : `PP30_${payer.payerTaxId}_${taxMonth}.txt`
      try {
        await downloadAuthenticatedFile(url, fallback)
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e || "")
        appAlert(
          detail
            ? `${t("accCompPp30RdPrepDownloadFail")}\n(${detail.slice(0, 220)})`
            : t("accCompPp30RdPrepDownloadFail")
        )
      }
    },
    [
      pp30Queried,
      resolvePp30RdPrepPayer,
      role,
      taxMonth,
      periodType,
      ledgerStatusFilter,
      storeFilterForApi,
      vatSettlement.outputNet,
      vatSettlement.outputVat,
      vatSettlement.claimableInputNet,
      vatSettlement.claimableInputVat,
      t,
    ]
  )

  const handleDownloadPp30RdPrepTxt = React.useCallback(async () => {
    await handleDownloadPp30RdPrepFile("txt")
  }, [handleDownloadPp30RdPrepFile])

  const handleDownloadPp30RdPrepExcel = React.useCallback(async () => {
    await handleDownloadPp30RdPrepFile("xlsx")
  }, [handleDownloadPp30RdPrepFile])

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
  const pnd53RdFilingUrl = React.useMemo(
    () =>
      getExportPnd53RdFilingTxtUrl({
        userRole: role,
        taxMonth,
        yearMonth: taxMonth,
        periodType,
        filingStatus: ledgerStatusFilter,
        storeFilter: storeFilterForApi,
        formHint: whtSubmissionFormHint,
        payerTaxId: pnd1PayerTaxId,
        payerBranchNo: pnd1PayerBranchNo,
      }),
    [
      role,
      taxMonth,
      periodType,
      ledgerStatusFilter,
      storeFilterForApi,
      whtSubmissionFormHint,
      pnd1PayerTaxId,
      pnd1PayerBranchNo,
      pnd1PayerName,
    ]
  )
  const handleDownloadPnd53RdFilingTxt = React.useCallback(async () => {
    let payerTaxId = String(pnd1PayerTaxId || "")
      .replace(/\D/g, "")
      .trim()
    let payerBranchNo = String(pnd1PayerBranchNo || "").trim() || "00000"
    // soft TXT에는 납부자 TIN이 없어도 됨 — 있으면 파일명·참고용으로만 채움
    if (payerTaxId.length !== 13) {
      const fromStore = await loadRdPayerFromStoreSources()
      if (payerTaxId.length !== 13) payerTaxId = fromStore.payerTaxId
      if (!payerBranchNo || payerBranchNo === "00000") {
        payerBranchNo = fromStore.payerBranchNo || payerBranchNo
      }
      if (fromStore.payerName) setPnd1PayerName(fromStore.payerName)
      if (payerTaxId) setPnd1PayerTaxId(payerTaxId)
      if (payerBranchNo) setPnd1PayerBranchNo(payerBranchNo)
    }
    const url = getExportPnd53RdFilingTxtUrl({
      userRole: role,
      taxMonth,
      yearMonth: taxMonth,
      periodType,
      filingStatus: ledgerStatusFilter,
      storeFilter: storeFilterForApi,
      formHint: whtSubmissionFormHint,
      payerTaxId: payerTaxId.length === 13 ? payerTaxId : undefined,
      payerBranchNo,
      layout: "soft",
    })
    try {
      await downloadAuthenticatedFile(
        url,
        `PND53_rd_prep_${payerTaxId || "soft"}_${taxMonth}.txt`
      )
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e || "")
      appAlert(
        detail
          ? `${t("accCompPp30RdPrepDownloadFail")}\n(${detail.slice(0, 220)})`
          : t("accCompPp30RdPrepDownloadFail")
      )
    }
  }, [
    pnd1PayerTaxId,
    pnd1PayerBranchNo,
    loadRdPayerFromStoreSources,
    role,
    taxMonth,
    periodType,
    ledgerStatusFilter,
    storeFilterForApi,
    whtSubmissionFormHint,
    t,
  ])
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
        format: "txt",
      }),
    [
      role,
      taxMonth,
      periodType,
      ledgerStatusFilter,
      storeFilterForApi,
      pnd1FilingForm,
      pnd1PayerTaxId,
      pnd1PayerBranchNo,
      pnd1PayerName,
      pnd1IncludeHeader,
    ]
  )
  const pnd1RdPrepExcelUrl = React.useMemo(
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
        format: "xlsx",
      }),
    [
      role,
      taxMonth,
      periodType,
      ledgerStatusFilter,
      storeFilterForApi,
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
  const pnd1RdPrepBtnLabel = t("accCompPnd1ExportTxt")
  const pnd1RdPrepExcelBtnLabel = t("accCompPnd1ExportExcel")
  const pnd1ValidateBtnLabel = t("accCompPnd1ValidateBeforeExport")
  const pnd1FormLabel = t("accCompPnd1FilingForm")
  const pnd1PayerBoxTitle = t("accCompPnd1PayerInfoBox")
  const pnd1ValidationTableTitle = t("accCompPnd1ValidationResults")
  const pnd1GoLedgerBtnLabel = t("accCompPnd1GoToLedgerRow")
  const pnd1ClearValidationLabel = t("accCompPnd1ClearValidation")
  const pnd1IssueFilterLabel = t("accCompPnd1IssueFilter")
  const pnd1IssueExportCsvLabel = t("accCompPnd1ExportValidationCsv")
  const pnd1NoIssueTooltip = t("accCompPnd1NoIssuesInFilter")
  const kt20kExportUrl = React.useMemo(() => {
    const y = Number(kt20kYear)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) return "#"
    return getExportKt20kCsvUrl({ userRole: role, year: y, storeFilter: storeTb })
  }, [kt20kYear, role, storeTb])
  const pnd1IssueCodeLabel = React.useCallback(
    (code: string) => {
      const key = `accCompPnd1Issue_${code}`
      const label = t(key)
      return label === key ? code : label
    },
    [t]
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
      const key = `accCompKt20kTag_${tag}`
      const label = t(key)
      return label === key ? tag : label
    },
    [t]
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
          ? tr(t, "accCompPnd353ValidationWarnAlert", { count: warningTotal.toLocaleString() })
          : t("accCompPnd353ValidationOkAlert")
      )
    } catch {
      setPnd353ValidationResult(null)
      appAlert(t("accCompPnd353ValidationFailAlert"))
    } finally {
      setPnd353Validating(false)
    }
  }, [canUse, role, taxMonth, periodType, ledgerStatusFilter, storeFilterForLedger, whtSubmissionFormHint, t])

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

  const pnd91Year = React.useMemo(() => {
    const y = Number(String(taxMonth || "").slice(0, 4))
    return Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : null
  }, [taxMonth])

  const loadPnd91 = React.useCallback(async () => {
    if (!canUse || !showPnd91Area || pnd91Year == null) return
    setPnd91Loading(true)
    try {
      const data = await getPnd91AnnualSummary({ year: pnd91Year, storeFilter: storeFilterForApi })
      if (!data.success) throw new Error(data.error || "LOAD_FAILED")
      setPnd91Summary(data)
    } catch (e) {
      setPnd91Summary(null)
      appAlert(formatLoadFailMessage(e instanceof Error ? e.message : e))
    } finally {
      setPnd91Loading(false)
    }
  }, [canUse, showPnd91Area, pnd91Year, storeFilterForApi, t, formatLoadFailMessage])

  const pnd91ExportUrl = React.useMemo(() => {
    if (pnd91Year == null) return "#"
    const checklist = readPnd91ChecklistForScope(pnd91Year, storeFilterForApi)
    const map = Object.fromEntries(
      Object.entries(checklist).map(([k, v]) => [k, { status: v.status, note: v.note }])
    )
    return getExportPnd91AnnualCsvUrl({
      year: pnd91Year,
      storeFilter: storeFilterForApi,
      checklistJson: JSON.stringify(map),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick forces URL refresh after checklist edits
  }, [pnd91Year, storeFilterForApi, pnd91ChecklistTick])

  React.useEffect(() => {
    if (!canUse || tab !== "summary" || !pp30Queried || pp30SubView !== "wht" || !showPnd91Area) return
    void loadPnd91()
  }, [
    canUse,
    tab,
    pp30Queried,
    pp30SubView,
    showPnd91Area,
    taxMonth,
    storeFilterForApi,
    pp30SearchSeq,
    loadPnd91,
  ])

  const taxEntityScopeLabelMap = React.useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of taxEntityScopeOptions || []) {
      const key = String(row.value || '').trim()
      if (!key) continue
      out[key] = String(row.label || '').trim() || key
    }
    return out
  }, [taxEntityScopeOptions])

  const storeOptionLabel = React.useCallback(
    (code: string) => {
      if (code === "All") return t("accCompStoreAll")
      if (code.startsWith("entity:")) {
        return taxEntityScopeLabelMap[code] || code.replace(/^entity:/, "")
      }
      return formatStoreLabel(code) || code
    },
    [t, formatStoreLabel, taxEntityScopeLabelMap]
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
                <AdminTableScroll className="rounded-md border border-border/80" hint={false}>
                  <table className="w-full text-sm border-collapse min-w-[520px]">
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
                </AdminTableScroll>
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
              <table className="w-full text-sm border-collapse">
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
                {t("accCompKt20kVsPnd1aTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {kt20kData?.reconciliation ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs text-muted-foreground">
                      {t("accCompKt20kDiffToleranceLabel")}
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

                  <AdminTableScroll className="rounded border border-border/60" hint={false}>
                    <table className="w-full text-sm min-w-[760px]">
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
                              {t("accCompKt20kNoMonthlyDiff")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </AdminTableScroll>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">
                      {t("accCompKt20kReasonTagQuickFilter")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={kt20kReasonTagFilter.length === 0 ? "default" : "outline"}
                        onClick={() => setKt20kReasonTagFilter([])}
                      >
                        {t("all")}
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

                  <AdminTableScroll className="rounded border border-border/60" hint={false}>
                    <table className="w-full text-sm min-w-[760px]">
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
                              {t("accCompKt20kNoEmployeeDiff")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </AdminTableScroll>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {t("accCompKt20kNoReconcileData")}
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
          <AccountingCompliancePeriodTab
            t={t}
            storeTb={storeTb}
            periods={periods}
            periodUnlockReason={periodUnlockReason}
            setPeriodUnlockReason={setPeriodUnlockReason}
            periodUnlockApprovedBy={periodUnlockApprovedBy}
            setPeriodUnlockApprovedBy={setPeriodUnlockApprovedBy}
            canApproveUnlock={canApproveUnlock}
            canApproveCompliance={canApproveCompliance}
            togglePeriod={togglePeriod}
            accountingHealthLoading={accountingHealthLoading}
            accountingHealth={accountingHealth}
            loadAccountingHealth={loadAccountingHealth}
            closingYearMonth={closingYearMonth}
            setClosingYearMonth={setClosingYearMonth}
            isOffice={isOffice}
            setStoreTb={setStoreTb}
            storeOptions={storeOptions}
            storeOptionLabel={storeOptionLabel}
            closingProfitLossAccountCode={closingProfitLossAccountCode}
            setClosingProfitLossAccountCode={setClosingProfitLossAccountCode}
            closingLoading={closingLoading}
            loadIncomeExpenseClosingPreview={loadIncomeExpenseClosingPreview}
            closingAuditCsvUrl={closingAuditCsvUrl}
            closingMemo={closingMemo}
            setClosingMemo={setClosingMemo}
            closingAutoLock={closingAutoLock}
            setClosingAutoLock={setClosingAutoLock}
            closingPreview={closingPreview}
            closingDraftSaving={closingDraftSaving}
            closingPosting={closingPosting}
            saveIncomeExpenseClosingDraftNow={saveIncomeExpenseClosingDraftNow}
            runIncomeExpenseClosing={runIncomeExpenseClosing}
            closingDraft={closingDraft}
            closingDraftDiff={closingDraftDiff}
            closingPosted={closingPosted}
            closingHistory={closingHistory}
            closingHistoryExpandedId={closingHistoryExpandedId}
            setClosingHistoryExpandedId={setClosingHistoryExpandedId}
            auditYearMonth={auditYearMonth}
            setAuditYearMonth={setAuditYearMonth}
            auditDecision={auditDecision}
            setAuditDecision={setAuditDecision}
            auditActionKeyword={auditActionKeyword}
            setAuditActionKeyword={setAuditActionKeyword}
            auditLoading={auditLoading}
            loadComplianceAuditLogs={loadComplianceAuditLogs}
            complianceAuditCsvUrl={complianceAuditCsvUrl}
            auditFallbackUsed={auditFallbackUsed}
            auditKpi={auditKpi}
            auditPrevMonthStats={auditPrevMonthStats}
            auditDenyRateDelta={auditDenyRateDelta}
            auditTrendStats={auditTrendStats}
            auditRows={auditRows}
            auditExpandedRowKey={auditExpandedRowKey}
            setAuditExpandedRowKey={setAuditExpandedRowKey}
            etaxTaxId={etaxTaxId}
            setEtaxTaxId={setEtaxTaxId}
            etaxBranchCode={etaxBranchCode}
            setEtaxBranchCode={setEtaxBranchCode}
            etaxRdContactEmail={etaxRdContactEmail}
            setEtaxRdContactEmail={setEtaxRdContactEmail}
            etaxSenderGmail={etaxSenderGmail}
            setEtaxSenderGmail={setEtaxSenderGmail}
            etaxActivateCodeRef={etaxActivateCodeRef}
            setEtaxActivateCodeRef={setEtaxActivateCodeRef}
            etaxAttachmentInput={etaxAttachmentInput}
            setEtaxAttachmentInput={setEtaxAttachmentInput}
            etaxEvidenceUploading={etaxEvidenceUploading}
            uploadEtaxEvidenceFiles={uploadEtaxEvidenceFiles}
            etaxReminderMessages={etaxReminderMessages}
            etaxAttachmentUrls={etaxAttachmentUrls}
            etaxStepCountDone={etaxStepCountDone}
            etaxApplySubmitted={etaxApplySubmitted}
            etaxKo01Printed={etaxKo01Printed}
            etaxDocsUploaded={etaxDocsUploaded}
            etaxEmailConfirmed={etaxEmailConfirmed}
            etaxActivateCodeReceived={etaxActivateCodeReceived}
            etaxPasswordSet={etaxPasswordSet}
            etaxSenderEmailRegistered={etaxSenderEmailRegistered}
            etaxPilotIssued={etaxPilotIssued}
            etaxStepAudit={etaxStepAudit}
            toggleEtaxStep={toggleEtaxStep}
            etaxStepStamp={etaxStepStamp}
            etaxMemo={etaxMemo}
            setEtaxMemo={setEtaxMemo}
            etaxSaving={etaxSaving}
            canWriteCompliance={canWriteCompliance}
            saveEtaxTimestampProgress={saveEtaxTimestampProgress}
            etaxWorkflowRow={etaxWorkflowRow}
            etaxWorkflowMeta={etaxWorkflowMeta}
            workflowStatusLabel={workflowStatusLabel}
            etaxAuditCsvUrl={etaxAuditCsvUrl}
          />
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
              <table className="w-full text-sm">
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
          <AccountingComplianceSummaryTab
            t={t}
            lang={lang}
            taxMonth={taxMonth}
            setTaxMonth={setTaxMonth}
            storeTb={storeTb}
            setStoreTb={setStoreTb}
            isOffice={isOffice}
            isManager={isManager}
            managerStore={managerStore}
            periodType={periodType}
            setPeriodType={setPeriodType}
            ledgerStatusFilter={ledgerStatusFilter}
            setLedgerStatusFilter={setLedgerStatusFilter}
            storeOptions={storeOptions}
            storeOptionLabel={storeOptionLabel}
            taxEntityScopeOptions={taxEntityScopeOptions}
            loading={loading}
            setLoading={setLoading}
            canUse={canUse}
            role={role}
            canApproveUnlock={canApproveUnlock}
            canApproveCompliance={canApproveCompliance}
            storeFilterForApi={storeFilterForApi}
            storeFilterForLedger={storeFilterForLedger}
            isHeadOfficeLedgerStore={isHeadOfficeLedgerStore}
            summaryCardTitle={summaryCardTitle}
            summaryPeriodLabel={summaryPeriodLabel}
            summaryLoading={summaryLoading}
            isEmbeddedPp36Section={isEmbeddedPp36Section}
            isPnd5354CompactList={isPnd5354CompactList}
            showPnd5354SubToggle={showPnd5354SubToggle}
            lockWhtSubmissionFormHint={lockWhtSubmissionFormHint}
            pp30Queried={pp30Queried}
            setPp30Queried={setPp30Queried}
            setPp30SearchSeq={setPp30SearchSeq}
            onFilingSearch={onFilingSearch}
            handleDownloadPp30RdPrepTxt={handleDownloadPp30RdPrepTxt}
            handleDownloadPp30RdPrepExcel={handleDownloadPp30RdPrepExcel}
            handleDownloadPnd53RdFilingTxt={handleDownloadPnd53RdFilingTxt}
            pp30SubView={pp30SubView}
            setPp30SubView={setPp30SubView}
            allowedPp30Views={allowedPp30Views}
            canShowVatSettlement={canShowVatSettlement}
            pp30Mode={pp30Mode}
            pnd5354SubView={pnd5354SubView}
            setPnd5354SubView={setPnd5354SubView}
            taxLinkMetaLoading={taxLinkMetaLoading}
            pp30StoreLinkEval={pp30StoreLinkEval}
            pp30VendorLinkCounts={pp30VendorLinkCounts}
            onOpenStoreProfiles={onOpenStoreProfiles}
            pp30OpsOpen={pp30OpsOpen}
            setPp30OpsOpen={setPp30OpsOpen}
            pp30PeriodCloseLoading={pp30PeriodCloseLoading}
            pp30PeriodClose={pp30PeriodClose}
            togglePeriod={togglePeriod}
            hqSupplyProbeLoading={hqSupplyProbeLoading}
            hqSupplyReconcileApplicable={hqSupplyReconcileApplicable}
            intercompanyVatReconLoading={intercompanyVatReconLoading}
            loadIntercompanyVatRecon={loadIntercompanyVatRecon}
            intercompanyVatRecon={intercompanyVatRecon}
            vatStoreNameGapsLoading={vatStoreNameGapsLoading}
            vatStoreNameGaps={vatStoreNameGaps}
            outputSummaryNet={outputSummaryNet}
            outputSummaryVat={outputSummaryVat}
            outputSummaryPayable={outputSummaryPayable}
            nonPosOutputCount={nonPosOutputCount}
            vatFilteredStats={vatFilteredStats}
            taxSummary={taxSummary}
            whtFocusSummary={whtFocusSummary}
            whtFocusMode={whtFocusMode}
            vatRows={vatRows}
            setVatRows={setVatRows}
            vatExportUrl={vatExportUrl}
            vatOutputViewMode={vatOutputViewMode}
            setVatOutputViewMode={setVatOutputViewMode}
            posFilingOutputSummaries={posFilingOutputSummaries}
            vatOutputVendorSummaries={vatOutputVendorSummaries}
            vatOutputVendorTotals={vatOutputVendorTotals}
            saveVatRow={saveVatRow}
            removeVat={removeVat}
            filingStatusLabel={filingStatusLabel}
            vatSettlement={vatSettlement}
            vatInputRowsFiltered={vatInputRowsFiltered}
            vatInputClaimable={vatInputClaimable}
            vatInputViewMode={vatInputViewMode}
            setVatInputViewMode={setVatInputViewMode}
            vatInputVendorSummaries={vatInputVendorSummaries}
            vatInputVendorTotals={vatInputVendorTotals}
            loadVat={loadVat}
            loadWht={loadWht}
            vatSettlementHeadline={vatSettlementHeadline}
            showWhtLedger={showWhtLedger}
            showPp36Ledger={showPp36Ledger}
            showPnd54Ledger={showPnd54Ledger}
            showPnd1Area={showPnd1Area}
            showPnd91Area={showPnd91Area}
            showPnd353Tools={showPnd353Tools}
            pnd53Summary={pnd53Summary}
            pnd54Summary={pnd54Summary}
            whtPayeeTinGapCount={whtPayeeTinGapCount}
            whtRowsPnd53Display={whtRowsPnd53Display}
            whtRows={whtRows}
            setWhtRows={setWhtRows}
            whtRowsFiltered={whtRowsFiltered}
            whtRowRefs={whtRowRefs}
            whtExportUrl={whtExportUrl}
            whtSubmissionFormHint={whtSubmissionFormHint}
            setWhtSubmissionFormHint={setWhtSubmissionFormHint}
            printWhtCertificates={printWhtCertificates}
            saveWhtRow={saveWhtRow}
            removeWht={removeWht}
            pnd1PayerTaxId={pnd1PayerTaxId}
            setPnd1PayerTaxId={setPnd1PayerTaxId}
            pnd1PayerBranchNo={pnd1PayerBranchNo}
            setPnd1PayerBranchNo={setPnd1PayerBranchNo}
            pnd1PayerName={pnd1PayerName}
            setPnd1PayerName={setPnd1PayerName}
            pnd1FormMode={pnd1FormMode}
            setPnd1FormMode={setPnd1FormMode}
            pnd1IncludeHeader={pnd1IncludeHeader}
            setPnd1IncludeHeader={setPnd1IncludeHeader}
            pnd1PayerBoxTitle={pnd1PayerBoxTitle}
            pnd1FormLabel={pnd1FormLabel}
            pnd1RdPrepUrl={pnd1RdPrepUrl}
            pnd1RdPrepBtnLabel={pnd1RdPrepBtnLabel}
            pnd1RdPrepExcelUrl={pnd1RdPrepExcelUrl}
            pnd1RdPrepExcelBtnLabel={pnd1RdPrepExcelBtnLabel}
            pnd1Validating={pnd1Validating}
            runPnd1Validation={runPnd1Validation}
            pnd1ValidateBtnLabel={pnd1ValidateBtnLabel}
            pnd353Validating={pnd353Validating}
            runPnd353Validation={runPnd353Validation}
            payrollTinGapLoading={payrollTinGapLoading}
            runPayrollTinGapCheck={runPayrollTinGapCheck}
            pnd353ValidationResult={pnd353ValidationResult}
            pnd1ValidationResult={pnd1ValidationResult}
            setPnd1ValidationResult={setPnd1ValidationResult}
            pnd1ValidationTableTitle={pnd1ValidationTableTitle}
            pnd1IssueRowsFiltered={pnd1IssueRowsFiltered}
            pnd1IssueFilterCodes={pnd1IssueFilterCodes}
            setPnd1IssueFilterCodes={setPnd1IssueFilterCodes}
            pnd1IssueFilterLabel={pnd1IssueFilterLabel}
            pnd1IssueCountMap={pnd1IssueCountMap}
            togglePnd1IssueCode={togglePnd1IssueCode}
            pnd1IssueCodeLabel={pnd1IssueCodeLabel}
            pnd1NoIssueTooltip={pnd1NoIssueTooltip}
            pnd1IssueExportCsvLabel={pnd1IssueExportCsvLabel}
            exportPnd1ValidationCsv={exportPnd1ValidationCsv}
            pnd1ClearValidationLabel={pnd1ClearValidationLabel}
            pnd1GoLedgerBtnLabel={pnd1GoLedgerBtnLabel}
            jumpToWhtLedgerRow={jumpToWhtLedgerRow}
            pp36Rows={pp36Rows}
            setPp36Rows={setPp36Rows}
            pp36ExportUrl={pp36ExportUrl}
            loadPp36={loadPp36}
            savePp36Row={savePp36Row}
            removePp36={removePp36}
            pnd54Rows={pnd54Rows}
            setPnd54Rows={setPnd54Rows}
            pnd54ExportUrl={pnd54ExportUrl}
            loadPnd54={loadPnd54}
            savePnd54Row={savePnd54Row}
            removePnd54={removePnd54}
            pnd54RowsFiltered={pnd54RowsFiltered}
            pnd91Loading={pnd91Loading}
            loadPnd91={loadPnd91}
            pnd91Year={pnd91Year}
            pnd91ExportUrl={pnd91ExportUrl}
            pnd91Summary={pnd91Summary}
            setPnd91ChecklistTick={setPnd91ChecklistTick}
            payrollTinGapResult={payrollTinGapResult}
            setPayrollTinGapResult={setPayrollTinGapResult}
          />
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
                  {!isCitFilingShell ? (
                    <SelectItem value="monthly">{t("accCompPeriodMonthly")}</SelectItem>
                  ) : null}
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
            ) : isCitFilingShell && periodType === "half_year" ? (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompCitFiscalYear")}</div>
                  <Select
                    value={String(citFiscalYear)}
                    onValueChange={(v) => setCitHalfYearControls({ year: Number(v) })}
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
                <div>
                  <div className="text-xs text-muted-foreground mb-1">{t("accCompCitHalfYearSlot")}</div>
                  <Select
                    value={citHalfYearSlot}
                    onValueChange={(v) => setCitHalfYearControls({ slot: v as "H1" | "H2" })}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="H1">{t("accCompCitHalfH1")}</SelectItem>
                      <SelectItem value="H2">{t("accCompCitHalfH2")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : !isCitFilingShell ? (
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
            ) : isManager && managerStore ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">{t("accCompStore")}</div>
                <div className="flex h-9 min-w-[140px] max-w-[220px] items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground">
                  <span className="truncate">{managerStore}</span>
                </div>
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
          {isCitFilingShell && citData?.months?.length ? (
            <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2 text-sm">
              <div className="text-muted-foreground mb-1">{t("accCompCitPeriodMonths")}</div>
              <div className="flex flex-wrap gap-1.5">
                {citData.months.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center rounded-md border border-border/60 bg-background px-2 py-0.5 font-mono tabular-nums"
                  >
                    {m}
                  </span>
                ))}
              </div>
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
                {t("accCompCitFilingFormLabel")}: {String(citData?.pdfMeta?.formCode || citData?.filingForm || "-").toUpperCase()}
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
              <CardTitle className="text-sm">{t("accCompCitAdjustmentsDraftTitle")}</CardTitle>
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
                  {t("accCompVatAdd")}
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
                      <SelectItem value="add_back">{t("accCompCitAdjustmentTypeAddBack")}</SelectItem>
                      <SelectItem value="deduction">{t("accCompCitAdjustmentTypeDeduction")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={t("accCompCitAdjustmentsItem")}
                    value={row.itemName}
                    onChange={(e) =>
                      setCitAdjustmentsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, itemName: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder={t("accCompCitAdjustmentsAmount")}
                    value={row.amount}
                    onChange={(e) =>
                      setCitAdjustmentsDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder={t("accCompCitAdjustmentsMemo")}
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
          <AccountingComplianceSsoTab
            t={t}
            lang={lang}
            taxMonth={taxMonth}
            setTaxMonth={setTaxMonth}
            isOffice={isOffice}
            externalFiling={externalFiling}
            storeOptions={storeOptions}
            storeOptionLabel={storeOptionLabel}
            canApproveCompliance={canApproveCompliance}
            ssoSubView={ssoSubView}
            setSsoSubView={setSsoSubView}
            ssoStoreFilter={ssoStoreFilter}
            setSsoStoreFilter={setSsoStoreFilter}
            ssoSelectedStore={ssoSelectedStore}
            ssoQueried={ssoQueried}
            ssoPayrollLoading={ssoPayrollLoading}
            ssoPayrollRows={ssoPayrollRows}
            ssoPayrollPreview={ssoPayrollPreview}
            ssoPayrollLoadedAt={ssoPayrollLoadedAt}
            ssoEmployeePreviewRows={ssoEmployeePreviewRows}
            ssoStep2Ready={ssoStep2Ready}
            ssoFilingWageMode={ssoFilingWageMode}
            setSsoFilingWageMode={setSsoFilingWageMode}
            ssoSearchBtnClass={ssoSearchBtnClass}
            ssoPayrollExporting={ssoPayrollExporting}
            ssoStep3Ready={ssoStep3Ready}
            ssoAccountingSyncing={ssoAccountingSyncing}
            ssoSubmissionMemo={ssoSubmissionMemo}
            setSsoSubmissionMemo={setSsoSubmissionMemo}
            ssoAttachmentInput={ssoAttachmentInput}
            setSsoAttachmentInput={setSsoAttachmentInput}
            ssoAttachmentUrls={ssoAttachmentUrls}
            ssoEvidenceUploading={ssoEvidenceUploading}
            ssoSubmissionSaving={ssoSubmissionSaving}
            ssoStep4Ready={ssoStep4Ready}
            ssoWorkflowRow={ssoWorkflowRow}
            ssoWorkflowMeta={ssoWorkflowMeta}
            ssoHistoryRows={ssoHistoryRows}
            ssoHistoryLoading={ssoHistoryLoading}
            runSsoSearch={runSsoSearch}
            exportOfficialUploadFromPayroll={exportOfficialUploadFromPayroll}
            exportSps110FromPayroll={exportSps110FromPayroll}
            runSsoAccountingSync={runSsoAccountingSync}
            markSsoSubmissionDone={markSsoSubmissionDone}
            uploadSsoEvidenceFiles={uploadSsoEvidenceFiles}
            loadSsoSubmissionHistory={loadSsoSubmissionHistory}
            openSsoHistoryRow={openSsoHistoryRow}
          />
        </TabsContent>

        <TabsContent value="kt20k" className={cn(tabsContentClass, "space-y-3")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("accCompKt20kTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {t("accCompKt20kMvpScaffoldNote")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
                <Input
                  placeholder={t("accCompKt20kPhCompanyTaxId")}
                  value={kt20kEmployer.companyTaxId}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, companyTaxId: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  className="lg:col-span-2"
                  placeholder={t("accCompKt20kPhCompanyName")}
                  value={kt20kEmployer.companyName}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, companyName: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={t("accCompKt20kPhSsoProvince")}
                  value={kt20kEmployer.ssoProvince}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, ssoProvince: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={t("accCompKt20kPhSsoPhone")}
                  value={kt20kEmployer.ssoPhone}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, ssoPhone: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={t("accCompKt20kPhBusinessCode5")}
                  value={kt20kEmployer.businessCode5}
                  onChange={(e) => setKt20kEmployer((p) => ({ ...p, businessCode5: e.target.value }))}
                  disabled={kt20kSettingsLoading || kt20kSettingsSaving}
                />
                <Input
                  placeholder={t("accCompKt20kPhFundRatePercent")}
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
                  {kt20kSettingsSaving ? t("loading") : t("accCompKt20kSaveSettings")}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={kt20kExportUrl} target="_blank" rel="noopener noreferrer">
                    {t("accCompVatExport")}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("accCompKt20kMonthlySummaryTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[980px]">
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
                <div className="p-6 text-center text-muted-foreground text-sm">
                  {t("accCompKt20kNoData")}
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
            <CardContent className="space-y-2 text-sm">
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
                <AdminTableScroll className="rounded border border-border/60" hint={false}>
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
                </AdminTableScroll>
              ) : (
                <div className="text-muted-foreground">{t("accCompReminderEmpty")}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 overflow-x-auto">
              <table className="w-full text-sm">
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
