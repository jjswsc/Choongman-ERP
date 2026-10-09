"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import type { Kt20kSummaryResponse, Kt20kEmployerDraft } from "./admin-accounting-compliance-types"
import type * as React from "react"

export type AccountingComplianceKt20kTabProps = {
  externalFiling: boolean
  isOffice: boolean
  kt20kData: Kt20kSummaryResponse | null
  kt20kEmployer: Kt20kEmployerDraft
  kt20kExportUrl: string
  kt20kLoading: boolean
  kt20kSettingsLoading: boolean
  kt20kSettingsSaving: boolean
  kt20kYear: string
  loadKt20k: () => Promise<void>
  saveKt20kEmployerSettings: () => Promise<void>
  setKt20kEmployer: React.Dispatch<React.SetStateAction<Kt20kEmployerDraft>>
  setKt20kYear: React.Dispatch<React.SetStateAction<string>>
  setStoreTb: (v: string) => void
  storeOptionLabel: (code: string) => string
  storeOptions: string[]
  storeTb: string
  t: (k: string) => string
}

export function AccountingComplianceKt20kTab({
  externalFiling,
  isOffice,
  kt20kData,
  kt20kEmployer,
  kt20kExportUrl,
  kt20kLoading,
  kt20kSettingsLoading,
  kt20kSettingsSaving,
  kt20kYear,
  loadKt20k,
  saveKt20kEmployerSettings,
  setKt20kEmployer,
  setKt20kYear,
  setStoreTb,
  storeOptionLabel,
  storeOptions,
  storeTb,
  t,
}: AccountingComplianceKt20kTabProps) {
  return (
    <>
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
        <CardContent>
          <AdminTableScroll lockViewport={false}>
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
          </AdminTableScroll>
        </CardContent>
      </Card>
    </>
  )
}
