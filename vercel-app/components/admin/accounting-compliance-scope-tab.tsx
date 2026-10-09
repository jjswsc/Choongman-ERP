"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarClock, Landmark } from "lucide-react"
import { THAI_FILING_SCHEDULE_SECTIONS, THAI_FILING_SCHEDULE_TABLE_ROWS } from "@/lib/thai-filing-schedule-guide"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { THAI_FILING_DEFINITIONS } from "@/lib/thai-filing-scope"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  KT20K_REASON_TAGS,
  type Kt20kReasonTag,
  type Kt20kSummaryResponse,
  type Kt20kMonthlyDiffRow,
  type Kt20kEmployeeDiffRow,
} from "./admin-accounting-compliance-types"
import type * as React from "react"
import type { LangCode } from "@/lib/lang-context"
import type { AccountMeta } from "@/lib/chart-of-accounts-mapping"

export type AccountingComplianceScopeTabProps = {
  chartList: AccountMeta[]
  kt20kData: Kt20kSummaryResponse | null
  kt20kDiffTolerance: string
  kt20kEmployeeDiffRows: Kt20kEmployeeDiffRow[]
  kt20kMonthlyDiffRows: Kt20kMonthlyDiffRow[]
  kt20kReasonTagCountMap: Record<Kt20kReasonTag, number>
  kt20kReasonTagFilter: Kt20kReasonTag[]
  kt20kReasonTagLabel: (tag: string) => string
  lang: LangCode
  setKt20kDiffTolerance: React.Dispatch<React.SetStateAction<string>>
  setKt20kReasonTagFilter: React.Dispatch<React.SetStateAction<Kt20kReasonTag[]>>
  t: (k: string) => string
  toggleKt20kReasonTag: (tag: Kt20kReasonTag) => void
}

export function AccountingComplianceScopeTab({
  chartList,
  kt20kData,
  kt20kDiffTolerance,
  kt20kEmployeeDiffRows,
  kt20kMonthlyDiffRows,
  kt20kReasonTagCountMap,
  kt20kReasonTagFilter,
  kt20kReasonTagLabel,
  lang,
  setKt20kDiffTolerance,
  setKt20kReasonTagFilter,
  t,
  toggleKt20kReasonTag,
}: AccountingComplianceScopeTabProps) {
  return (
    <>
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
        <CardContent>
          <AdminTableScroll lockViewport={false}>
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
          </AdminTableScroll>
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
    </>
  )
}
