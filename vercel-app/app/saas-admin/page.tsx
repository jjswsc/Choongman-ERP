"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Circle } from "lucide-react"
import { apiFetch } from "@/lib/api/fetch"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type TenantItem } from "@/lib/saas-admin-control-plane"
import { aggregateSaasRevenueStats } from "@/lib/saas-module-billing"
import { completedStepCount, firstIncompleteStep, isOnboardingComplete, ONBOARDING_STEP_ORDER, resolveOnboardingSteps, type OnboardingStatusRow, type OnboardingStepKey } from "@/lib/saas-onboarding-status"
import { isSaasPlatformInternalTenant } from "@/lib/saas-platform-internal-tenant"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { useSaasScope } from "@/components/saas/saas-scope-context"
import { SaasPartnerDashboard } from "@/components/saas/saas-partner-dashboard"
import { SaasStatCard } from "@/components/saas/saas-stat-card"

function normalizeTenantRows(rows: TenantItem[]): TenantItem[] {
  return rows.map((row) => ({
    ...row,
    policy: { ...row.policy, salesStage: row.policy?.salesStage || "basic" },
    billingHistory: Array.isArray(row.billingHistory) ? row.billingHistory : [],
    auditTrail: Array.isArray(row.auditTrail) ? row.auditTrail : [],
  }))
}

function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <Check className="h-4 w-4 text-emerald-600" aria-hidden />
  ) : (
    <Circle className="h-4 w-4 text-muted-foreground/40" aria-hidden />
  )
}

export default function SaasAdminPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const scope = useSaasScope()
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, OnboardingStatusRow>>({})
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadNotice, setLoadNotice] = useState("")

  const loadTenants = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/getSaasTenantSettings")
      const json = (await res.json()) as { success?: boolean; fallback?: boolean; message?: string; tenants?: TenantItem[] }
      if (!res.ok || json.success !== true || !Array.isArray(json.tenants)) {
        throw new Error(json.message || t("saasAdminCust_errLoadSettings"))
      }
      setTenants(normalizeTenantRows(json.tenants))
      setLoadNotice(json.fallback ? json.message || t("saasAdminCust_sampleData") : "")

      const statusRes = await apiFetch("/api/saasAdminOnboardingStatus")
      const statusJson = (await statusRes.json()) as { success?: boolean; map?: Record<string, OnboardingStatusRow> }
      if (statusRes.ok && statusJson.success === true && statusJson.map) {
        setStatusMap(statusJson.map)
      }
    } catch (error) {
      setLoadNotice(tr(t, "saasAdminCust_loadFailed", { msg: String(error) }))
      setTenants([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  const billableTenants = useMemo(
    () => tenants.filter((tenant) => !isSaasPlatformInternalTenant(tenant)),
    [tenants]
  )

  const stats = useMemo(() => {
    let complete = 0
    let incomplete = 0
    for (const tenant of billableTenants) {
      const steps = statusMap[tenant.id]?.steps ?? resolveOnboardingSteps({ tenant })
      if (isOnboardingComplete(steps)) complete += 1
      else incomplete += 1
    }
    return { complete, incomplete, total: billableTenants.length }
  }, [billableTenants, statusMap])

  const revenue = useMemo(() => aggregateSaasRevenueStats(billableTenants), [billableTenants])

  const checklistRows = useMemo(() => {
    const rows = billableTenants.map((tenant) => {
      const steps = statusMap[tenant.id]?.steps ?? resolveOnboardingSteps({ tenant })
      return { tenant, steps }
    })
    if (!showIncompleteOnly) return rows
    return rows.filter((x) => !isOnboardingComplete(x.steps))
  }, [billableTenants, showIncompleteOnly, statusMap])

  const incompleteRows = useMemo(
    () =>
      billableTenants.filter(
        (tenant) => !isOnboardingComplete(statusMap[tenant.id]?.steps ?? resolveOnboardingSteps({ tenant }))
      ),
    [billableTenants, statusMap]
  )

  const missingStepLabel = (steps: Record<OnboardingStepKey, boolean>): string => {
    const miss = firstIncompleteStep(steps)
    if (!miss) return ""
    const map: Record<OnboardingStepKey, string> = {
      company: t("saasAdminOnboard_stepCompany"),
      store: t("saasAdminOnboard_stepStore"),
      admin: t("saasAdminOnboard_stepAdmin"),
      pricing: t("saasAdminOnboard_stepPricing"),
      integrations: t("saasAdminOnboard_stepIntegrations"),
      verify: t("saasAdminOnboard_stepVerify"),
    }
    return map[miss]
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("saasAdminPageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("saasAdminPageIntro")}</p>
        {loadNotice ? <p className="mt-2 text-xs text-amber-600">{loadNotice}</p> : null}
      </div>

      {scope.isPartner ? <SaasPartnerDashboard tenants={tenants} loading={loading} /> : null}

      {!scope.isPartner ? (
      <>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdminDash_onboardCtaTitle")}</CardTitle>
          <CardDescription>{t("saasAdminDash_onboardCtaDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/saas-admin/onboarding">{t("saasAdminNavOnboarding")}</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminDash_statTotal")}</p>
            <p className="text-2xl font-semibold">{loading ? "…" : stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminDash_statComplete")}</p>
            <p className="text-2xl font-semibold text-emerald-600">{loading ? "…" : stats.complete}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("saasAdminDash_statIncomplete")}</p>
            <p className="text-2xl font-semibold text-amber-600">{loading ? "…" : stats.incomplete}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <SaasStatCard
          tone="accent"
          label={t("saasAdminDash_mrrTotal")}
          value={loading ? "…" : `${revenue.totalMrr.toLocaleString()} THB`}
          sub={tr(t, "saasAdminDash_mrrActiveTenants", { n: String(revenue.activeTenants) })}
        />
        <SaasStatCard
          tone="wholesale"
          label={t("saasAdminDash_mrrWholesale")}
          value={loading ? "…" : `${revenue.wholesaleMrr.toLocaleString()} THB`}
        />
        <SaasStatCard
          tone="margin"
          label={t("saasAdminDash_mrrPartnerMargin")}
          value={loading ? "…" : `${revenue.partnerMarginMrr.toLocaleString()} THB`}
        />
        <SaasStatCard
          tone="retail"
          label={t("saasAdminDash_mrrRetail")}
          value={loading ? "…" : `${revenue.retailMrr.toLocaleString()} THB`}
        />
        <SaasStatCard
          tone="default"
          label={t("saasAdminDash_mrrModule")}
          value={loading ? "…" : `${revenue.moduleMrr.toLocaleString()} THB`}
        />
        <SaasStatCard
          tone="warning"
          label={t("saasAdminDash_mrrStage")}
          value={loading ? "…" : `${revenue.stageMrr.toLocaleString()} THB`}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{t("saasAdminDash_topCustomer")}</p>
          <p className="text-lg font-semibold truncate">
            {loading ? "…" : revenue.topModuleTenants[0]?.companyName || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {revenue.topModuleTenants[0]
              ? `${revenue.topModuleTenants[0].amount.toLocaleString()} THB`
              : ""}
          </p>
        </CardContent>
      </Card>

      {revenue.moduleAdoption.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("saasAdminDash_moduleAdoptionTitle")}</CardTitle>
            <CardDescription>{t("saasAdminDash_moduleAdoptionDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("saasAdminCust_moduleName")}</TableHead>
                  <TableHead className="text-right">{t("saasAdminDash_moduleTenantCount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.moduleAdoption.map((row) => (
                  <TableRow key={row.moduleKey}>
                    <TableCell>{t(row.labelKey)}</TableCell>
                    <TableCell className="text-right">{row.tenantCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {revenue.topModuleTenants.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("saasAdminDash_topCustomersTitle")}</CardTitle>
            <CardDescription>{t("saasAdminDash_topCustomersDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("saasAdminCust_colTenant")}</TableHead>
                  <TableHead>{t("saasAdminCust_pricingMode")}</TableHead>
                  <TableHead className="text-right">{t("saasAdminDash_estimatedCharge")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.topModuleTenants.map((row) => (
                  <TableRow key={row.tenantId}>
                    <TableCell>
                      <div className="font-medium">{row.companyName}</div>
                      <p className="text-xs text-muted-foreground">{row.tenantId}</p>
                    </TableCell>
                    <TableCell>
                      {row.pricingMode === "module"
                        ? t("saasAdminCust_pricingModeModule")
                        : t("saasAdminCust_pricingModeStage")}
                    </TableCell>
                    <TableCell className="text-right">{row.amount.toLocaleString()} THB</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      </>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{t("saasAdminDash_checklistTitle")}</CardTitle>
              <CardDescription>{t("saasAdminDash_checklistDescFull")}</CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={showIncompleteOnly} onCheckedChange={(v) => setShowIncompleteOnly(Boolean(v))} />
              {t("saasAdminDash_incompleteOnly")}
            </label>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("saasAdminCust_colTenant")}</TableHead>
                <TableHead className="text-center">{t("saasAdminOnboard_stepCompany")}</TableHead>
                <TableHead className="text-center">{t("saasAdminOnboard_stepStore")}</TableHead>
                <TableHead className="text-center">{t("saasAdminOnboard_stepAdmin")}</TableHead>
                <TableHead className="text-center">{t("saasAdminOnboard_stepPricing")}</TableHead>
                <TableHead className="text-center">{t("saasAdminOnboard_stepIntegrations")}</TableHead>
                <TableHead className="text-center">{t("saasAdminOnboard_stepVerify")}</TableHead>
                <TableHead>{t("saasAdminDash_colProgress")}</TableHead>
                <TableHead className="text-right">{t("saasAdmin_manage")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checklistRows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {showIncompleteOnly ? t("saasAdminDash_noIncomplete") : t("saasAdminCust_noTenants")}
                  </TableCell>
                </TableRow>
              ) : (
                checklistRows.map(({ tenant, steps }) => {
                  const done = isOnboardingComplete(steps)
                  const count = completedStepCount(steps)
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div className="font-medium">{tenant.companyName}</div>
                        <p className="text-xs text-muted-foreground">{tenant.id}</p>
                        {!done ? (
                          <p className="text-xs text-amber-600 mt-1">{missingStepLabel(steps)}</p>
                        ) : null}
                      </TableCell>
                      {ONBOARDING_STEP_ORDER.map((key) => (
                        <TableCell key={key} className="text-center">
                          <StepIcon done={steps[key]} />
                        </TableCell>
                      ))}
                      <TableCell>
                        {done ? (
                          <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                            {t("saasAdminDash_statusComplete")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            {tr(t, "saasAdminDash_statusStepsFull", { n: String(count), total: String(ONBOARDING_STEP_ORDER.length) })}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {done ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/saas-admin/customers?tenant=${tenant.id}`}>{t("saasAdminDash_viewCustomer")}</Link>
                          </Button>
                        ) : (
                          <Button asChild size="sm">
                            <Link href={`/saas-admin/onboarding?tenant=${tenant.id}`}>{t("saasAdminDash_continue")}</Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {incompleteRows.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {tr(t, "saasAdminDash_incompleteHint", { n: String(incompleteRows.length) })}
        </p>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold">{t("saasAdminDash_opsTitle")}</h2>
        <ul className="mt-2 list-inside list-disc text-sm text-primary">
          <li>
            <Link href="/saas-admin/partners" className="underline underline-offset-4">
              {t("saasAdminNavPartners")}
            </Link>{" "}
            — {t("saasAdminPartners_pageIntro")}
          </li>
          <li>
            <Link href="/saas-admin/pricing" className="underline underline-offset-4">
              {t("saasAdminNavPricing")}
            </Link>{" "}
            — {t("saasAdminDash_pricingLinkHint")}
          </li>
          <li>
            <Link href="/saas-admin/customers" className="underline underline-offset-4">
              {t("saasAdminNavCustomers")}
            </Link>{" "}
            — {t("saasAdminPageBulletCustomers")}
          </li>
          <li>
            <Link href="/saas-admin/stores" className="underline underline-offset-4">
              {t("saasAdminNavStores")}
            </Link>{" "}
            — {t("saasAdminPageBulletStores")}
          </li>
          <li>
            <Link href="/saas-admin/users" className="underline underline-offset-4">
              {t("saasAdminNavUsers")}
            </Link>{" "}
            — {t("saasAdminPageBulletUsers")}
          </li>
        </ul>
      </div>
    </main>
  )
}
