"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ExternalLink } from "lucide-react"
import { tr } from "@/lib/i18n"
import { appConfirm } from "@/lib/app-message"
import type {
  AccountingComplianceAuditLog,
  IncomeExpenseClosingPreview,
  IncomeExpenseClosingHistoryItem,
  AccountingWorkflowStatusRow,
} from "@/lib/api-client"
import type { EtaxStepKey, EtaxTimestampMeta } from "./admin-accounting-compliance-types"
import {
  formatBangkokDateTime,
  parseAttachmentUrlsFromInput,
  displayNameFromUrl,
} from "./admin-accounting-compliance-utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeriodItem = {
  yearMonth: string
  isClosed: boolean
  closedAt: string | null
  closedBy: string | null
  unlockedAt?: string | null
  unlockedBy?: string | null
  unlockReason?: string | null
  unlockApprovedBy?: string | null
}

export type AccountingHealthData = {
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
}

export type ClosingDraftData = {
  id?: number
  status?: string | null
  memo?: string | null
  created_at?: string | null
  created_by?: string | null
  payload?: IncomeExpenseClosingPreview | null
}

export type ClosingPostedData = {
  id?: number
  entry_no?: string | null
  posted_at?: string | null
  posted_by?: string | null
}

export type ClosingDraftDiffData = {
  revenueDiff: number
  expenseDiff: number
  netIncomeDiff: number
  lineCountDiff: number
  changedCount: number
  changedSample: { key: string; current: number; draft: number; diff: number }[]
}

export type AuditKpiData = {
  total: number
  allowCount: number
  denyCount: number
  errorCount: number
  denyRate: number
  errorRate: number
  topReasons: [string, number][]
}

export type AuditPrevMonthData = {
  yearMonth: string
  total: number
  denyRate: number
}

export type AuditTrendRow = {
  yearMonth: string
  total: number
  denyRate: number
  errorRate: number
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AccountingCompliancePeriodTabProps {
  t: (key: string) => string

  // Period lock/unlock
  storeTb: string
  periods: PeriodItem[]
  periodUnlockReason: string
  setPeriodUnlockReason: (v: string) => void
  periodUnlockApprovedBy: string
  setPeriodUnlockApprovedBy: (v: string) => void
  canApproveUnlock: boolean
  canApproveCompliance: boolean
  togglePeriod: (yearMonth: string, closed: boolean) => Promise<void>

  // Accounting health check
  accountingHealthLoading: boolean
  accountingHealth: AccountingHealthData | null
  loadAccountingHealth: () => Promise<void>

  // Closing flow
  closingYearMonth: string
  setClosingYearMonth: (v: string) => void
  isOffice: boolean
  storeTb_forSelect: string
  setStoreTb: ((v: string) => void) | undefined
  storeOptions: string[]
  storeOptionLabel: (code: string) => string
  closingProfitLossAccountCode: string
  setClosingProfitLossAccountCode: (v: string) => void
  closingLoading: boolean
  loadIncomeExpenseClosingPreview: () => Promise<void>
  closingAuditCsvUrl: string
  closingMemo: string
  setClosingMemo: (v: string) => void
  closingAutoLock: boolean
  setClosingAutoLock: (v: boolean) => void
  closingPreview: IncomeExpenseClosingPreview | null
  closingDraftSaving: boolean
  closingPosting: boolean
  saveIncomeExpenseClosingDraftNow: () => Promise<void>
  runIncomeExpenseClosing: (forceReset: boolean) => Promise<void>
  closingDraft: ClosingDraftData | null
  closingDraftDiff: ClosingDraftDiffData | null
  closingPosted: ClosingPostedData | null
  closingHistory: IncomeExpenseClosingHistoryItem[]
  closingHistoryExpandedId: number | null
  setClosingHistoryExpandedId: (v: number | null) => void

  // Compliance audit log
  auditYearMonth: string
  setAuditYearMonth: (v: string) => void
  auditDecision: "all" | "allow" | "deny" | "error"
  setAuditDecision: (v: "all" | "allow" | "deny" | "error") => void
  auditActionKeyword: string
  setAuditActionKeyword: (v: string) => void
  auditLoading: boolean
  loadComplianceAuditLogs: () => Promise<void>
  complianceAuditCsvUrl: string
  auditFallbackUsed: boolean
  auditKpi: AuditKpiData
  auditPrevMonthStats: AuditPrevMonthData | null
  auditDenyRateDelta: number | null
  auditTrendStats: AuditTrendRow[]
  auditRows: AccountingComplianceAuditLog[]
  auditExpandedRowKey: string | null
  setAuditExpandedRowKey: (v: string | null) => void

  // E-Tax timestamp flow
  etaxTaxId: string
  setEtaxTaxId: (v: string) => void
  etaxBranchCode: string
  setEtaxBranchCode: (v: string) => void
  etaxRdContactEmail: string
  setEtaxRdContactEmail: (v: string) => void
  etaxSenderGmail: string
  setEtaxSenderGmail: (v: string) => void
  etaxActivateCodeRef: string
  setEtaxActivateCodeRef: (v: string) => void
  etaxAttachmentInput: string
  setEtaxAttachmentInput: React.Dispatch<React.SetStateAction<string>>
  etaxEvidenceUploading: boolean
  uploadEtaxEvidenceFiles: (files: FileList | null) => Promise<void>
  etaxReminderMessages: string[]
  etaxAttachmentUrls: string[]
  etaxStepCountDone: number
  etaxApplySubmitted: boolean
  etaxKo01Printed: boolean
  etaxDocsUploaded: boolean
  etaxEmailConfirmed: boolean
  etaxActivateCodeReceived: boolean
  etaxPasswordSet: boolean
  etaxSenderEmailRegistered: boolean
  etaxPilotIssued: boolean
  etaxStepAudit: Partial<Record<EtaxStepKey, { doneAt: string; doneBy: string }>>
  toggleEtaxStep: (key: EtaxStepKey, checked: boolean) => void
  etaxStepStamp: (key: EtaxStepKey) => string
  etaxMemo: string
  setEtaxMemo: (v: string) => void
  etaxSaving: boolean
  canWriteCompliance: boolean
  saveEtaxTimestampProgress: () => Promise<void>
  etaxWorkflowRow: AccountingWorkflowStatusRow | null
  etaxWorkflowMeta: EtaxTimestampMeta | null
  workflowStatusLabel: (s: string) => string
  etaxAuditCsvUrl: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountingCompliancePeriodTab(props: AccountingCompliancePeriodTabProps) {
  const {
    t,
    storeTb,
    periods,
    periodUnlockReason,
    setPeriodUnlockReason,
    periodUnlockApprovedBy,
    setPeriodUnlockApprovedBy,
    canApproveUnlock,
    canApproveCompliance,
    togglePeriod,
    accountingHealthLoading,
    accountingHealth,
    loadAccountingHealth,
    closingYearMonth,
    setClosingYearMonth,
    isOffice,
    setStoreTb,
    storeOptions,
    storeOptionLabel,
    closingProfitLossAccountCode,
    setClosingProfitLossAccountCode,
    closingLoading,
    loadIncomeExpenseClosingPreview,
    closingAuditCsvUrl,
    closingMemo,
    setClosingMemo,
    closingAutoLock,
    setClosingAutoLock,
    closingPreview,
    closingDraftSaving,
    closingPosting,
    saveIncomeExpenseClosingDraftNow,
    runIncomeExpenseClosing,
    closingDraft,
    closingDraftDiff,
    closingPosted,
    closingHistory,
    closingHistoryExpandedId,
    setClosingHistoryExpandedId,
    auditYearMonth,
    setAuditYearMonth,
    auditDecision,
    setAuditDecision,
    auditActionKeyword,
    setAuditActionKeyword,
    auditLoading,
    loadComplianceAuditLogs,
    complianceAuditCsvUrl,
    auditFallbackUsed,
    auditKpi,
    auditPrevMonthStats,
    auditDenyRateDelta,
    auditTrendStats,
    auditRows,
    auditExpandedRowKey,
    setAuditExpandedRowKey,
    etaxTaxId,
    setEtaxTaxId,
    etaxBranchCode,
    setEtaxBranchCode,
    etaxRdContactEmail,
    setEtaxRdContactEmail,
    etaxSenderGmail,
    setEtaxSenderGmail,
    etaxActivateCodeRef,
    setEtaxActivateCodeRef,
    etaxAttachmentInput,
    setEtaxAttachmentInput,
    etaxEvidenceUploading,
    uploadEtaxEvidenceFiles,
    etaxReminderMessages,
    etaxAttachmentUrls,
    etaxStepCountDone,
    etaxApplySubmitted,
    etaxKo01Printed,
    etaxDocsUploaded,
    etaxEmailConfirmed,
    etaxActivateCodeReceived,
    etaxPasswordSet,
    etaxSenderEmailRegistered,
    etaxPilotIssued,
    etaxStepAudit,
    toggleEtaxStep,
    etaxStepStamp,
    etaxMemo,
    setEtaxMemo,
    etaxSaving,
    canWriteCompliance,
    saveEtaxTimestampProgress,
    etaxWorkflowRow,
    etaxWorkflowMeta,
    workflowStatusLabel,
    etaxAuditCsvUrl,
  } = props

  return (
    <>
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
    </>
  )
}
