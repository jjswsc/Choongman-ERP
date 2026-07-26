/**
 * POS 주문 완료 사이드이펙트(재고차감·자동분개·VAT) — SaaS 모듈 OFF면 스킵.
 * 충만(tenant 없음)은 기존과 동일하게 설정 플래그만 따름.
 */

import { resolveTenantIdForStore } from "@/lib/saas-tenant-pos-licensed-server"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { isSaasModuleEnabledForTenant } from "@/lib/saas/tenant-module-gate"

export async function shouldRunPosStockDeductionForStore(storeCode: string): Promise<boolean> {
  const code = String(storeCode || "").trim()
  if (!code) return false
  const tenantId = await resolveTenantIdForStore(code)
  if (!shouldEnforceSaasForAuth(tenantId)) return true
  return isSaasModuleEnabledForTenant(tenantId!, "logistics")
}

export async function shouldRunPosAccountingSideEffectsForStore(storeCode: string): Promise<boolean> {
  const code = String(storeCode || "").trim()
  if (!code) return false
  const tenantId = await resolveTenantIdForStore(code)
  if (!shouldEnforceSaasForAuth(tenantId)) return true
  return isSaasModuleEnabledForTenant(tenantId!, "accounting")
}
