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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Landmark, ExternalLink, Download } from "lucide-react"
import { tr } from "@/lib/i18n"
import { appConfirm } from "@/lib/app-message"
import type { AccountingWorkflowStatusRow } from "@/lib/api-client"
import type { SsoPayrollPreview, SsoSubmissionMeta } from "./admin-accounting-compliance-types"
import {
  formatBangkokDateTime,
  displayNameFromUrl,
  parseSsoWorkflowNote,
} from "./admin-accounting-compliance-utils"
import {
  mapPayrollRowToOfficialUploadRow,
  resolveSsoOfficialUploadColumnLabel,
  SSO_OFFICIAL_UPLOAD_COLUMN_HELP,
} from "@/lib/thai-sso-official-upload-export"
import { type SsoFilingWageMode } from "@/lib/payroll-utils"
import { AccountingEmptyState } from "@/components/admin/accounting-result-primitives"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AccountingComplianceSsoTabProps {
  t: (key: string) => string
  lang: string

  // Store filter / context
  taxMonth: string
  setTaxMonth: (v: string) => void
  isOffice: boolean
  externalFiling: boolean
  storeOptions: string[]
  storeOptionLabel: (code: string) => string
  canApproveCompliance: boolean

  // SSO sub-view
  ssoSubView: "filing" | "history"
  setSsoSubView: (v: "filing" | "history") => void

  // SSO store filter
  ssoStoreFilter: string
  setSsoStoreFilter: (v: string) => void
  ssoSelectedStore: string

  // SSO step 1 payroll query
  ssoQueried: boolean
  ssoPayrollLoading: boolean
  ssoPayrollRows: Record<string, unknown>[]
  ssoPayrollPreview: SsoPayrollPreview | null
  ssoPayrollLoadedAt: string
  ssoEmployeePreviewRows: Record<string, unknown>[]
  ssoStep2Ready: boolean

  // SSO filing wage mode
  ssoFilingWageMode: SsoFilingWageMode
  setSsoFilingWageMode: (v: SsoFilingWageMode) => void

  // SSO search button class
  ssoSearchBtnClass: string

  // SSO export
  ssoPayrollExporting: boolean

  // SSO step 3 accounting sync
  ssoStep3Ready: boolean
  ssoAccountingSyncing: boolean

  // SSO step 4 submission
  ssoSubmissionMemo: string
  setSsoSubmissionMemo: (v: string) => void
  ssoAttachmentInput: string
  setSsoAttachmentInput: (v: string) => void
  ssoAttachmentUrls: string[]
  ssoEvidenceUploading: boolean
  ssoSubmissionSaving: boolean
  ssoStep4Ready: boolean

  // SSO workflow row
  ssoWorkflowRow: AccountingWorkflowStatusRow | null
  ssoWorkflowMeta: SsoSubmissionMeta | null

  // SSO history
  ssoHistoryRows: AccountingWorkflowStatusRow[]
  ssoHistoryLoading: boolean

  // Handler functions
  runSsoSearch: () => Promise<void>
  exportOfficialUploadFromPayroll: () => Promise<void>
  exportSps110FromPayroll: () => Promise<void>
  runSsoAccountingSync: () => Promise<unknown>
  markSsoSubmissionDone: () => Promise<void>
  uploadSsoEvidenceFiles: (files: FileList | null) => Promise<void>
  loadSsoSubmissionHistory: () => Promise<void>
  openSsoHistoryRow: (row: AccountingWorkflowStatusRow) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountingComplianceSsoTab(props: AccountingComplianceSsoTabProps) {
  const {
    t,
    lang,
    taxMonth,
    setTaxMonth,
    isOffice,
    externalFiling,
    storeOptions,
    storeOptionLabel,
    canApproveCompliance,
    ssoSubView,
    setSsoSubView,
    ssoStoreFilter,
    setSsoStoreFilter,
    ssoSelectedStore,
    ssoQueried,
    ssoPayrollLoading,
    ssoPayrollRows,
    ssoPayrollPreview,
    ssoPayrollLoadedAt,
    ssoEmployeePreviewRows,
    ssoStep2Ready,
    ssoFilingWageMode,
    setSsoFilingWageMode,
    ssoSearchBtnClass,
    ssoPayrollExporting,
    ssoStep3Ready,
    ssoAccountingSyncing,
    ssoSubmissionMemo,
    setSsoSubmissionMemo,
    ssoAttachmentInput,
    setSsoAttachmentInput,
    ssoAttachmentUrls,
    ssoEvidenceUploading,
    ssoSubmissionSaving,
    ssoStep4Ready,
    ssoWorkflowRow,
    ssoWorkflowMeta,
    ssoHistoryRows,
    ssoHistoryLoading,
    runSsoSearch,
    exportOfficialUploadFromPayroll,
    exportSps110FromPayroll,
    runSsoAccountingSync,
    markSsoSubmissionDone,
    uploadSsoEvidenceFiles,
    loadSsoSubmissionHistory,
    openSsoHistoryRow,
  } = props

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4" />
          {t("accCompTabSso")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Tabs value={ssoSubView} onValueChange={(v) => setSsoSubView(v as "filing" | "history")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="filing">{t("accCompSsoSubTabFiling")}</TabsTrigger>
            <TabsTrigger value="history">{t("accCompSsoSubTabHistory")}</TabsTrigger>
          </TabsList>
          <TabsContent value="filing" className="space-y-4 mt-4">
            {!ssoQueried ? (
              <AccountingEmptyState>{t("accCompSsoEmptySearchHint")}</AccountingEmptyState>
            ) : null}
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
                onClick={() => void exportOfficialUploadFromPayroll()}
                disabled={ssoPayrollExporting || !ssoQueried || !ssoStep2Ready}
                title={t("accCompSsoOfficialUploadHint")}
              >
                <Download className="h-4 w-4 mr-2" />
                {ssoPayrollExporting ? t("loading") : t("accCompSsoOfficialUploadFromPayroll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void exportSps110FromPayroll()}
                disabled={ssoPayrollExporting || !ssoQueried || !ssoStep2Ready}
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
                  <div className="text-sm font-bold">{t("accCompSsoStep1Title")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("accCompMonth")}: {taxMonth} / {t("store")}: {ssoSelectedStore || t("accCompAll")} /{" "}
                    {t("accCompLoadTime")}:{" "}
                    {ssoPayrollLoadedAt ? formatBangkokDateTime(ssoPayrollLoadedAt) : "-"}
                  </div>
                  {ssoPayrollLoading ? (
                    <div className="text-xs text-muted-foreground">{t("loading")}</div>
                  ) : ssoPayrollPreview ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
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
                      <div className="text-sm font-bold">{t("accCompSsoEmployeeListTitle")}</div>
                      {ssoPayrollRows.length > ssoEmployeePreviewRows.length ? (
                        <p className="text-[11px] text-muted-foreground">
                          {tr(t, "accCompSsoEmployeeListTruncated", {
                            shown: String(ssoEmployeePreviewRows.length),
                            total: String(ssoPayrollRows.length),
                          })}
                        </p>
                      ) : null}
                      <div className="rounded border border-border/60 overflow-auto max-h-72">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b bg-muted/30">
                              <th className="text-left p-2 font-medium">{t("store")}</th>
                              {SSO_OFFICIAL_UPLOAD_COLUMN_HELP.map((c) => (
                                <th key={c.labelTh} className="text-left p-2 font-medium whitespace-nowrap">
                                  {resolveSsoOfficialUploadColumnLabel(c, lang)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ssoEmployeePreviewRows.map((row, idx) => {
                              const store = String(row.store || "").trim() || "-"
                              const cols = mapPayrollRowToOfficialUploadRow(row, ssoFilingWageMode)
                              const rowKey = `${store}-${String(cols[0])}-${idx}`
                              return (
                                <tr key={rowKey} className="border-b border-border/40">
                                  <td className="p-2 font-mono text-[11px]">{store}</td>
                                  {cols.map((cell, colIdx) => (
                                    <td
                                      key={`${rowKey}-${colIdx}`}
                                      className={cn(
                                        "p-2",
                                        colIdx >= 4 ? "text-right tabular-nums" : "",
                                        colIdx === 0 ? "font-mono text-[11px]" : ""
                                      )}
                                    >
                                      {typeof cell === "number" ? cell.toLocaleString() : cell || "-"}
                                    </td>
                                  ))}
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
                  <div className="text-sm font-bold">{t("accCompSsoStep2Title")}</div>
                  <div className="text-[11px] text-muted-foreground whitespace-pre-line">
                    {t("accCompSsoStep2Guide")}
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
                  <div className="text-sm font-bold">{t("accCompSsoStep3Title")}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("accCompSsoStep3Guide")}
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
                      placeholder={t("accCompEvidenceAttachmentUrlsPh")}
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
                      disabled={!ssoStep2Ready || ssoSubmissionSaving || !canApproveCompliance}
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
          </TabsContent>
          <TabsContent value="history" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
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
                variant="outline"
                size="sm"
                onClick={() => void loadSsoSubmissionHistory()}
                disabled={ssoHistoryLoading}
              >
                {ssoHistoryLoading ? t("loading") : t("search")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("accCompSsoHistoryGuide")}</p>
            {ssoHistoryLoading ? (
              <div className="text-xs text-muted-foreground">{t("loading")}</div>
            ) : ssoHistoryRows.length === 0 ? (
              <AccountingEmptyState>{t("accCompSsoHistoryEmpty")}</AccountingEmptyState>
            ) : (
              <div className="rounded border border-border/60 overflow-auto max-h-[480px]">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-2 font-medium">{t("accCompColYearMonth")}</th>
                      <th className="text-left p-2 font-medium">{t("store")}</th>
                      <th className="text-left p-2 font-medium">{t("accCompSubmittedAt")}</th>
                      <th className="text-left p-2 font-medium">{t("accCompSubmittedBy")}</th>
                      <th className="text-left p-2 font-medium">{t("accCompSsoHistorySummary")}</th>
                      <th className="text-left p-2 font-medium">{t("memo")}</th>
                      <th className="text-right p-2 font-medium">{t("accCompSsoHistoryAttachments")}</th>
                      <th className="text-right p-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {ssoHistoryRows.map((row) => {
                      const meta = parseSsoWorkflowNote(String(row.note || ""))
                      const storeLabel =
                        String(row.store_scope || "").trim() === "*" || !String(row.store_scope || "").trim()
                          ? t("accCompAll")
                          : String(row.store_scope || "")
                      const submittedAt = meta?.submittedAt || String(row.updated_at || "")
                      const submittedBy = meta?.submittedBy || String(row.updated_by || "")
                      const attachmentCount = meta?.attachmentUrls?.length || 0
                      return (
                        <tr key={String(row.id || `${row.year_month}-${row.store_scope}`)} className="border-b border-border/40">
                          <td className="p-2 tabular-nums whitespace-nowrap">{String(row.year_month || "").slice(0, 7)}</td>
                          <td className="p-2">{storeLabel}</td>
                          <td className="p-2 whitespace-nowrap">{formatBangkokDateTime(submittedAt)}</td>
                          <td className="p-2">{submittedBy || "-"}</td>
                          <td className="p-2 text-muted-foreground">{meta?.summaryLine || "-"}</td>
                          <td className="p-2 max-w-[200px] truncate" title={meta?.memo || ""}>
                            {meta?.memo || "-"}
                          </td>
                          <td className="p-2 text-right tabular-nums">{attachmentCount.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => void openSsoHistoryRow(row)}
                            >
                              {t("accCompSsoHistoryOpenMonth")}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {ssoHistoryRows.some((row) => {
              const meta = parseSsoWorkflowNote(String(row.note || ""))
              return (meta?.attachmentUrls?.length || 0) > 0
            }) ? (
              <div className="space-y-2 pt-1">
                <div className="text-sm font-bold">{t("accCompSsoHistoryAttachmentLinks")}</div>
                {ssoHistoryRows.map((row) => {
                  const meta = parseSsoWorkflowNote(String(row.note || ""))
                  if (!meta?.attachmentUrls?.length) return null
                  const ym = String(row.year_month || "").slice(0, 7)
                  return (
                    <div key={`att-${row.id}`} className="rounded border border-border/50 p-2 space-y-1">
                      <div className="text-[11px] text-muted-foreground">
                        {ym} · {String(row.store_scope || "*") === "*" ? t("accCompAll") : row.store_scope}
                      </div>
                      {meta.attachmentUrls.map((u) => (
                        <a
                          key={u}
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-[11px] text-primary underline truncate"
                          title={u}
                        >
                          {displayNameFromUrl(u)}
                        </a>
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
