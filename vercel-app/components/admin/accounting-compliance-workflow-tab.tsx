"use client"

import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { tr } from "@/lib/i18n"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { cn } from "@/lib/utils"
import { THAI_FILING_DEFINITIONS } from "@/lib/thai-filing-scope"
import type { AccountingWorkflowStatusRow } from "@/lib/api-client"
import type { LangCode } from "@/lib/lang-context"
import type { WorkflowReminderRow } from "./admin-accounting-compliance-types"

export type AccountingComplianceWorkflowTabProps = {
  canApproveCompliance: boolean
  canWriteCompliance: boolean
  externalFiling: boolean
  isOffice: boolean
  lang: LangCode
  loading: boolean
  loadWorkflow: () => Promise<void>
  loadWorkflowReminders: () => Promise<void>
  setStoreTb: (v: string) => void
  setTaxMonth: (v: string) => void
  storeOptionLabel: (code: string) => string
  storeOptions: string[]
  storeTb: string
  t: (k: string) => string
  taxMonth: string
  upsertWorkflowStatus: (filingType: string, status: "todo" | "in_progress" | "review" | "done") => Promise<void>
  workflowFallbackUsed: boolean
  workflowReminderRows: WorkflowReminderRow[]
  workflowReminderSummary: { critical: number; warn: number; info: number; } | null
  workflowRows: AccountingWorkflowStatusRow[]
  workflowStatusLabel: (s: string) => string
}

export function AccountingComplianceWorkflowTab({
  canApproveCompliance,
  canWriteCompliance,
  externalFiling,
  isOffice,
  lang,
  loading,
  loadWorkflow,
  loadWorkflowReminders,
  setStoreTb,
  setTaxMonth,
  storeOptionLabel,
  storeOptions,
  storeTb,
  t,
  taxMonth,
  upsertWorkflowStatus,
  workflowFallbackUsed,
  workflowReminderRows,
  workflowReminderSummary,
  workflowRows,
  workflowStatusLabel,
}: AccountingComplianceWorkflowTabProps) {
  return (
    <>
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
        <CardContent className="pt-6">
          <AdminTableScroll lockViewport={false}>
          <table className="w-full text-sm min-w-[640px]">
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
          </AdminTableScroll>
        </CardContent>
      </Card>
    </>
  )
}
