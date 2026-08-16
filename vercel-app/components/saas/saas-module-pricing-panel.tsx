"use client"

import Link from "next/link"
import { useState } from "react"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { tr, useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { resolveCurrentChargeAmount, type TenantItem } from "@/lib/saas-admin-control-plane"
import { useSaasScope } from "@/components/saas/saas-scope-context"
import { SaasPricingBreakdownVisual, SaasPricingColumnHead } from "@/components/saas/saas-pricing-breakdown-visual"
import { SAAS_PRICING_TONE } from "@/components/saas/saas-pricing-visual"
import {
  applyCatalogWholesaleToModules,
  applyPosOnlyModuleEnabled,
  cloneDefaultModulePrices,
  normalizeModulePrices,
  syncFeaturesFromModules,
  syncMarginFromRetail,
  syncModuleEnabledFromFeatures,
  syncRetailFromMargin,
  SAAS_MODULE_KEYS,
  SAAS_MODULE_LABEL_KEY,
  type SaasModuleKey,
  type SaasModulePriceRow,
} from "@/lib/saas-module-pricing"
import { applyCatalogWithRepricePolicy, type CatalogRepricePolicy } from "@/lib/saas-partner-pricing-policy"
import {
  moduleBillingLimitsFromTenant,
  resolveEffectiveChargeWithLimits,
  resolveModuleChargeWithLimits,
} from "@/lib/saas-module-billing"

type Props = {
  tenant: TenantItem
  onChange: (updater: (tenant: TenantItem) => TenantItem) => void
  /** 모듈 ON/OFF 변경 시 ERP 기능 토글에 반영 */
  syncFeaturesOnModuleChange?: boolean
}

function ensureModulePrices(tenant: TenantItem): Record<SaasModuleKey, SaasModulePriceRow> {
  const raw = tenant.pricing?.modulePrices
  if (raw && Object.keys(raw).length > 0) {
    return normalizeModulePrices(raw)
  }
  return cloneDefaultModulePrices()
}

function withRecalcPricing(tenant: TenantItem, modules: Record<SaasModuleKey, SaasModulePriceRow>): TenantItem {
  const pricingMode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
  const stageAmount = resolveCurrentChargeAmount(tenant.policy.salesStage, tenant.billingCycle, tenant.pricing.stagePrices)
  const limits = moduleBillingLimitsFromTenant(tenant)
  return {
    ...tenant,
    pricing: {
      ...tenant.pricing,
      modulePrices: modules,
      currentChargeAmount: resolveEffectiveChargeWithLimits({
        pricingMode,
        billingCycle: tenant.billingCycle,
        stageAmount,
        modulePrices: modules,
        usage: tenant.usage,
        limits,
      }),
    },
  }
}

export function SaasModulePricingPanel({ tenant, onChange, syncFeaturesOnModuleChange = true }: Props) {
  const t = useT(useLang().lang)
  const scope = useSaasScope()
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const pricingMode = tenant.policy.pricingMode ?? tenant.pricing.pricingMode ?? "stage"
  const modulePrices = ensureModulePrices(tenant)
  const cycle = tenant.billingCycle
  const limits = moduleBillingLimitsFromTenant(tenant)
  const breakdown = resolveModuleChargeWithLimits(modulePrices, cycle, tenant.usage, limits)
  const stageAmount = resolveCurrentChargeAmount(tenant.policy.salesStage, cycle, tenant.pricing.stagePrices)
  const total = resolveEffectiveChargeWithLimits({
    pricingMode,
    billingCycle: cycle,
    stageAmount,
    modulePrices,
    usage: tenant.usage,
    limits,
  })

  const setPricingMode = (mode: "stage" | "module") => {
    onChange((prev) => {
      let modules = ensureModulePrices(prev)
      if (mode === "module") {
        modules = syncModuleEnabledFromFeatures(modules, prev.features)
      }
      const stage = resolveCurrentChargeAmount(prev.policy.salesStage, prev.billingCycle, prev.pricing.stagePrices)
      const limits = moduleBillingLimitsFromTenant(prev)
      return {
        ...prev,
        policy: { ...prev.policy, pricingMode: mode },
        pricing: {
          ...prev.pricing,
          pricingMode: mode,
          modulePrices: modules,
          currentChargeAmount: resolveEffectiveChargeWithLimits({
            pricingMode: mode,
            billingCycle: prev.billingCycle,
            stageAmount: stage,
            modulePrices: modules,
            usage: prev.usage,
            limits,
          }),
        },
      }
    })
  }

  const applyModules = (modules: Record<SaasModuleKey, SaasModulePriceRow>, features?: TenantItem["features"]) => {
    onChange((prev) => {
      let next = withRecalcPricing(prev, modules)
      if (features) next = { ...next, features }
      return next
    })
  }

  const updateModule = (key: SaasModuleKey, patch: Partial<SaasModulePriceRow>) => {
    onChange((prev) => {
      const modules = ensureModulePrices(prev)
      modules[key] = syncMarginFromRetail({ ...modules[key], ...patch })
      let next = withRecalcPricing(prev, modules)
      if (syncFeaturesOnModuleChange && pricingMode === "module" && patch.isEnabled != null) {
        next = { ...next, features: syncFeaturesFromModules(prev.features, modules) }
      }
      return next
    })
  }

  const loadGlobalCatalog = async () => {
    setLoadingCatalog(true)
    try {
      const res = await apiFetch("/api/saasAdminModulePricingCatalog")
      const json = (await res.json()) as {
        success?: boolean
        modulePrices?: Record<SaasModuleKey, SaasModulePriceRow>
        message?: string
      }
      if (!res.ok || json.success !== true || !json.modulePrices) {
        await appAlert(json.message || t("saasAdminPricing_errLoad"))
        return
      }
      const catalog = normalizeModulePrices(json.modulePrices)
      let modules: Record<SaasModuleKey, SaasModulePriceRow>
      if (scope.isPlatform) {
        modules = applyCatalogWholesaleToModules(modulePrices, catalog, {
          marginPct: 0,
          preserveRetailAboveWholesale: true,
        })
      } else if (scope.isPartner && scope.partnerId) {
        let policy: CatalogRepricePolicy = "retain_margin_pct"
        const moduleMarginPct: Partial<Record<SaasModuleKey, number>> = {}
        try {
          const partnerRes = await apiFetch(`/api/saasAdminPartners?partnerId=${encodeURIComponent(scope.partnerId)}`)
          const partnerJson = (await partnerRes.json()) as {
            success?: boolean
            partner?: { defaultMarginPct?: number; catalogRepricePolicy?: CatalogRepricePolicy }
            marginRules?: Array<{ moduleKey: SaasModuleKey; marginPct: number }>
          }
          if (partnerRes.ok && partnerJson.success === true && partnerJson.partner) {
            policy = partnerJson.partner.catalogRepricePolicy || "retain_margin_pct"
            for (const rule of partnerJson.marginRules || []) {
              moduleMarginPct[rule.moduleKey] = rule.marginPct
            }
          }
        } catch {
          /* fallback to default policy */
        }
        modules = applyCatalogWithRepricePolicy(modulePrices, catalog, policy, {
          defaultMarginPct: scope.defaultMarginPct,
          moduleMarginPct,
        })
      } else {
        modules = applyCatalogWholesaleToModules(modulePrices, catalog, {
          marginPct: scope.isPartner ? scope.defaultMarginPct : 0,
          preserveRetailAboveWholesale: scope.isPlatform,
        })
      }
      applyModules(modules)
      await appAlert(t("saasAdminCust_moduleCatalogLoaded"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setLoadingCatalog(false)
    }
  }

  const priceCol = cycle === "yearly" ? "yearly" : "monthly"
  const wholesaleCol = cycle === "yearly" ? "wholesaleYearly" : "wholesaleMonthly"
  const marginCol = cycle === "yearly" ? "marginYearly" : "marginMonthly"

  const wholesaleBreakdown = resolveModuleChargeWithLimits(
    Object.fromEntries(
      SAAS_MODULE_KEYS.map((key) => [
        key,
        {
          ...modulePrices[key],
          monthly: modulePrices[key].wholesaleMonthly ?? modulePrices[key].monthly,
          yearly: modulePrices[key].wholesaleYearly ?? modulePrices[key].yearly,
        },
      ])
    ) as Record<SaasModuleKey, SaasModulePriceRow>,
    cycle,
    tenant.usage,
    limits
  )
  const marginTotal = Math.max(0, total - wholesaleBreakdown.total)

  return (
    <div className="grid gap-3 rounded-lg border border-border/80 p-3 space-y-3 relative pb-28 shadow-sm bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t("saasAdminCust_modulePricingTitle")}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("saasAdminCust_modulePricingDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0">{t("saasAdminCust_pricingMode")}</Label>
          <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as "stage" | "module")}>
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stage">{t("saasAdminCust_pricingModeStage")}</SelectItem>
              <SelectItem value="module">{t("saasAdminCust_pricingModeModule")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={loadingCatalog} onClick={() => void loadGlobalCatalog()}>
          {t("saasAdminCust_moduleLoadCatalog")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={t("saasAdminCust_modulePosOnlyPresetHint")}
          onClick={() => {
            const modules = applyPosOnlyModuleEnabled(modulePrices)
            applyModules(
              modules,
              syncFeaturesOnModuleChange && pricingMode === "module"
                ? syncFeaturesFromModules(tenant.features, modules)
                : undefined
            )
          }}
        >
          {t("saasAdminCust_modulePosOnlyPreset")}
        </Button>
        {scope.isPlatform ? (
          <Button type="button" variant="secondary" size="sm" asChild>
            <Link href="/saas-admin/pricing">{t("saasAdminCust_globalPricingLink")}</Link>
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-10">{t("saasAdminCust_moduleUse")}</TableHead>
            <TableHead>{t("saasAdminCust_moduleName")}</TableHead>
            <TableHead>
              <SaasPricingColumnHead tone="wholesale" className="justify-start">{t("saasAdminCust_wholesaleThb")}</SaasPricingColumnHead>
            </TableHead>
            <TableHead>
              <SaasPricingColumnHead tone="margin" className="justify-start">{t("saasAdminCust_marginThb")}</SaasPricingColumnHead>
            </TableHead>
            <TableHead>
              <SaasPricingColumnHead tone="retail" className="justify-start">{t("saasAdminCust_retailThb")}</SaasPricingColumnHead>
            </TableHead>
            <TableHead>{t("saasAdminCust_moduleQty")}</TableHead>
            <TableHead className="text-right">{t("saasAdminCust_moduleSubtotal")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SAAS_MODULE_KEYS.map((key) => {
            const row = modulePrices[key]
            const line = breakdown.lines.find((x) => x.key === key)
            const wholesale = Number(row[wholesaleCol as keyof SaasModulePriceRow] ?? row[priceCol] ?? 0)
            const margin = Number(row[marginCol as keyof SaasModulePriceRow] ?? 0)
            return (
              <TableRow key={key}>
                <TableCell>
                  <Checkbox
                    checked={row.isEnabled}
                    onCheckedChange={(checked) => updateModule(key, { isEnabled: Boolean(checked) })}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{t(SAAS_MODULE_LABEL_KEY[key])}</div>
                  {row.isPerUnit ? (
                    <p className="text-xs text-muted-foreground">{t("saasAdminCust_modulePerDevice")}</p>
                  ) : null}
                  {row.isCustomQuote ? (
                    <p className="text-xs text-amber-600">{t("saasAdminCust_moduleCustomQuote")}</p>
                  ) : null}
                </TableCell>
                <TableCell className={SAAS_PRICING_TONE.wholesale.cell + " !text-left text-sm"}>
                  {row.isCustomQuote ? "—" : wholesale.toLocaleString()}
                </TableCell>
                <TableCell>
                  {row.isCustomQuote ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-24 border-emerald-200 focus-visible:ring-emerald-500/30 dark:border-emerald-800"
                      value={margin}
                      onChange={(e) => {
                        const nextMargin = Math.max(0, Number(e.target.value || 0))
                        const patched = syncRetailFromMargin(
                          {
                            ...row,
                            [marginCol]: nextMargin,
                          } as SaasModulePriceRow,
                          priceCol
                        )
                        updateModule(key, patched)
                      }}
                    />
                  )}
                </TableCell>
                <TableCell className={SAAS_PRICING_TONE.retail.cell + " !text-left"}>
                  {row.isCustomQuote ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <Input
                      type="number"
                      min={wholesale}
                      className="h-8 w-24 font-semibold text-violet-800 dark:text-violet-200"
                      value={row[priceCol]}
                      onChange={(e) =>
                        updateModule(key, {
                          [priceCol]: Math.max(wholesale, Number(e.target.value || 0)),
                        } as Partial<SaasModulePriceRow>)
                      }
                    />
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.isEnabled && !row.isCustomQuote ? (
                    <>
                      {line?.quantity ?? (row.isPerUnit ? breakdown.billable : 1)}
                      {row.isPerUnit && breakdown.basis === "erp_admin" ? (
                        <span className="block text-[10px] text-muted-foreground">{t("saasAdminCust_posQtyFromErp")}</span>
                      ) : null}
                      {row.isPerUnit && breakdown.basis === "saas_limit" ? (
                        <span className="block text-[10px] text-muted-foreground">{t("saasAdminCust_posQtyFromSaas")}</span>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {row.isEnabled && row.isCustomQuote ? (
                    <Badge variant="outline">{t("saasAdminCust_moduleCustomQuote")}</Badge>
                  ) : row.isEnabled ? (
                    <span className={SAAS_PRICING_TONE.retail.value}>{(line?.lineTotal ?? 0).toLocaleString()}</span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="sticky bottom-0 z-10 -mx-3 -mb-3 border-t border-violet-200/50 bg-gradient-to-t from-background via-background/98 to-background/90 px-3 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 dark:border-violet-900/40">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {pricingMode === "module" ? t("saasAdminCust_moduleBillingActive") : t("saasAdminCust_stageBillingActive")}
        </p>
        {pricingMode === "module" ? (
          <SaasPricingBreakdownVisual
            size="sm"
            wholesale={wholesaleBreakdown.total}
            margin={marginTotal}
            retail={total}
            currency={tenant.pricing.currency}
            labels={{
              wholesale: t("saasAdminCust_wholesaleThb"),
              margin: t("saasAdminCust_marginThb"),
              retail: t("saasAdminCust_retailThb"),
            }}
          />
        ) : (
          <div className="flex justify-end">
            <Badge variant="outline" className="text-base px-4 py-2 font-semibold border-primary/30 bg-primary/5">
              {tr(t, "saasAdminCust_currentCharge", {
                amount: total.toLocaleString(),
                currency: tenant.pricing.currency,
              })}
            </Badge>
          </div>
        )}
      </div>
      {breakdown.hasCustomQuote && pricingMode === "module" ? (
        <p className="text-xs text-amber-600">{t("saasAdminCust_moduleCustomQuoteNote")}</p>
      ) : null}
      {breakdown.capped && pricingMode === "module" && breakdown.basis === "usage" ? (
        <p className="text-xs text-amber-600">
          {tr(t, "saasAdminCust_posBillingCapped", {
            billable: String(breakdown.billable),
            reported: String(breakdown.reported),
            max: String(tenant.limits.maxPosDevices),
          })}
        </p>
      ) : null}
      {breakdown.capped && pricingMode === "module" && breakdown.basis === "erp_admin" ? (
        <p className="text-xs text-amber-600">
          {tr(t, "saasAdminCust_posOverLicensed", {
            licensed: String(breakdown.billable),
            inUse: String(breakdown.reported),
          })}
        </p>
      ) : null}
    </div>
  )
}
