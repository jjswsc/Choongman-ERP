"use client"

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
import {
  applyCatalogPricesToModules,
  cloneDefaultModulePrices,
  normalizeModulePrices,
  syncFeaturesFromModules,
  syncModuleEnabledFromFeatures,
  SAAS_MODULE_KEYS,
  SAAS_MODULE_LABEL_KEY,
  type SaasModuleKey,
  type SaasModulePriceRow,
} from "@/lib/saas-module-pricing"
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
      modules[key] = { ...modules[key], ...patch }
      let next = withRecalcPricing(prev, modules)
      if (syncFeaturesOnModuleChange && pricingMode === "module" && patch.isEnabled != null) {
        next = { ...next, features: syncFeaturesFromModules(prev.features, modules) }
      }
      return next
    })
  }

  const syncFromFeatures = () => {
    const modules = syncModuleEnabledFromFeatures(modulePrices, tenant.features)
    applyModules(modules)
  }

  const syncToFeatures = () => {
    const features = syncFeaturesFromModules(tenant.features, modulePrices)
    onChange((prev) => ({ ...prev, features }))
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
      const modules = applyCatalogPricesToModules(modulePrices, normalizeModulePrices(json.modulePrices))
      applyModules(modules)
      await appAlert(t("saasAdminCust_moduleCatalogLoaded"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setLoadingCatalog(false)
    }
  }

  const priceCol = cycle === "yearly" ? "yearly" : "monthly"

  return (
    <div className="grid gap-3 rounded-md border p-3 space-y-3">
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
        <Button type="button" variant="outline" size="sm" onClick={syncFromFeatures}>
          {t("saasAdminCust_moduleSyncFromFeatures")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={syncToFeatures}>
          {t("saasAdminCust_moduleSyncToFeatures")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={loadingCatalog} onClick={() => void loadGlobalCatalog()}>
          {t("saasAdminCust_moduleLoadCatalog")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">{t("saasAdminCust_moduleUse")}</TableHead>
            <TableHead>{t("saasAdminCust_moduleName")}</TableHead>
            <TableHead>{cycle === "yearly" ? t("saasAdminCust_yearlyThb") : t("saasAdminCust_monthlyThb")}</TableHead>
            <TableHead>{t("saasAdminCust_moduleQty")}</TableHead>
            <TableHead className="text-right">{t("saasAdminCust_moduleSubtotal")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SAAS_MODULE_KEYS.map((key) => {
            const row = modulePrices[key]
            const line = breakdown.lines.find((x) => x.key === key)
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
                <TableCell>
                  {row.isCustomQuote ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-28"
                      value={row[priceCol]}
                      onChange={(e) =>
                        updateModule(key, {
                          [priceCol]: Math.max(0, Number(e.target.value || 0)),
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
                <TableCell className="text-right text-sm">
                  {row.isEnabled && row.isCustomQuote ? (
                    <Badge variant="outline">{t("saasAdminCust_moduleCustomQuote")}</Badge>
                  ) : row.isEnabled ? (
                    (line?.lineTotal ?? 0).toLocaleString()
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {pricingMode === "module"
            ? t("saasAdminCust_moduleBillingActive")
            : t("saasAdminCust_stageBillingActive")}
        </p>
        <Badge variant="outline">
          {tr(t, "saasAdminCust_currentCharge", {
            amount: total.toLocaleString(),
            currency: tenant.pricing.currency,
          })}
        </Badge>
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
