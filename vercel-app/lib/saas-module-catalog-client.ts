import { apiFetch } from "./api/fetch"
import { normalizeModulePrices, type SaasModuleKey, type SaasModulePriceRow } from "./saas-module-pricing"

/** 클라이언트: 글로벌 모듈 단가 카탈로그 조회 */
export async function fetchGlobalModulePrices(): Promise<Record<SaasModuleKey, SaasModulePriceRow> | null> {
  try {
    const res = await apiFetch("/api/saasAdminModulePricingCatalog")
    const json = (await res.json()) as {
      success?: boolean
      modulePrices?: Record<SaasModuleKey, SaasModulePriceRow>
    }
    if (!res.ok || json.success !== true || !json.modulePrices) return null
    return normalizeModulePrices(json.modulePrices)
  } catch {
    return null
  }
}
