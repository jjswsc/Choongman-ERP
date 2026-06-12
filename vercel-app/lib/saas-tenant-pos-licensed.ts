import { parsePosDeviceRoleLimitsRow, type PosDeviceRoleLimits } from "./pos-device-role-limits"

export type PosDeviceBillingBasis = "erp_admin" | "saas_limit" | "usage"

export function licensedPosSlotsFromStoreSettings(limits: PosDeviceRoleLimits): number {
  return limits.mainDeviceMaxCount + limits.orderDeviceMaxCount
}

export function licensedPosSlotsFromRow(raw: {
  main_device_max_count?: unknown
  order_device_max_count?: unknown
  main_device_role_locked?: unknown
} | null | undefined): number {
  return licensedPosSlotsFromStoreSettings(parsePosDeviceRoleLimitsRow(raw))
}

/** ERP 관리자(단말 설정) 합계 — 매장별 main+order 슬롯 */
export function sumLicensedPosFromStoreRows(
  storeCodes: string[],
  settingsByStore: Map<string, { main_device_max_count?: unknown; order_device_max_count?: unknown; main_device_role_locked?: unknown }>
): number {
  let total = 0
  for (const code of storeCodes) {
    const key = String(code || "").trim()
    if (!key) continue
    total += licensedPosSlotsFromRow(settingsByStore.get(key))
  }
  return total
}

export function defaultPosDeviceBillingBasis(pricingMode: "stage" | "module"): PosDeviceBillingBasis {
  return pricingMode === "module" ? "erp_admin" : "usage"
}

export function normalizePosDeviceBillingBasis(
  raw: unknown,
  pricingMode: "stage" | "module"
): PosDeviceBillingBasis {
  const v = String(raw || "").trim().toLowerCase()
  if (v === "erp_admin" || v === "saas_limit" || v === "usage") return v
  return defaultPosDeviceBillingBasis(pricingMode)
}

export function isChungmanLegacyTenant(tenantId: string): boolean {
  const id = String(tenantId || "").trim().toLowerCase()
  return id === "chungman" || id === "cm" || id.startsWith("chungman-")
}

/** 충만 등 레거시: SaaS 한도 직접 입력. 그 외 Omni module 과금은 ERP 관리자 설정 우선 */
export function resolvePosDeviceBillingBasis(
  tenantId: string,
  pricingMode: "stage" | "module",
  explicit?: PosDeviceBillingBasis | null
): PosDeviceBillingBasis {
  if (explicit) return explicit
  if (isChungmanLegacyTenant(tenantId)) return "saas_limit"
  return defaultPosDeviceBillingBasis(pricingMode)
}
