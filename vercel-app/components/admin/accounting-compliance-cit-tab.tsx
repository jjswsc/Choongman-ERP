"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { type CorporateTaxComputationData, getExportCorporateTaxPackageCsvUrl } from "@/lib/api-client"
import { Download, Plus } from "lucide-react"
import { StoreVendorTaxLinkBanner } from "@/components/admin/tax-filing/store-vendor-tax-link-banner"
import { tr } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type * as React from "react"
import type { AuthState } from "@/lib/auth-context"
import type { CorporateTaxPdfValidation } from "@/lib/corporate-tax-pdf"
import type { StoreVendorLinkEvaluation } from "@/lib/store-vendor-tax-link"
import type { CitAdjustmentDraft } from "./admin-accounting-compliance-types"

export type AccountingComplianceCitTabProps = {
  auth: AuthState | null
  citAdjustmentsDraft: CitAdjustmentDraft[]
  citData: CorporateTaxComputationData | null
  citFiscalYear: number
  citFiscalYearOptions: number[]
  citHalfYearSlot: "H1" | "H2"
  citKt20kTinMissing: boolean
  citPdfExporting: boolean
  citPdfHint: string | null
  citPdfValidation: CorporateTaxPdfValidation
  citQueried: boolean
  citYearMonthForApi: string
  exportCitPdf: () => Promise<void>
  isCitFilingShell: boolean
  isManager: boolean
  isOffice: boolean
  loadCit: () => Promise<void>
  loading: boolean
  managerStore: string
  onOpenStoreProfiles: (() => void) | undefined
  periodType: "monthly" | "half_year" | "annual"
  pp30StoreLinkEval: StoreVendorLinkEvaluation | null
  pp30VendorLinkCounts: { missing: number; inferred: number; total: number; }
  resolveCitPdfCodeLabel: (prefix: "accCompCitPdfErr_" | "accCompCitPdfWarn_", code: string) => string
  role: string
  saveCitAdjustmentsDraft: () => Promise<void>
  setCitAdjustmentsDraft: React.Dispatch<React.SetStateAction<CitAdjustmentDraft[]>>
  setCitFiscalYear: React.Dispatch<React.SetStateAction<number>>
  setCitHalfYearControls: (next: { year?: number; slot?: "H1" | "H2"; }) => void
  setPeriodType: React.Dispatch<React.SetStateAction<"monthly" | "half_year" | "annual">>
  setStoreTb: (v: string) => void
  setTaxMonth: (v: string) => void
  storeFilterForLedger: string
  storeOptionLabel: (code: string) => string
  storeOptions: string[]
  storeTb: string
  t: (k: string) => string
  taxLinkMetaLoading: boolean
  taxMonth: string
}

export function AccountingComplianceCitTab({
  auth,
  citAdjustmentsDraft,
  citData,
  citFiscalYear,
  citFiscalYearOptions,
  citHalfYearSlot,
  citKt20kTinMissing,
  citPdfExporting,
  citPdfHint,
  citPdfValidation,
  citQueried,
  citYearMonthForApi,
  exportCitPdf,
  isCitFilingShell,
  isManager,
  isOffice,
  loadCit,
  loading,
  managerStore,
  onOpenStoreProfiles,
  periodType,
  pp30StoreLinkEval,
  pp30VendorLinkCounts,
  resolveCitPdfCodeLabel,
  role,
  saveCitAdjustmentsDraft,
  setCitAdjustmentsDraft,
  setCitFiscalYear,
  setCitHalfYearControls,
  setPeriodType,
  setStoreTb,
  setTaxMonth,
  storeFilterForLedger,
  storeOptionLabel,
  storeOptions,
  storeTb,
  t,
  taxLinkMetaLoading,
  taxMonth,
}: AccountingComplianceCitTabProps) {
  return (
    <>
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
      {!citQueried ? <p className="text-sm text-muted-foreground">{t("taxBooksSearchFirst")}</p> : null}
      {citQueried ? <Card>
        <CardContent className="pt-6 text-sm space-y-2">
          <div>
            {t("accCompCitAccountingProfit")}: {(citData?.accountingProfit || 0).toLocaleString()}
          </div>
          {citData?.accountingProfitSource === "tax_book" ? (
            <div className="text-muted-foreground">{t("accCompCitTaxBookProfit")}</div>
          ) : null}
          {citData?.validation?.warnings?.includes("TAX_BOOK_PARTIAL_LOCK") ? (
            <div className="text-muted-foreground">{t("accCompCitTaxBookPartial")}</div>
          ) : null}
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
      </Card> : null}
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
    </>
  )
}
