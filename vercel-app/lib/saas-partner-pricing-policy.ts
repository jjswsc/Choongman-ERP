import type { BillingCycle } from "./saas-admin-control-plane"
import {
  SAAS_MODULE_KEYS,
  type SaasModuleKey,
  type SaasModulePriceRow,
  syncMarginFromRetail,
} from "./saas-module-pricing"

export type CatalogRepricePolicy = "retain_margin_pct" | "retain_margin_amount" | "retain_retail"

function roundPrice(n: number): number {
  return Math.max(0, Math.round(n))
}

/** 글로벌 카탈로그 변경 시 도매 갱신 + 정책에 따라 소매/마진 재계산 */
export function applyCatalogWithRepricePolicy(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  catalog: Record<SaasModuleKey, SaasModulePriceRow>,
  policy: CatalogRepricePolicy,
  options?: {
    defaultMarginPct?: number
    moduleMarginPct?: Partial<Record<SaasModuleKey, number>>
  }
): Record<SaasModuleKey, SaasModulePriceRow> {
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    const prev = modules[key]
    const wholesaleM = roundPrice(catalog[key].monthly)
    const wholesaleY = roundPrice(catalog[key].yearly)
    const prevWholesaleM = Math.max(1, Number(prev.wholesaleMonthly ?? prev.monthly ?? wholesaleM))
    const prevWholesaleY = Math.max(1, Number(prev.wholesaleYearly ?? prev.yearly ?? wholesaleY))
    const prevMarginM = Math.max(0, Number(prev.marginMonthly ?? prev.monthly - prevWholesaleM))
    const prevMarginY = Math.max(0, Number(prev.marginYearly ?? prev.yearly - prevWholesaleY))
    const prevRetailM = Math.max(prevWholesaleM, Number(prev.monthly ?? wholesaleM))
    const prevRetailY = Math.max(prevWholesaleY, Number(prev.yearly ?? wholesaleY))

    const modulePct = options?.moduleMarginPct?.[key]
    const defaultPct = options?.defaultMarginPct ?? 0
    const marginPct = modulePct != null ? modulePct : defaultPct

    let retailM = prevRetailM
    let retailY = prevRetailY
    let marginM = prevMarginM
    let marginY = prevMarginY

    if (policy === "retain_margin_amount") {
      marginM = prevMarginM
      marginY = prevMarginY
      retailM = wholesaleM + marginM
      retailY = wholesaleY + marginY
    } else if (policy === "retain_retail") {
      retailM = Math.max(wholesaleM, prevRetailM)
      retailY = Math.max(wholesaleY, prevRetailY)
      marginM = retailM - wholesaleM
      marginY = retailY - wholesaleY
    } else {
      const prevPctM = prevWholesaleM > 0 ? (prevMarginM / prevWholesaleM) * 100 : marginPct
      const prevPctY = prevWholesaleY > 0 ? (prevMarginY / prevWholesaleY) * 100 : marginPct
      const usePctM = modulePct != null || prevMarginM > 0 ? prevPctM : marginPct
      const usePctY = modulePct != null || prevMarginY > 0 ? prevPctY : marginPct
      retailM = roundPrice(wholesaleM * (1 + usePctM / 100))
      retailY = roundPrice(wholesaleY * (1 + usePctY / 100))
      marginM = retailM - wholesaleM
      marginY = retailY - wholesaleY
    }

    out[key] = syncMarginFromRetail({
      ...prev,
      wholesaleMonthly: wholesaleM,
      wholesaleYearly: wholesaleY,
      marginMonthly: marginM,
      marginYearly: marginY,
      monthly: retailM,
      yearly: retailY,
      isPerUnit: catalog[key].isPerUnit ?? prev.isPerUnit,
      isCustomQuote: catalog[key].isCustomQuote ?? prev.isCustomQuote,
    })
  }
  return out
}

export function resolveMarginPctForModule(
  key: SaasModuleKey,
  defaultMarginPct: number,
  moduleMarginPct?: Partial<Record<SaasModuleKey, number>>
): number {
  const hit = moduleMarginPct?.[key]
  return hit != null ? Math.max(0, hit) : Math.max(0, defaultMarginPct)
}

export function applyModuleMarginRulesToCatalog(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  catalog: Record<SaasModuleKey, SaasModulePriceRow>,
  defaultMarginPct: number,
  moduleMarginPct: Partial<Record<SaasModuleKey, number>>
): Record<SaasModuleKey, SaasModulePriceRow> {
  return applyCatalogWithRepricePolicy(modules, catalog, "retain_margin_pct", {
    defaultMarginPct,
    moduleMarginPct,
  })
}

export function tenantChargeTotalsForCycle(
  modulePrices: Record<SaasModuleKey, SaasModulePriceRow>,
  cycle: BillingCycle,
  wholesaleTotal: number,
  retailTotal: number
): { wholesale: number; margin: number; retail: number } {
  void modulePrices
  void cycle
  return {
    wholesale: wholesaleTotal,
    margin: Math.max(0, retailTotal - wholesaleTotal),
    retail: retailTotal,
  }
}
