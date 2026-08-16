import type { BillingCycle, FeatureFlags, TenantUsage } from "./saas-admin-control-plane"

/** SaaS 기능(모듈)별 요금 키 — 고객사 관리 · 기능별 요금표 */
export const SAAS_MODULE_KEYS = [
  "pos_base",
  "pos_device",
  "store_ops",
  "kbank",
  "grab",
  "member_mgmt",
  "attendance",
  "cost_analysis",
  "work_log",
  "notices",
  "documents",
  "marketing",
  "logistics",
  "accounting",
  "ai_center",
] as const

export type SaasModuleKey = (typeof SAAS_MODULE_KEYS)[number]

export type SaasModulePriceRow = {
  monthly: number
  yearly: number
  isEnabled: boolean
  /** 단말 1대당 (pos_device) */
  isPerUnit?: boolean
  /** AI 센터 등 — 자동 합계 제외, 협의 */
  isCustomQuote?: boolean
  /** 플랫폼 도매가 (floor) */
  wholesaleMonthly?: number
  wholesaleYearly?: number
  /** 파트너 마진 */
  marginMonthly?: number
  marginYearly?: number
}

export type ModuleChargeLine = {
  key: SaasModuleKey
  labelKey: string
  quantity: number
  unitAmount: number
  lineTotal: number
  isCustomQuote?: boolean
}

export type ModuleChargeResult = {
  total: number
  lines: ModuleChargeLine[]
  hasCustomQuote: boolean
}

export const DEFAULT_SAAS_MODULE_PRICES: Record<SaasModuleKey, SaasModulePriceRow> = {
  pos_base: { monthly: 300, yearly: 3000, isEnabled: true },
  pos_device: { monthly: 100, yearly: 1000, isEnabled: true, isPerUnit: true },
  store_ops: { monthly: 50, yearly: 500, isEnabled: false },
  kbank: { monthly: 300, yearly: 3000, isEnabled: false },
  grab: { monthly: 300, yearly: 3000, isEnabled: false },
  member_mgmt: { monthly: 100, yearly: 1000, isEnabled: false },
  attendance: { monthly: 100, yearly: 1000, isEnabled: false },
  cost_analysis: { monthly: 50, yearly: 500, isEnabled: false },
  work_log: { monthly: 50, yearly: 500, isEnabled: false },
  notices: { monthly: 50, yearly: 500, isEnabled: false },
  documents: { monthly: 50, yearly: 500, isEnabled: false },
  marketing: { monthly: 100, yearly: 1000, isEnabled: false },
  logistics: { monthly: 100, yearly: 1000, isEnabled: false },
  accounting: { monthly: 100, yearly: 1000, isEnabled: false },
  ai_center: { monthly: 0, yearly: 0, isEnabled: false, isCustomQuote: true },
}

/** i18n 키: saasAdminMod_<key> */
export const SAAS_MODULE_LABEL_KEY: Record<SaasModuleKey, string> = {
  pos_base: "saasAdminMod_pos_base",
  pos_device: "saasAdminMod_pos_device",
  store_ops: "saasAdminMod_store_ops",
  kbank: "saasAdminMod_kbank",
  grab: "saasAdminMod_grab",
  member_mgmt: "saasAdminMod_member_mgmt",
  attendance: "saasAdminMod_attendance",
  cost_analysis: "saasAdminMod_cost_analysis",
  work_log: "saasAdminMod_work_log",
  notices: "saasAdminMod_notices",
  documents: "saasAdminMod_documents",
  marketing: "saasAdminMod_marketing",
  logistics: "saasAdminMod_logistics",
  accounting: "saasAdminMod_accounting",
  ai_center: "saasAdminMod_ai_center",
}

export type PricingMode = "stage" | "module"

export function cloneDefaultModulePrices(): Record<SaasModuleKey, SaasModulePriceRow> {
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    out[key] = { ...DEFAULT_SAAS_MODULE_PRICES[key] }
  }
  return out
}

export function normalizeModulePrices(raw: unknown): Record<SaasModuleKey, SaasModulePriceRow> {
  const base = cloneDefaultModulePrices()
  if (!raw || typeof raw !== "object") return base
  const obj = raw as Record<string, Partial<SaasModulePriceRow>>
  for (const key of SAAS_MODULE_KEYS) {
    const row = obj[key]
    if (!row) continue
    const monthly = Math.max(0, Number(row.monthly ?? base[key].monthly))
    const yearly = Math.max(0, Number(row.yearly ?? base[key].yearly))
    const wholesaleMonthly = Math.max(0, Number(row.wholesaleMonthly ?? row.monthly ?? base[key].monthly))
    const wholesaleYearly = Math.max(0, Number(row.wholesaleYearly ?? row.yearly ?? base[key].yearly))
    base[key] = {
      monthly: Math.max(monthly, wholesaleMonthly),
      yearly: Math.max(yearly, wholesaleYearly),
      isEnabled: row.isEnabled === true,
      isPerUnit: row.isPerUnit ?? base[key].isPerUnit,
      isCustomQuote: row.isCustomQuote ?? base[key].isCustomQuote,
      wholesaleMonthly,
      wholesaleYearly,
      marginMonthly: Math.max(0, monthly - wholesaleMonthly),
      marginYearly: Math.max(0, yearly - wholesaleYearly),
    }
  }
  return base
}

function roundPrice(n: number): number {
  return Math.max(0, Math.round(n))
}

/** 도매가 + 마진% → 소매가(청구가) 반영 */
export function applyWholesaleWithMarginPct(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  catalog: Record<SaasModuleKey, SaasModulePriceRow>,
  marginPct: number
): Record<SaasModuleKey, SaasModulePriceRow> {
  const factor = 1 + Math.max(0, marginPct) / 100
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    const wholesaleM = roundPrice(catalog[key].monthly)
    const wholesaleY = roundPrice(catalog[key].yearly)
    const retailM = roundPrice(wholesaleM * factor)
    const retailY = roundPrice(wholesaleY * factor)
    out[key] = {
      ...modules[key],
      wholesaleMonthly: wholesaleM,
      wholesaleYearly: wholesaleY,
      marginMonthly: retailM - wholesaleM,
      marginYearly: retailY - wholesaleY,
      monthly: retailM,
      yearly: retailY,
      isPerUnit: catalog[key].isPerUnit ?? modules[key].isPerUnit,
      isCustomQuote: catalog[key].isCustomQuote ?? modules[key].isCustomQuote,
    }
  }
  return out
}

/** 글로벌 카탈로그 → 도매가 스냅샷 (소매·마진 유지 또는 marginPct로 재계산) */
export function applyCatalogWholesaleToModules(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  catalog: Record<SaasModuleKey, SaasModulePriceRow>,
  options?: { marginPct?: number; preserveRetailAboveWholesale?: boolean }
): Record<SaasModuleKey, SaasModulePriceRow> {
  if (options?.marginPct != null) {
    return applyWholesaleWithMarginPct(modules, catalog, options.marginPct)
  }
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    const wholesaleM = roundPrice(catalog[key].monthly)
    const wholesaleY = roundPrice(catalog[key].yearly)
    const prevM = Math.max(modules[key].monthly, wholesaleM)
    const prevY = Math.max(modules[key].yearly, wholesaleY)
    const retailM = options?.preserveRetailAboveWholesale ? Math.max(prevM, wholesaleM) : wholesaleM
    const retailY = options?.preserveRetailAboveWholesale ? Math.max(prevY, wholesaleY) : wholesaleY
    out[key] = {
      ...modules[key],
      wholesaleMonthly: wholesaleM,
      wholesaleYearly: wholesaleY,
      monthly: retailM,
      yearly: retailY,
      marginMonthly: retailM - wholesaleM,
      marginYearly: retailY - wholesaleY,
      isPerUnit: catalog[key].isPerUnit,
      isCustomQuote: catalog[key].isCustomQuote,
    }
  }
  return out
}

export function syncRetailFromMargin(row: SaasModulePriceRow, cycle: "monthly" | "yearly"): SaasModulePriceRow {
  const wholesaleM = Math.max(0, Number(row.wholesaleMonthly ?? row.monthly ?? 0))
  const wholesaleY = Math.max(0, Number(row.wholesaleYearly ?? row.yearly ?? 0))
  const marginM = Math.max(0, Number(row.marginMonthly ?? 0))
  const marginY = Math.max(0, Number(row.marginYearly ?? 0))
  return {
    ...row,
    wholesaleMonthly: wholesaleM,
    wholesaleYearly: wholesaleY,
    marginMonthly: marginM,
    marginYearly: marginY,
    monthly: wholesaleM + marginM,
    yearly: wholesaleY + marginY,
  }
}

export function syncMarginFromRetail(row: SaasModulePriceRow): SaasModulePriceRow {
  const wholesaleM = Math.max(0, Number(row.wholesaleMonthly ?? 0))
  const wholesaleY = Math.max(0, Number(row.wholesaleYearly ?? 0))
  const retailM = Math.max(wholesaleM, Number(row.monthly ?? wholesaleM))
  const retailY = Math.max(wholesaleY, Number(row.yearly ?? wholesaleY))
  return {
    ...row,
    wholesaleMonthly: wholesaleM,
    wholesaleYearly: wholesaleY,
    monthly: retailM,
    yearly: retailY,
    marginMonthly: retailM - wholesaleM,
    marginYearly: retailY - wholesaleY,
  }
}

export function validateModulePricesFloor(
  modules: Record<SaasModuleKey, SaasModulePriceRow>
): { ok: true } | { ok: false; moduleKey: SaasModuleKey; message: string } {
  for (const key of SAAS_MODULE_KEYS) {
    const row = syncMarginFromRetail(modules[key])
    const wholesaleM = Number(row.wholesaleMonthly ?? 0)
    const wholesaleY = Number(row.wholesaleYearly ?? 0)
    if (row.monthly < wholesaleM || row.yearly < wholesaleY) {
      return { ok: false, moduleKey: key, message: `소매가는 도매가 이상이어야 합니다: ${key}` }
    }
  }
  return { ok: true }
}

export function resolveWholesaleModuleChargeAmount(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  cycle: BillingCycle,
  usage: Pick<TenantUsage, "posDevices">
): ModuleChargeResult {
  const wholesaleModules = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    const row = modules[key]
    wholesaleModules[key] = {
      ...row,
      monthly: Number(row.wholesaleMonthly ?? row.monthly ?? 0),
      yearly: Number(row.wholesaleYearly ?? row.yearly ?? 0),
    }
  }
  return resolveModuleChargeAmount(wholesaleModules, cycle, usage)
}

export function resolveMarginModuleChargeAmount(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  cycle: BillingCycle,
  usage: Pick<TenantUsage, "posDevices">
): ModuleChargeResult {
  const marginModules = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    const row = syncMarginFromRetail(modules[key])
    marginModules[key] = {
      ...row,
      monthly: Number(row.marginMonthly ?? 0),
      yearly: Number(row.marginYearly ?? 0),
    }
  }
  return resolveModuleChargeAmount(marginModules, cycle, usage)
}

/** 신규 고객·기능 토글 연동 시 기본 ON 추론 (저장된 isEnabled 없을 때) */
export function inferModuleEnabledFromFeatures(features: FeatureFlags): Partial<Record<SaasModuleKey, boolean>> {
  return {
    pos_base: features.pos,
    pos_device: features.pos,
    kbank: features.apiAccess,
    grab: features.apiAccess,
    member_mgmt: features.marketing,
    attendance: features.payroll,
    cost_analysis: features.analytics,
    work_log: features.analytics,
    marketing: features.marketing,
    logistics: features.inventory,
    accounting: features.accounting,
    ai_center: features.aiAssistant,
  }
}

export function mergeModulePricesWithFeatures(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  features: FeatureFlags,
  preferStoredEnabled: boolean
): Record<SaasModuleKey, SaasModulePriceRow> {
  const inferred = inferModuleEnabledFromFeatures(features)
  const out = cloneDefaultModulePrices()
  for (const key of SAAS_MODULE_KEYS) {
    out[key] = { ...modules[key] }
    if (!preferStoredEnabled && modules[key]?.isEnabled === DEFAULT_SAAS_MODULE_PRICES[key].isEnabled) {
      if (inferred[key] != null) out[key].isEnabled = inferred[key] === true
    }
  }
  return out
}

export function resolveModuleChargeAmount(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  cycle: BillingCycle,
  usage: Pick<TenantUsage, "posDevices">
): ModuleChargeResult {
  const lines: ModuleChargeLine[] = []
  let total = 0
  let hasCustomQuote = false

  for (const key of SAAS_MODULE_KEYS) {
    const row = modules[key]
    if (!row?.isEnabled) continue
    if (row.isCustomQuote) {
      hasCustomQuote = true
      lines.push({
        key,
        labelKey: SAAS_MODULE_LABEL_KEY[key],
        quantity: 0,
        unitAmount: 0,
        lineTotal: 0,
        isCustomQuote: true,
      })
      continue
    }
    const unitAmount = cycle === "yearly" ? Number(row.yearly || 0) : Number(row.monthly || 0)
    const quantity = row.isPerUnit ? Math.max(0, Math.floor(Number(usage.posDevices || 0))) : 1
    const lineTotal = unitAmount * quantity
    total += lineTotal
    lines.push({
      key,
      labelKey: SAAS_MODULE_LABEL_KEY[key],
      quantity,
      unitAmount,
      lineTotal,
    })
  }

  return { total, lines, hasCustomQuote }
}

export function resolveEffectiveChargeAmount(params: {
  pricingMode: PricingMode
  billingCycle: BillingCycle
  stageAmount: number
  modulePrices: Record<SaasModuleKey, SaasModulePriceRow>
  usage: Pick<TenantUsage, "posDevices">
}): number {
  if (params.pricingMode === "module") {
    return resolveModuleChargeAmount(params.modulePrices, params.billingCycle, params.usage).total
  }
  return params.stageAmount
}

export type SaasModuleCatalogRow = {
  moduleKey: SaasModuleKey
  monthly: number
  yearly: number
  isPerUnit: boolean
  isCustomQuote: boolean
  sortOrder: number
}

/**
 * 런타임에 끌 수 없는 모듈. POS-only 고객은 공지·회사문서를 숨겨야 하므로 비워 둔다.
 * (충만은 tenantId 없음 → 전 모듈 허용)
 */
export const ALWAYS_ON_SAAS_MODULES: SaasModuleKey[] = []

/** Omni POS-only 패키지 — 매출·POS·단말·직원 계정 + 결제(KBank)·배달(Grab) */
export const POS_ONLY_SAAS_MODULES: readonly SaasModuleKey[] = [
  "pos_base",
  "pos_device",
  "kbank",
  "grab",
]

export function applyPosOnlyModuleEnabled(
  modules: Record<SaasModuleKey, SaasModulePriceRow>
): Record<SaasModuleKey, SaasModulePriceRow> {
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  const keep = new Set<SaasModuleKey>(POS_ONLY_SAAS_MODULES)
  for (const key of SAAS_MODULE_KEYS) {
    out[key] = { ...modules[key], isEnabled: keep.has(key) }
  }
  return out
}

export function modulePricesFromCatalog(rows: SaasModuleCatalogRow[]): Record<SaasModuleKey, SaasModulePriceRow> {
  const base = cloneDefaultModulePrices()
  for (const row of rows) {
    if (!SAAS_MODULE_KEYS.includes(row.moduleKey)) continue
    base[row.moduleKey] = {
      ...base[row.moduleKey],
      monthly: Math.max(0, row.monthly),
      yearly: Math.max(0, row.yearly),
      isPerUnit: row.isPerUnit,
      isCustomQuote: row.isCustomQuote,
    }
  }
  return base
}

export function defaultModuleCatalogRows(): SaasModuleCatalogRow[] {
  return SAAS_MODULE_KEYS.map((moduleKey, index) => ({
    moduleKey,
    monthly: DEFAULT_SAAS_MODULE_PRICES[moduleKey].monthly,
    yearly: DEFAULT_SAAS_MODULE_PRICES[moduleKey].yearly,
    isPerUnit: DEFAULT_SAAS_MODULE_PRICES[moduleKey].isPerUnit === true,
    isCustomQuote: DEFAULT_SAAS_MODULE_PRICES[moduleKey].isCustomQuote === true,
    sortOrder: (index + 1) * 10,
  }))
}

/** 기능 토글 → 모듈 과금 ON/OFF (단가는 유지) */
export function syncModuleEnabledFromFeatures(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  features: FeatureFlags
): Record<SaasModuleKey, SaasModulePriceRow> {
  const inferred = inferModuleEnabledFromFeatures(features)
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) {
    out[key] = { ...modules[key] }
    if (ALWAYS_ON_SAAS_MODULES.includes(key)) {
      out[key].isEnabled = true
    } else if (inferred[key] != null) {
      out[key].isEnabled = inferred[key] === true
    }
  }
  return out
}

/** 모듈 과금 ON/OFF → ERP feature flag (보조 동기화) */
export function syncFeaturesFromModules(
  features: FeatureFlags,
  modules: Record<SaasModuleKey, SaasModulePriceRow>
): FeatureFlags {
  return {
    ...features,
    pos: modules.pos_base.isEnabled || modules.pos_device.isEnabled,
    payroll: modules.attendance.isEnabled,
    inventory: modules.logistics.isEnabled,
    accounting: modules.accounting.isEnabled,
    analytics: modules.cost_analysis.isEnabled || modules.work_log.isEnabled,
    marketing: modules.marketing.isEnabled || modules.member_mgmt.isEnabled,
    aiAssistant: modules.ai_center.isEnabled,
    apiAccess: modules.kbank.isEnabled || modules.grab.isEnabled,
  }
}

/** 글로벌 카탈로그 단가를 고객사 modulePrices에 반영 (isEnabled 유지) */
export function applyCatalogPricesToModules(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  catalog: Record<SaasModuleKey, SaasModulePriceRow>
): Record<SaasModuleKey, SaasModulePriceRow> {
  return applyCatalogWholesaleToModules(modules, catalog, { preserveRetailAboveWholesale: true })
}

export function mergeTenantModulePricing(params: {
  catalog: Record<SaasModuleKey, SaasModulePriceRow>
  tenantRows: Array<{
    tenant_id: string
    module_key: string
    monthly_price?: number | null
    yearly_price?: number | null
    wholesale_monthly?: number | null
    wholesale_yearly?: number | null
    margin_monthly?: number | null
    margin_yearly?: number | null
    is_enabled?: boolean | null
    is_per_unit?: boolean | null
    is_custom_quote?: boolean | null
  }>
  tenantId: string
}): Record<SaasModuleKey, SaasModulePriceRow> {
  const catalog = params.catalog
  const base = cloneDefaultModulePrices()
  for (const key of SAAS_MODULE_KEYS) {
    base[key] = {
      ...base[key],
      monthly: catalog[key].monthly,
      yearly: catalog[key].yearly,
      isPerUnit: catalog[key].isPerUnit,
      isCustomQuote: catalog[key].isCustomQuote,
    }
  }
  for (const row of params.tenantRows) {
    if (String(row.tenant_id || "").trim() !== params.tenantId) continue
    const key = String(row.module_key || "").trim() as SaasModuleKey
    if (!SAAS_MODULE_KEYS.includes(key)) continue
    base[key] = {
      monthly: Number(row.monthly_price ?? base[key].monthly),
      yearly: Number(row.yearly_price ?? base[key].yearly),
      wholesaleMonthly: Number(row.wholesale_monthly ?? row.monthly_price ?? base[key].monthly),
      wholesaleYearly: Number(row.wholesale_yearly ?? row.yearly_price ?? base[key].yearly),
      marginMonthly: Number(row.margin_monthly ?? 0),
      marginYearly: Number(row.margin_yearly ?? 0),
      isEnabled: row.is_enabled === true,
      isPerUnit: row.is_per_unit === true || base[key].isPerUnit,
      isCustomQuote: row.is_custom_quote === true || base[key].isCustomQuote,
    }
    base[key] = syncMarginFromRetail(base[key])
  }
  return base
}

/** KBank/Grab 연동 활성 시 해당 모듈 과금 ON */
export function applyIntegrationFlagsToModules(
  modules: Record<SaasModuleKey, SaasModulePriceRow>,
  flags: { kbank?: boolean; grab?: boolean }
): Record<SaasModuleKey, SaasModulePriceRow> {
  const out = {} as Record<SaasModuleKey, SaasModulePriceRow>
  for (const key of SAAS_MODULE_KEYS) out[key] = { ...modules[key] }
  if (flags.kbank) out.kbank = { ...out.kbank, isEnabled: true }
  if (flags.grab) out.grab = { ...out.grab, isEnabled: true }
  return out
}
