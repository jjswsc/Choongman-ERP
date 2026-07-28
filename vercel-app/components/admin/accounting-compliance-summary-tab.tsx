"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ExternalLink, Save, Plus, Trash2, Download, ChevronDown, Printer } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { tr } from "@/lib/i18n"
import { apiFetch } from "@/lib/api-client"
import type {
  IntercompanyVatReconcileReportDto,
  VatLedgerStoreNameGapsReportDto,
  ThaiTaxFilingSummary,
  ValidatePnd1RdPrepResult,
  ValidatePnd3Pnd53Result,
  PayrollWhtTinGapResult,
  Pnd91AnnualSummaryResult,
} from "@/lib/api-client"
import type { StoreVendorLinkEvaluation } from "@/lib/store-vendor-tax-link"
import { StoreVendorTaxLinkBanner } from "@/components/admin/tax-filing/store-vendor-tax-link-banner"
import { RdPrepFilingHelper } from "@/components/admin/tax-filing/rd-prep-filing-helper"
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
import { appAlert } from "@/lib/app-message"
import { downloadAuthenticatedFile } from "@/lib/download-authenticated-file"
import type {
  VatDraft,
  WhtDraft,
  Pp36Draft,
  Pnd54Draft,
  Pnd1IssueCode,
} from "./admin-accounting-compliance-types"
import { PND1_ISSUE_CODES } from "./admin-accounting-compliance-types"
import {
  emptyVat,
  emptyWht,
  emptyPp36,
  emptyPnd54,
  formatBangkokDateTime,
} from "./admin-accounting-compliance-utils"
import { isPosAutoVatOutputRow } from "@/lib/vat-ledger-pos"
import type { VatLedgerRow } from "@/lib/vat-ledger-csv"
import {
  readPnd91ChecklistEntry,
  writePnd91ChecklistEntry,
  type Pnd91ChecklistStatus,
} from "@/lib/pnd91-checklist-storage"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AccountingComplianceSummaryTabProps {
  t: (key: string) => string
  lang: string

  // Filters & common
  taxMonth: string
  setTaxMonth: (v: string) => void
  storeTb: string
  setStoreTb: ((v: string) => void) | undefined
  isOffice: boolean
  isManager: boolean
  managerStore: string
  periodType: "monthly" | "half_year" | "annual"
  setPeriodType: (v: "monthly" | "half_year" | "annual") => void
  ledgerStatusFilter: "all" | "draft" | "submitted"
  setLedgerStatusFilter: (v: "all" | "draft" | "submitted") => void
  storeOptions: string[]
  storeOptionLabel: (code: string) => string
  loading: boolean
  setLoading: (v: boolean) => void
  canUse: boolean
  role: string
  canApproveUnlock: boolean
  canApproveCompliance: boolean
  storeFilterForApi: string
  storeFilterForLedger: string
  isHeadOfficeLedgerStore: boolean

  // Summary card
  summaryCardTitle: string
  summaryPeriodLabel: string
  summaryLoading: boolean
  isEmbeddedPp36Section: boolean
  isPnd5354CompactList: boolean
  /** pnd5354 통합 탭일 때만 53/54 하위 토글 표시 */
  showPnd5354SubToggle?: boolean
  /** pnd3/pnd53 단일 탭일 때 서식 힌트 셀렉트 숨김 */
  lockWhtSubmissionFormHint?: boolean

  // PP30 search / nav
  pp30Queried: boolean
  setPp30Queried: (v: boolean) => void
  setPp30SearchSeq: React.Dispatch<React.SetStateAction<number>>
  onFilingSearch?: () => void
  handleDownloadPp30RdPrepTxt: () => void
  handleDownloadPp30RdPrepExcel: () => void
  handleDownloadPnd53RdFilingTxt: () => void

  // PP30 sub-views
  pp30SubView: "output" | "input" | "settlement" | "wht"
  setPp30SubView: (v: "output" | "input" | "settlement" | "wht") => void
  allowedPp30Views: ("output" | "input" | "settlement" | "wht")[]
  canShowVatSettlement: boolean
  pp30Mode: string
  pnd5354SubView: "pnd53" | "pnd54"
  setPnd5354SubView: (v: "pnd53" | "pnd54") => void

  // Tax link banner
  taxLinkMetaLoading: boolean
  pp30StoreLinkEval: StoreVendorLinkEvaluation | null
  pp30VendorLinkCounts: { missing: number; inferred: number; total: number }
  onOpenStoreProfiles?: () => void

  // PP30 ops section
  pp30OpsOpen: boolean
  setPp30OpsOpen: (v: boolean) => void
  pp30PeriodCloseLoading: boolean
  pp30PeriodClose: { isClosed: boolean; closedViaAll?: boolean } | null
  togglePeriod: (yearMonth: string, closed: boolean) => Promise<void>
  hqSupplyProbeLoading: boolean
  hqSupplyReconcileApplicable: boolean | null
  intercompanyVatReconLoading: boolean
  loadIntercompanyVatRecon: () => Promise<void>
  intercompanyVatRecon: IntercompanyVatReconcileReportDto | null

  // Store name gaps
  vatStoreNameGapsLoading: boolean
  vatStoreNameGaps: VatLedgerStoreNameGapsReportDto | null

  // VAT output
  outputSummaryNet: number
  outputSummaryVat: number
  outputSummaryPayable: number
  nonPosOutputCount: number
  vatFilteredStats: { rowCount: number; missingTaxIdCount: number; missingInvoiceCount: number }
  taxSummary: ThaiTaxFilingSummary | null
  vatRows: VatDraft[]
  setVatRows: React.Dispatch<React.SetStateAction<VatDraft[]>>
  vatExportUrl: string
  vatOutputViewMode: "vendor" | "detail"
  setVatOutputViewMode: (v: "vendor" | "detail") => void
  posFilingOutputSummaries: VatLedgerRow[]
  vatOutputVendorSummaries: { name: string; count: number; net: number; vat: number; total: number }[]
  vatOutputVendorTotals: { count: number; net: number; vat: number; total: number }
  saveVatRow: (row: VatDraft) => Promise<void>
  removeVat: (row: VatDraft) => Promise<void>
  filingStatusLabel: (v: "draft" | "submitted") => string

  // VAT input
  vatSettlement: {
    inputNet: number
    inputVat: number
    /** 공제 가능(증빙 수령·불필요) 매입 VAT — 납부액 계산에 사용 */
    claimableInputVat: number
    claimableInputNet: number
    claimableInputCount: number
    outputNet: number
    outputVat: number
    payableVat: number
    inputCount: number
    outputCount: number
    posOutputVat: number
    posOutputNet: number
    posOutputCount: number
    otherOutputVat: number
    otherOutputNet: number
    otherOutputCount: number
    summaryPayableVat: number
  }
  vatInputRowsFiltered: VatDraft[]
  vatInputClaimable: {
    claimableVat: number
    claimableNet: number
    pendingVat: number
    unobtainableVat: number
    claimableCount: number
    pendingCount: number
    unobtainableCount: number
  }
  vatInputViewMode: "vendor" | "detail"
  setVatInputViewMode: (v: "vendor" | "detail") => void
  vatInputVendorSummaries: { name: string; count: number; net: number; vat: number; total: number }[]
  vatInputVendorTotals: { count: number; net: number; vat: number; total: number }
  loadVat: (opts?: { forceSync?: boolean }) => Promise<void>

  // VAT settlement
  vatSettlementHeadline: { className: string; tone: string }

  // WHT section
  showWhtLedger: boolean
  showPp36Ledger: boolean
  showPnd54Ledger: boolean
  showPnd1Area: boolean
  showPnd353Tools: boolean
  pnd53Summary: { gross: number; withheld: number; count: number }
  pnd54Summary: { gross: number; withheld: number; count: number }
  whtPayeeTinGapCount: number
  whtRowsPnd53Display: WhtDraft[]
  whtRows: WhtDraft[]
  setWhtRows: React.Dispatch<React.SetStateAction<WhtDraft[]>>
  whtRowsFiltered: WhtDraft[]
  whtRowRefs: React.MutableRefObject<Record<number, HTMLDivElement | null>>
  whtExportUrl: string
  whtSubmissionFormHint: "PND3" | "PND53" | "ALL"
  setWhtSubmissionFormHint: (v: "PND3" | "PND53" | "ALL") => void
  printWhtCertificates: (rows: WhtDraft[]) => Promise<void>
  saveWhtRow: (row: WhtDraft) => Promise<void>
  removeWht: (row: WhtDraft) => Promise<void>

  // PND1 section
  pnd1PayerTaxId: string
  setPnd1PayerTaxId: (v: string) => void
  pnd1PayerBranchNo: string
  setPnd1PayerBranchNo: (v: string) => void
  pnd1PayerName: string
  setPnd1PayerName: (v: string) => void
  pnd1FormMode: "auto" | "pnd1" | "pnd1a" | "all"
  setPnd1FormMode: (v: "auto" | "pnd1" | "pnd1a" | "all") => void
  pnd1IncludeHeader: boolean
  setPnd1IncludeHeader: (v: boolean) => void
  pnd1PayerBoxTitle: string
  pnd1FormLabel: string
  pnd1RdPrepUrl: string
  pnd1RdPrepBtnLabel: string
  pnd1RdPrepGuideTitle: string
  pnd1RdPrepGuideNote: string
  pnd1Validating: boolean
  runPnd1Validation: () => Promise<void>
  pnd1ValidateBtnLabel: string
  pnd353Validating: boolean
  runPnd353Validation: () => Promise<void>
  payrollTinGapLoading: boolean
  runPayrollTinGapCheck: () => Promise<void>
  pnd353ValidationResult: ValidatePnd3Pnd53Result | null
  pnd1ValidationResult: ValidatePnd1RdPrepResult | null
  setPnd1ValidationResult: (v: ValidatePnd1RdPrepResult | null) => void
  pnd1ValidationTableTitle: string
  pnd1IssueRowsFiltered: ValidatePnd1RdPrepResult["issues"]
  pnd1IssueFilterCodes: Pnd1IssueCode[]
  setPnd1IssueFilterCodes: (v: Pnd1IssueCode[]) => void
  pnd1IssueFilterLabel: string
  pnd1IssueCountMap: Record<string, number>
  togglePnd1IssueCode: (code: Pnd1IssueCode) => void
  pnd1IssueCodeLabel: (code: string) => string
  pnd1NoIssueTooltip: string
  pnd1IssueExportCsvLabel: string
  exportPnd1ValidationCsv: () => void
  pnd1ClearValidationLabel: string
  pnd1GoLedgerBtnLabel: string
  jumpToWhtLedgerRow: (rowId: number | null) => void

  // PP36 section
  pp36Rows: Pp36Draft[]
  setPp36Rows: React.Dispatch<React.SetStateAction<Pp36Draft[]>>
  pp36ExportUrl: string
  loadPp36: () => Promise<void>
  savePp36Row: (row: Pp36Draft) => Promise<void>
  removePp36: (row: Pp36Draft) => Promise<void>

  // PND54 section
  pnd54Rows: Pnd54Draft[]
  setPnd54Rows: React.Dispatch<React.SetStateAction<Pnd54Draft[]>>
  pnd54ExportUrl: string
  loadPnd54: () => Promise<void>
  savePnd54Row: (row: Pnd54Draft) => Promise<void>
  removePnd54: (row: Pnd54Draft) => Promise<void>
  pnd54RowsFiltered: Pnd54Draft[]

  // PND91 section
  pnd91Loading: boolean
  loadPnd91: () => Promise<void>
  pnd91Year: number | null
  pnd91ExportUrl: string
  pnd91Summary: Pnd91AnnualSummaryResult | null
  setPnd91ChecklistTick: React.Dispatch<React.SetStateAction<number>>

  // Payroll TIN gap
  payrollTinGapResult: PayrollWhtTinGapResult | null
  setPayrollTinGapResult: (v: PayrollWhtTinGapResult | null) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountingComplianceSummaryTab(props: AccountingComplianceSummaryTabProps) {
  const {
    t,
    lang,
    taxMonth,
    setTaxMonth,
    storeTb,
    setStoreTb,
    isOffice,
    isManager,
    managerStore,
    periodType,
    setPeriodType,
    ledgerStatusFilter,
    setLedgerStatusFilter,
    storeOptions,
    storeOptionLabel,
    loading,
    setLoading,
    canUse,
    role,
    canApproveUnlock,
    canApproveCompliance,
    storeFilterForApi,
    storeFilterForLedger,
    isHeadOfficeLedgerStore,
    summaryCardTitle,
    summaryPeriodLabel,
    summaryLoading,
    isEmbeddedPp36Section,
    isPnd5354CompactList,
    showPnd5354SubToggle = true,
    lockWhtSubmissionFormHint = false,
    pp30Queried,
    setPp30Queried,
    setPp30SearchSeq,
    onFilingSearch,
    handleDownloadPp30RdPrepTxt,
    handleDownloadPp30RdPrepExcel,
    handleDownloadPnd53RdFilingTxt,
    pp30SubView,
    setPp30SubView,
    allowedPp30Views,
    canShowVatSettlement,
    pp30Mode,
    pnd5354SubView,
    setPnd5354SubView,
    taxLinkMetaLoading,
    pp30StoreLinkEval,
    pp30VendorLinkCounts,
    onOpenStoreProfiles,
    pp30OpsOpen,
    setPp30OpsOpen,
    pp30PeriodCloseLoading,
    pp30PeriodClose,
    togglePeriod,
    hqSupplyProbeLoading,
    hqSupplyReconcileApplicable,
    intercompanyVatReconLoading,
    loadIntercompanyVatRecon,
    intercompanyVatRecon,
    vatStoreNameGapsLoading,
    vatStoreNameGaps,
    outputSummaryNet,
    outputSummaryVat,
    outputSummaryPayable,
    nonPosOutputCount,
    vatFilteredStats,
    taxSummary,
    vatRows,
    setVatRows,
    vatExportUrl,
    vatOutputViewMode,
    setVatOutputViewMode,
    posFilingOutputSummaries,
    vatOutputVendorSummaries,
    vatOutputVendorTotals,
    saveVatRow,
    removeVat,
    filingStatusLabel,
    vatSettlement,
    vatInputRowsFiltered,
    vatInputClaimable,
    vatInputViewMode,
    setVatInputViewMode,
    vatInputVendorSummaries,
    vatInputVendorTotals,
    loadVat,
    vatSettlementHeadline,
    showWhtLedger,
    showPp36Ledger,
    showPnd54Ledger,
    showPnd1Area,
    showPnd353Tools,
    pnd53Summary,
    pnd54Summary,
    whtPayeeTinGapCount,
    whtRowsPnd53Display,
    whtRows,
    setWhtRows,
    whtRowsFiltered,
    whtRowRefs,
    whtExportUrl,
    whtSubmissionFormHint,
    setWhtSubmissionFormHint,
    printWhtCertificates,
    saveWhtRow,
    removeWht,
    pnd1PayerTaxId,
    setPnd1PayerTaxId,
    pnd1PayerBranchNo,
    setPnd1PayerBranchNo,
    pnd1PayerName,
    setPnd1PayerName,
    pnd1FormMode,
    setPnd1FormMode,
    pnd1IncludeHeader,
    setPnd1IncludeHeader,
    pnd1PayerBoxTitle,
    pnd1FormLabel,
    pnd1RdPrepUrl,
    pnd1RdPrepBtnLabel,
    pnd1RdPrepGuideTitle,
    pnd1RdPrepGuideNote,
    pnd1Validating,
    runPnd1Validation,
    pnd1ValidateBtnLabel,
    pnd353Validating,
    runPnd353Validation,
    payrollTinGapLoading,
    runPayrollTinGapCheck,
    pnd353ValidationResult,
    pnd1ValidationResult,
    setPnd1ValidationResult,
    pnd1ValidationTableTitle,
    pnd1IssueRowsFiltered,
    pnd1IssueFilterCodes,
    setPnd1IssueFilterCodes,
    pnd1IssueFilterLabel,
    pnd1IssueCountMap,
    togglePnd1IssueCode,
    pnd1IssueCodeLabel,
    pnd1NoIssueTooltip,
    pnd1IssueExportCsvLabel,
    exportPnd1ValidationCsv,
    pnd1ClearValidationLabel,
    pnd1GoLedgerBtnLabel,
    jumpToWhtLedgerRow,
    pp36Rows,
    setPp36Rows,
    pp36ExportUrl,
    loadPp36,
    savePp36Row,
    removePp36,
    pnd54Rows,
    setPnd54Rows,
    pnd54ExportUrl,
    loadPnd54,
    savePnd54Row,
    removePnd54,
    pnd54RowsFiltered,
    pnd91Loading,
    loadPnd91,
    pnd91Year,
    pnd91ExportUrl,
    pnd91Summary,
    setPnd91ChecklistTick,
    payrollTinGapResult,
    setPayrollTinGapResult,
  } = props

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{summaryCardTitle}</CardTitle>
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
              <Select value={storeTb} onValueChange={setStoreTb!}>
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
          <div className="shrink-0 flex items-end gap-1">
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
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={loading || summaryLoading}
              title={t("accCompVatForceSyncHint")}
              onClick={() => {
                setPp30Queried(true)
                void loadVat({ forceSync: true })
              }}
            >
              {t("accCompVatForceSync")}
            </Button>
          </div>
          <div className="shrink-0 flex items-end gap-1">
            {pp30Mode !== "wht_only" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
                    "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
                    "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
                    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                  )}
                  disabled={loading || summaryLoading}
                  onClick={() => void handleDownloadPp30RdPrepTxt()}
                >
                  <Download className="h-4 w-4 mr-1 shrink-0" aria-hidden />
                  {t("accCompPp30RdPrepTxt")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
                    "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
                    "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
                    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                  )}
                  disabled={loading || summaryLoading}
                  onClick={() => void handleDownloadPp30RdPrepExcel()}
                >
                  <Download className="h-4 w-4 mr-1 shrink-0" aria-hidden />
                  {t("accCompPp30RdPrepExcel")}
                </Button>
                <RdPrepFilingHelper
                  t={t}
                  variant="compact"
                  mappingGuideBody={t("accCompRdPrepMappingGuideBodyPp30")}
                />
              </>
            ) : showPnd1Area ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
                    "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
                    "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
                    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                  )}
                  disabled={loading || summaryLoading}
                  onClick={() => {
                    if (!pp30Queried) {
                      appAlert(t("accCompPp30ExportNeedSearch"))
                      return
                    }
                    void downloadAuthenticatedFile(
                      pnd1RdPrepUrl,
                      `PND1_${taxMonth}.txt`
                    ).catch((e) => {
                      const detail = e instanceof Error ? e.message : String(e || "")
                      appAlert(
                        detail
                          ? `${t("accCompPp30RdPrepDownloadFail")}\n(${detail.slice(0, 220)})`
                          : t("accCompPp30RdPrepDownloadFail")
                      )
                    })
                  }}
                >
                  <Download className="h-4 w-4 mr-1 shrink-0" aria-hidden />
                  {pnd1RdPrepBtnLabel}
                </Button>
                <RdPrepFilingHelper
                  t={t}
                  variant="compact"
                  mappingGuideBody={t("accCompRdPrepMappingGuideBodyPnd1")}
                />
              </>
            ) : isPnd5354CompactList && pnd5354SubView === "pnd53" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "h-9 font-medium shadow-sm transition-[transform,box-shadow,background-color,color,opacity] duration-200 ease-out",
                    "hover:-translate-y-px hover:shadow-md hover:brightness-[1.06] dark:hover:brightness-110",
                    "active:translate-y-0 active:scale-[0.97] active:shadow-inner active:brightness-[0.96] dark:active:brightness-95",
                    "motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
                  )}
                  disabled={loading || summaryLoading}
                  onClick={() => void handleDownloadPnd53RdFilingTxt()}
                >
                  <Download className="h-4 w-4 mr-1 shrink-0" aria-hidden />
                  {t("accCompPnd53RdFilingTxt")}
                </Button>
                <RdPrepFilingHelper
                  t={t}
                  variant="compact"
                  mappingGuideBody={t("accCompRdPrepMappingGuideBodyPnd53")}
                />
              </>
            ) : null}
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
                  <div className="text-sm font-bold">{t("accCompVatPeriodLockTitle")}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t("accCompVatPeriodLockHint")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm">{taxMonth}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono text-sm">{storeFilterForLedger}</span>
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
                  <div className="text-sm font-bold">{t("accCompIntercompanyReconcileTitle")}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t("accCompIntercompanyReconcileHint")}</p>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void loadIntercompanyVatRecon()} disabled={intercompanyVatReconLoading}>
                    {intercompanyVatReconLoading ? t("loading") : t("accCompReloadReconcile")}
                  </Button>
                  {intercompanyVatRecon ? (
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        <div>{t("accCompIntercompanyIssued")}: <b>{intercompanyVatRecon.issuedCount.toLocaleString()}</b></div>
                        <div>{t("accCompIntercompanyMissing")}: <b>{intercompanyVatRecon.missingInStoreCount.toLocaleString()}</b></div>
                        <div>{t("accCompIntercompanyDiff")}: <b>{intercompanyVatRecon.diffCount.toLocaleString()}</b></div>
                        <div>{t("accCompIntercompanyMatched")}: <b>{intercompanyVatRecon.matchedCount.toLocaleString()}</b></div>
                      </div>
                      {intercompanyVatRecon.rows.length > 0 ? (
                        <div className="rounded border border-border/60 overflow-auto max-h-48">
                          <table className="w-full text-sm">
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

        {!pp30Queried ? (
          <AccountingEmptyState>
            {isEmbeddedPp36Section
              ? t("accCompPp36EmbeddedSearchHint")
              : isPnd5354CompactList
                ? t("accCompPnd5354EmptySearchHint")
                : showPp36Ledger && pp30Mode === "wht_only"
                  ? t("accCompPp36EmptySearchHint")
                  : t("accCompPp30EmptySearchHint")}
          </AccountingEmptyState>
        ) : (
          <>
        {!isPnd5354CompactList && vatStoreNameGapsLoading ? (
          <p className="text-xs text-muted-foreground">{t("accCompStoreNameGapsLoading")}</p>
        ) : null}
        {!isPnd5354CompactList && vatStoreNameGaps && vatStoreNameGaps.emptyStoreNameRowCount > 0 ? (
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
        {!isEmbeddedPp36Section && isPnd5354CompactList && showPnd5354SubToggle ? (
        <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
          <Button
            type="button"
            size="sm"
            variant={pnd5354SubView === "pnd53" ? "default" : "outline"}
            onClick={() => setPnd5354SubView("pnd53")}
          >
            {t("accCompPnd5354SubPnd53")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={pnd5354SubView === "pnd54" ? "default" : "outline"}
            onClick={() => setPnd5354SubView("pnd54")}
          >
            {t("accCompPnd5354SubPnd54")}
          </Button>
        </div>
        ) : null}
        {!isEmbeddedPp36Section && !isPnd5354CompactList ? (
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
        <AccountingPeriodChip>
          {t("accCompPeriodType")}: {summaryPeriodLabel}
        </AccountingPeriodChip>
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
            <AccountingStatGrid>
              <AccountingStatCard
                label={t("accCompVatOutputNet")}
                value={Math.round(outputSummaryNet).toLocaleString()}
              />
              <AccountingStatCard
                label={t("accCompVatOutputVat")}
                value={Math.round(outputSummaryVat).toLocaleString()}
              />
              <AccountingStatCard
                label={t("accCompVatPayable")}
                value={Math.round(outputSummaryPayable).toLocaleString()}
                tone={outputSummaryPayable > 0 ? "warn" : "default"}
              />
              <AccountingStatCard
                label={t("accCompVatRowsSales")}
                value={`${nonPosOutputCount.toLocaleString()} / ${vatFilteredStats.rowCount.toLocaleString()}`}
              />
              <AccountingStatCard
                label={t("accCompMissingTin")}
                value={vatFilteredStats.missingTaxIdCount.toLocaleString()}
                tone={vatFilteredStats.missingTaxIdCount > 0 ? "warn" : "ok"}
              />
              <AccountingStatCard
                label={t("accCompMissingInvoice")}
                value={vatFilteredStats.missingInvoiceCount.toLocaleString()}
                tone={vatFilteredStats.missingInvoiceCount > 0 ? "warn" : "ok"}
              />
            </AccountingStatGrid>
            {taxSummary && allowedPp30Views.includes("wht") ? (
              <div className="rounded-lg border border-border/70 bg-muted/15 p-3 text-xs space-y-2">
                <div className="font-medium text-foreground/90">{t("accCompPp30WhtSamePeriod")}</div>
                <AccountingStatGrid className="grid-cols-2 md:grid-cols-4">
                  <AccountingStatCard
                    label={t("accCompWhtLabelGross")}
                    value={(taxSummary.wht.totalGross || 0).toLocaleString()}
                  />
                  <AccountingStatCard
                    label={t("accCompWhtLabelWithheld")}
                    value={(taxSummary.wht.totalWithheld || 0).toLocaleString()}
                  />
                  <AccountingStatCard
                    label={t("accCompWhtLabelRows")}
                    value={(taxSummary.wht.rowCount || 0).toLocaleString()}
                  />
                  <AccountingStatCard
                    label={t("accCompMissingTinWht")}
                    value={(taxSummary.wht.missingTaxIdCount || 0).toLocaleString()}
                    tone={(taxSummary.wht.missingTaxIdCount || 0) > 0 ? "warn" : "ok"}
                  />
                </AccountingStatGrid>
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
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2 text-sm">
                    <div className="font-medium text-foreground">{t("accCompPosSalesAutoTitle")}</div>
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
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {nonPosOutputCount > 0 ? (
                  <div className="text-[11px] font-medium text-muted-foreground px-0.5">{t("accCompNonPosSalesEdit")}</div>
                ) : null}
                {vatOutputViewMode === "vendor" ? (
                  <AccountingTableShell>
                    <AccountingTableHead>
                      <th className={accountingResultThCn}>{t("accCompColVendorName")}</th>
                      <th className={accountingResultThRightCn}>{t("accCompColCount")}</th>
                      <th className={accountingResultThRightCn}>{t("accCompLabelNetAmount")}</th>
                      <th className={accountingResultThRightCn}>{t("accCompPhVat")}</th>
                      <th className={accountingResultThRightCn}>{t("accCompLabelGrandTotal")}</th>
                    </AccountingTableHead>
                    <tbody>
                      {vatOutputVendorSummaries.map((row) => (
                        <AccountingTableBodyRow key={`vendor-sum-${row.name}`}>
                          <td className={accountingResultTdCn}>{row.name}</td>
                          <td className={accountingResultTdRightCn}>{row.count.toLocaleString()}</td>
                          <td className={accountingResultTdRightCn}>{Math.round(row.net).toLocaleString()}</td>
                          <td className={accountingResultTdRightCn}>{Math.round(row.vat).toLocaleString()}</td>
                          <td className={accountingResultTdRightCn}>{Math.round(row.total).toLocaleString()}</td>
                        </AccountingTableBodyRow>
                      ))}
                      {!vatOutputVendorSummaries.length ? (
                        <AccountingTableBodyRow>
                          <td className={`${accountingResultTdCn} text-center text-muted-foreground py-6`} colSpan={5}>
                            {t("emp_result_empty")}
                          </td>
                        </AccountingTableBodyRow>
                      ) : null}
                    </tbody>
                    {vatOutputVendorSummaries.length ? (
                      <tfoot>
                        <AccountingTableFootRow>
                          <td className={accountingResultTdCn}>{t("accCompTotalsFooter")}</td>
                          <td className={accountingResultTdRightCn}>
                            {vatOutputVendorTotals.count.toLocaleString()}
                          </td>
                          <td className={accountingResultTdRightCn}>
                            {Math.round(vatOutputVendorTotals.net).toLocaleString()}
                          </td>
                          <td className={accountingResultTdRightCn}>
                            {Math.round(vatOutputVendorTotals.vat).toLocaleString()}
                          </td>
                          <td className={accountingResultTdRightCn}>
                            {Math.round(vatOutputVendorTotals.total).toLocaleString()}
                          </td>
                        </AccountingTableFootRow>
                      </tfoot>
                    ) : null}
                  </AccountingTableShell>
                ) : null}
                {vatOutputViewMode === "detail" ? vatRows.map((row, idx) => {
                  if (row.direction !== "output") return null
                  if (ledgerStatusFilter !== "all" && row.filing_status !== ledgerStatusFilter) return null
                  if (isPosAutoVatOutputRow(row)) return null
                  return (
                    <div
                      key={row.id ?? `vat-out-${idx}`}
                      className={accountingLedgerEntryGridCn}
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
                          <SelectValue placeholder={t("accCompEvidenceStatusPh")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="required_pending">{t("accCompEvidenceStatusPending")}</SelectItem>
                          <SelectItem value="received">{t("accCompEvidenceStatusReceived")}</SelectItem>
                          <SelectItem value="not_required">{t("accCompEvidenceStatusNotRequired")}</SelectItem>
                          <SelectItem value="unobtainable">{t("accCompEvidenceStatusUnobtainable")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="md:col-span-2"
                        placeholder={t("accCompEvidenceReasonCodePh")}
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
                  <div className="p-6 text-center text-muted-foreground text-sm">{t("emp_result_empty")}</div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}

        {pp30SubView === "input" && (
          <div className="space-y-3 text-sm">
            <AccountingStatGrid>
              <AccountingStatCard
                label={t("accCompVatInputNet")}
                value={Math.round(vatSettlement.inputNet).toLocaleString()}
              />
              <AccountingStatCard
                label={t("accCompVatInputVat")}
                value={Math.round(vatSettlement.inputVat).toLocaleString()}
              />
              <AccountingStatCard
                label={t("accCompVatPayable")}
                value={Math.round(vatSettlement.payableVat).toLocaleString()}
                tone={vatSettlement.payableVat > 0 ? "warn" : "default"}
              />
              <AccountingStatCard
                label={t("accCompVatRowsPurchase")}
                value={`${vatInputRowsFiltered.length.toLocaleString()} / ${vatFilteredStats.rowCount.toLocaleString()}`}
              />
            </AccountingStatGrid>
            <AccountingStatGrid>
              <AccountingStatCard label={t("accCompVatClaimableInputVat")} value={Math.round(vatInputClaimable.claimableVat).toLocaleString()} tone="ok" />
              <AccountingStatCard label={t("accCompVatPendingEvidenceVat")} value={Math.round(vatInputClaimable.pendingVat).toLocaleString()} tone="warn" />
              <AccountingStatCard label={t("accCompVatExcludedVat")} value={Math.round(vatInputClaimable.unobtainableVat).toLocaleString()} />
              <AccountingStatCard
                label={t("accCompVatEvidenceCheckCounts")}
                value={`${vatInputClaimable.claimableCount}/${vatInputClaimable.pendingCount}/${vatInputClaimable.unobtainableCount}`}
              />
            </AccountingStatGrid>
            {taxSummary && allowedPp30Views.includes("wht") ? (
              <div className="rounded-lg border border-border/70 bg-muted/15 p-3 text-xs space-y-2">
                <div className="font-medium text-foreground/90">{t("accCompPp30WhtSamePeriod")}</div>
                <AccountingStatGrid className="grid-cols-2 md:grid-cols-4">
                  <AccountingStatCard
                    label={t("accCompWhtLabelGross")}
                    value={(taxSummary.wht.totalGross || 0).toLocaleString()}
                  />
                  <AccountingStatCard
                    label={t("accCompWhtLabelWithheld")}
                    value={(taxSummary.wht.totalWithheld || 0).toLocaleString()}
                  />
                  <AccountingStatCard
                    label={t("accCompWhtLabelRows")}
                    value={(taxSummary.wht.rowCount || 0).toLocaleString()}
                  />
                  <AccountingStatCard
                    label={t("accCompMissingTinWht")}
                    value={(taxSummary.wht.missingTaxIdCount || 0).toLocaleString()}
                    tone={(taxSummary.wht.missingTaxIdCount || 0) > 0 ? "warn" : "ok"}
                  />
                </AccountingStatGrid>
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
                    <table className="w-full text-sm">
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
                      className={accountingLedgerEntryGridCn}
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
                          <SelectValue placeholder={t("accCompEvidenceStatusPh")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="required_pending">{t("accCompEvidenceStatusPending")}</SelectItem>
                          <SelectItem value="received">{t("accCompEvidenceStatusReceived")}</SelectItem>
                          <SelectItem value="not_required">{t("accCompEvidenceStatusNotRequired")}</SelectItem>
                          <SelectItem value="unobtainable">{t("accCompEvidenceStatusUnobtainable")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="md:col-span-2"
                        placeholder={t("accCompEvidenceReasonCodePh")}
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
                  <div className="p-6 text-center text-muted-foreground text-sm">{t("emp_result_empty")}</div>
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

            <div className="rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {t("accCompVatSalesBasisNote")}
              {vatSettlement.posOutputCount > 0 || vatSettlement.otherOutputCount > 0 ? (
                <div className="mt-1 tabular-nums text-foreground/80">
                  {tr(t, "accCompVatSalesBasisBreakdown", {
                    posVat: Math.round(vatSettlement.posOutputVat).toLocaleString(),
                    posCount: vatSettlement.posOutputCount.toLocaleString(),
                    otherVat: Math.round(vatSettlement.otherOutputVat).toLocaleString(),
                    otherCount: vatSettlement.otherOutputCount.toLocaleString(),
                  })}
                </div>
              ) : null}
              {!isHeadOfficeLedgerStore ? (
                <div className="mt-1.5 text-foreground/80">{t("accCompVatStorePurchaseHint")}</div>
              ) : null}
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
                <div className="text-xs text-muted-foreground">{t("accCompVatClaimableInputVatSumLabel")}</div>
                <div className="text-lg font-semibold tabular-nums">
                  {Math.round(vatSettlement.claimableInputVat).toLocaleString()}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {tr(t, "accCompVatNetAndRows", {
                    net: Math.round(vatSettlement.claimableInputNet).toLocaleString(),
                    count: vatSettlement.claimableInputCount.toLocaleString(),
                  })}
                </div>
                {vatSettlement.inputVat !== vatSettlement.claimableInputVat ? (
                  <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                    {tr(t, "accCompVatInputTotalVsClaimableNote", {
                      total: Math.round(vatSettlement.inputVat).toLocaleString(),
                      pending: Math.round(vatInputClaimable.pendingVat).toLocaleString(),
                      excluded: Math.round(vatInputClaimable.unobtainableVat).toLocaleString(),
                    })}
                  </div>
                ) : null}
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
                {tr(t, "accCompVatCalcFormulaDetailClaimable", {
                  out: Math.round(vatSettlement.outputVat).toLocaleString(),
                  inp: Math.round(vatSettlement.claimableInputVat).toLocaleString(),
                  payable: Math.round(vatSettlement.payableVat).toLocaleString(),
                })}
              </div>
              <div className="text-muted-foreground">{t("accCompVatCalcDisclaimer")}</div>
            </div>
          </div>
        )}

        {pp30SubView === "wht" && (
          <div className="space-y-3 text-sm">
            {isPnd5354CompactList && pnd5354SubView === "pnd54" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  {t("accCompWhtGrossShort")}: {pnd54Summary.gross.toLocaleString()}
                </div>
                <div>
                  {t("accCompWhtWithheldShort")}: {pnd54Summary.withheld.toLocaleString()}
                </div>
                <div>
                  {t("accCompWhtRowsShort")}: {pnd54Summary.count.toLocaleString()}
                </div>
              </div>
            ) : null}
            {showWhtLedger ? (
              <>
                {isPnd5354CompactList && pnd5354SubView === "pnd53" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      {t("accCompWhtGrossShort")}: {pnd53Summary.gross.toLocaleString()}
                    </div>
                    <div>
                      {t("accCompWhtWithheldShort")}: {pnd53Summary.withheld.toLocaleString()}
                    </div>
                    <div>
                      {t("accCompWhtRowsShort")}: {pnd53Summary.count.toLocaleString()}
                    </div>
                    <div>
                      {t("accCompMissingTin")}:{" "}
                      {whtRowsPnd53Display.filter((r) => !String(r.payee_tax_id || "").trim()).length.toLocaleString()}
                    </div>
                  </div>
                ) : null}
                {!isPnd5354CompactList && pp30Mode !== "wht_only" ? (
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
                ) : !isPnd5354CompactList && whtPayeeTinGapCount > 0 ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive leading-relaxed">
                    {tr(t, "accCompWhtPayeeTinGapLine", { count: String(whtPayeeTinGapCount) })}
                  </div>
                ) : null}
                {!isPnd5354CompactList ? (
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
                ) : null}
              </>
            ) : null}
            {showPnd1Area ? (
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="text-sm font-bold">{pnd1PayerBoxTitle}</div>
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
                    placeholder={t("accCompPnd1PayerLegalNamePlaceholder")}
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
                  <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
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
              {showWhtLedger && !isPnd5354CompactList ? (
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
              {showWhtLedger && (!isPnd5354CompactList || pnd5354SubView === "pnd53") ? (
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
              {isPnd5354CompactList && pnd5354SubView === "pnd54" ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={pnd54ExportUrl} target="_blank" rel="noopener noreferrer">
                    {t("accCompPnd54ExportCsv")}
                  </a>
                </Button>
              ) : null}
              {showWhtLedger && !isPnd5354CompactList ? (
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
              {showPnd353Tools && (!isPnd5354CompactList || pnd5354SubView === "pnd53") ? (
                lockWhtSubmissionFormHint ? (
                  <div className="inline-flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium">
                    {whtSubmissionFormHint}
                  </div>
                ) : (
                <Select
                  value={whtSubmissionFormHint}
                  onValueChange={(v) => setWhtSubmissionFormHint(v as "PND3" | "PND53" | "ALL")}
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("accCompPnd353FormHintAll")}</SelectItem>
                    <SelectItem value="PND3">PND3</SelectItem>
                    <SelectItem value="PND53">PND53</SelectItem>
                  </SelectContent>
                </Select>
                )
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
              {showPnd353Tools && (!isPnd5354CompactList || pnd5354SubView === "pnd53") ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void runPnd353Validation()}
                  disabled={pnd353Validating}
                >
                  {pnd353Validating ? t("loading") : t("accCompPnd53ValidateBtn")}
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
                  {payrollTinGapLoading ? t("loading") : t("accCompPayrollTinCheckBtn")}
                </Button>
              ) : null}
            </div>
            {showPnd353Tools && pnd353ValidationResult ? (
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 text-xs space-y-1">
                <div className="font-medium">{t("accCompPnd353ValidationTitle")}</div>
                <div>
                  {t("accCompPnd353ValidationTotalRows")}: {pnd353ValidationResult.totalRows.toLocaleString()}
                </div>
                <div>
                  {t("accCompPnd353ValidationValidRows")}: {pnd353ValidationResult.validRows.toLocaleString()}
                </div>
                <div>
                  {t("accCompPnd353ValidationWarningCount")}: {(pnd353ValidationResult.issues || []).length.toLocaleString()}
                </div>
              </div>
            ) : null}
            {(showPp36Ledger || (showPnd54Ledger && (!isPnd5354CompactList || pnd5354SubView === "pnd54"))) ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {showPp36Ledger ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("accCompTabPp36")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setPp36Rows((prev) => [...prev, emptyPp36(taxMonth, storeTb !== "All" ? storeTb : "")])}>
                      <Plus className="h-3 w-3 mr-1" /> {t("accCompVatAdd")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadPp36()}>{t("search")}</Button>
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
                  <CardTitle className="text-sm">{t("accCompPnd5354SubPnd54")}</CardTitle>
                </CardHeader>
                <CardContent className={isPnd5354CompactList ? "p-0 overflow-x-auto" : "space-y-2"}>
                  <div className={cn("flex gap-2", isPnd5354CompactList ? "px-4 py-3 border-b border-border/60" : "")}>
                    {!isPnd5354CompactList ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setPnd54Rows((prev) => [...prev, emptyPnd54(taxMonth, storeTb !== "All" ? storeTb : "")])}>
                        <Plus className="h-3 w-3 mr-1" /> {t("accCompVatAdd")}
                      </Button>
                    ) : null}
                    {!isPnd5354CompactList ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => void loadPnd54()}>{t("search")}</Button>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" asChild>
                      <a href={pnd54ExportUrl} target="_blank" rel="noopener noreferrer">CSV</a>
                    </Button>
                  </div>
                  {isPnd5354CompactList ? (
                    <table className="w-full text-sm border-collapse min-w-[720px]">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompColYearMonth")}</th>
                          <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompStore")}</th>
                          <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompPhPayee")}</th>
                          <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompPhIncomeType")}</th>
                          <th className="text-right p-2 font-medium whitespace-nowrap">{t("accCompWhtGrossShort")}</th>
                          <th className="text-right p-2 font-medium whitespace-nowrap">{t("accCompWhtWithheldShort")}</th>
                          <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompColStatus")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnd54RowsFiltered.map((row, idx) => (
                          <tr key={row.id ?? `pnd54-${idx}`} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                            <td className="p-2 whitespace-nowrap tabular-nums">{row.tax_month || row.payment_date}</td>
                            <td className="p-2 whitespace-nowrap">{row.store_name || "-"}</td>
                            <td className="p-2 max-w-[180px] truncate" title={row.payee_name}>{row.payee_name || "-"}</td>
                            <td className="p-2 max-w-[140px] truncate" title={row.income_type}>{row.income_type || "-"}</td>
                            <td className="p-2 text-right tabular-nums whitespace-nowrap">{Number(row.gross_amount || 0).toLocaleString()}</td>
                            <td className="p-2 text-right tabular-nums whitespace-nowrap">{Number(row.wht_amount || 0).toLocaleString()}</td>
                            <td className="p-2 whitespace-nowrap">{filingStatusLabel(row.filing_status)}</td>
                          </tr>
                        ))}
                        {!pnd54RowsFiltered.length ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-muted-foreground">{t("emp_result_empty")}</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  ) : (
                    (pnd54Rows || []).slice(0, 20).map((row, idx) => (
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
                    ))
                  )}
                </CardContent>
              </Card>
              ) : null}
            </div>
            ) : null}
            {showPnd1Area ? (
            <div className="rounded-md border border-dashed border-border/70 bg-muted/15 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <div className="font-medium text-foreground/90">{pnd1RdPrepGuideTitle}</div>
              <p>{pnd1RdPrepGuideNote}</p>
              <RdPrepFilingHelper t={t} mappingGuideBody={t("accCompRdPrepMappingGuideBodyPnd1")} />
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
            {showPnd1Area ? (
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="text-sm font-medium">{t("accCompPnd91Title")}</div>
                    <p className="text-xs text-muted-foreground">{t("taxFilingNotePnd91Annual")}</p>
                    <p className="text-xs text-muted-foreground">{t("accCompPnd91ChecklistLocalNote")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pnd91Loading || pnd91Year == null}
                      onClick={() => void loadPnd91()}
                    >
                      {pnd91Loading ? t("loading") : t("accCompPnd91Load")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" asChild disabled={pnd91Year == null}>
                      <a href={pnd91ExportUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3 w-3 mr-1" />
                        {t("accCompPnd91ExportCsv")}
                      </a>
                    </Button>
                  </div>
                </div>
                {pnd91Year != null ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t("holiday_year")}: {pnd91Year}
                    </span>
                    <span>
                      {t("accCompPnd91FilingDue")}:{" "}
                      {pnd91Summary?.filingDueDate || `${pnd91Year + 1}-03-31`}
                    </span>
                    {pnd91Summary ? (
                      <span>
                        {t("accCompPnd91SummaryEmployees")}:{" "}
                        {pnd91Summary.totals.employeeCount.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {pnd91Summary && pnd91Summary.totals.whtMismatchCount > 0 ? (
                  <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200">
                    {t("accCompPnd91WhtMismatchWarn")} ({pnd91Summary.totals.whtMismatchCount.toLocaleString()})
                  </div>
                ) : null}
                {pnd91Summary && !pnd91Summary.employees.length ? (
                  <div className="text-xs text-muted-foreground py-2">{t("accCompPnd91Empty")}</div>
                ) : null}
                {pnd91Summary && pnd91Summary.employees.length > 0 ? (
                  <div className="overflow-x-auto rounded border border-border/60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-left p-2">{t("accCompPnd91ColEmployee")}</th>
                          <th className="text-left p-2">{t("accCompPnd91ColTaxId")}</th>
                          <th className="text-right p-2">{t("accCompPnd91ColMonths")}</th>
                          <th className="text-right p-2">{t("accCompPnd91ColGross")}</th>
                          <th className="text-right p-2">{t("accCompPnd91ColWhtPayroll")}</th>
                          <th className="text-right p-2">{t("accCompPnd91ColWhtLedger")}</th>
                          <th className="text-right p-2">{t("accCompPnd91ColSso")}</th>
                          <th className="text-right p-2">{t("accCompPnd91ColNet")}</th>
                          <th className="text-left p-2 min-w-[120px]">{t("accCompPnd91ColStatus")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnd91Summary.employees.map((emp) => {
                          const checklistStatus =
                            (pnd91Year != null
                              ? readPnd91ChecklistEntry(pnd91Year, storeFilterForApi, emp.employeeKey)?.status
                              : null) || "pending"
                          return (
                            <tr
                              key={emp.employeeKey}
                              className={cn(
                                "border-b border-border/40",
                                emp.whtLedgerMismatch && "bg-amber-500/5"
                              )}
                            >
                              <td className="p-2">
                                <div>{emp.name}</div>
                                <div className="text-muted-foreground">{emp.store}</div>
                              </td>
                              <td className="p-2">{emp.taxId || "-"}</td>
                              <td className="p-2 text-right">{emp.monthCount.toLocaleString()}</td>
                              <td className="p-2 text-right">{emp.annualGross.toLocaleString()}</td>
                              <td className="p-2 text-right">{emp.annualWhtPayroll.toLocaleString()}</td>
                              <td className="p-2 text-right">{emp.annualWhtLedger.toLocaleString()}</td>
                              <td className="p-2 text-right">{emp.annualSso.toLocaleString()}</td>
                              <td className="p-2 text-right">{emp.annualNetPay.toLocaleString()}</td>
                              <td className="p-2">
                                <Select
                                  value={checklistStatus}
                                  onValueChange={(v) => {
                                    if (pnd91Year == null) return
                                    writePnd91ChecklistEntry(
                                      pnd91Year,
                                      storeFilterForApi,
                                      emp.employeeKey,
                                      v as Pnd91ChecklistStatus
                                    )
                                    setPnd91ChecklistTick((n) => n + 1)
                                  }}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">{t("accCompPnd91StatusPending")}</SelectItem>
                                    <SelectItem value="notified">{t("accCompPnd91StatusNotified")}</SelectItem>
                                    <SelectItem value="filed">{t("accCompPnd91StatusFiled")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
            {showPnd1Area && payrollTinGapResult ? (
              <div className="rounded-md border border-border/70 bg-muted/10 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-bold">
                    {t("accCompPayrollTinGapTitleMonthly")}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPayrollTinGapResult(null)}
                  >
                    {t("accCompPayrollTinGapClearResult")}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    {t("accCompPayrollStatWhtRows")}:{" "}
                    {payrollTinGapResult.payrollRowCount.toLocaleString()}
                  </div>
                  <div>
                    {t("accCompPayrollStatTinMissingRows")}:{" "}
                    {payrollTinGapResult.gapRowCount.toLocaleString()}
                  </div>
                  <div>
                    {t("accCompPayrollStatImpactedEmployees")}:{" "}
                    {payrollTinGapResult.uniqueEmployeeCount.toLocaleString()}
                  </div>
                </div>
                <div className="overflow-x-auto rounded border border-border/60">
                  <table className="w-full text-sm">
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
                            {t("accCompPayrollNoTinGaps")}
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
                  <div className="text-sm font-bold">{pnd1ValidationTableTitle}</div>
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
                    {tr(t, "accCompPnd1ValidationStatLine", {
                      rows: pnd1ValidationResult.totalRows.toLocaleString(),
                      issues: pnd1ValidationResult.issues.length.toLocaleString(),
                      filtered: pnd1IssueRowsFiltered.length.toLocaleString(),
                    })}
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
                        <span>{t("all")}</span>
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
                  <table className="w-full text-sm">
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
                            {t("accCompPnd1ValidationNoIssues")}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {showWhtLedger && (!isPnd5354CompactList || pnd5354SubView === "pnd53") ? (
            <Card>
              {isPnd5354CompactList ? (
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("accCompPnd5354SubPnd53")}</CardTitle>
                </CardHeader>
              ) : null}
              <CardContent className={isPnd5354CompactList ? "p-0 overflow-x-auto" : "p-2 overflow-x-auto space-y-3"}>
                {isPnd5354CompactList ? (
                  <table className="w-full text-sm border-collapse min-w-[880px]">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompColYearMonth")}</th>
                        <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompStore")}</th>
                        <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompPhPayee")}</th>
                        <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompPhIncomeType")}</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">{t("accCompWhtGrossShort")}</th>
                        <th className="text-right p-2 font-medium whitespace-nowrap">{t("accCompWhtWithheldShort")}</th>
                        <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompPhFormHint")}</th>
                        <th className="text-left p-2 font-medium whitespace-nowrap">{t("accCompColStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whtRowsPnd53Display.map((row, idx) => (
                        <tr key={row.id ?? `wht-${idx}`} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="p-2 whitespace-nowrap tabular-nums">{row.tax_month || row.payment_date}</td>
                          <td className="p-2 whitespace-nowrap">{row.store_name || "-"}</td>
                          <td className="p-2 max-w-[180px] truncate" title={row.payee_name}>{row.payee_name || "-"}</td>
                          <td className="p-2 max-w-[140px] truncate" title={row.income_type}>{row.income_type || "-"}</td>
                          <td className="p-2 text-right tabular-nums whitespace-nowrap">{Number(row.gross_amount || 0).toLocaleString()}</td>
                          <td className="p-2 text-right tabular-nums whitespace-nowrap">{Number(row.wht_amount || 0).toLocaleString()}</td>
                          <td className="p-2 whitespace-nowrap">{row.form_hint || "-"}</td>
                          <td className="p-2 whitespace-nowrap">{filingStatusLabel(row.filing_status)}</td>
                        </tr>
                      ))}
                      {!whtRowsPnd53Display.length ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-muted-foreground">{t("emp_result_empty")}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                ) : (
                <>
                {whtRows.map((row, idx) => {
                  if (ledgerStatusFilter !== "all" && row.filing_status !== ledgerStatusFilter) return null
                  return (
                  <div
                    key={row.id ?? `wht-${idx}`}
                    ref={(el) => {
                      if (row.id) whtRowRefs.current[row.id] = el
                    }}
                    className={accountingLedgerEntryGridCn}
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
                  <div className="p-6 text-center text-muted-foreground text-sm">{t("emp_result_empty")}</div>
                ) : null}
                </>
                )}
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
  )
}
