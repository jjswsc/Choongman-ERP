import "server-only"

import { NextResponse } from "next/server"
import type { JwtPayload } from "@/lib/jwt-auth"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import type { FeatureFlags } from "@/lib/saas-admin-control-plane"
import {
  ALWAYS_ON_SAAS_MODULES,
  DEFAULT_SAAS_MODULE_PRICES,
  SAAS_MODULE_KEYS,
  SAAS_MODULE_LABEL_KEY,
  type SaasModuleKey,
} from "@/lib/saas-module-pricing"
import { resolveApiPathSaasModule } from "@/lib/saas/erp-route-modules"

/** 모듈 ↔ tenant_feature_overrides.feature_key */
const MODULE_FEATURE_KEYS: Partial<Record<SaasModuleKey, (keyof FeatureFlags)[]>> = {
  pos_base: ["pos"],
  pos_device: ["pos"],
  kbank: ["apiAccess"],
  grab: ["apiAccess"],
  member_mgmt: ["marketing"],
  attendance: ["payroll"],
  cost_analysis: ["analytics"],
  work_log: ["analytics"],
  marketing: ["marketing"],
  logistics: ["inventory"],
  accounting: ["accounting"],
  ai_center: ["aiAssistant"],
}

type TenantSaasModuleState = {
  modules: Partial<Record<SaasModuleKey, boolean>>
  features: Partial<Record<keyof FeatureFlags, boolean>>
}

const stateCache = new Map<string, { at: number; state: TenantSaasModuleState }>()
const CACHE_MS = 30_000

function tenantCacheKey(tenantId: string): string {
  return tenantId.trim().toLowerCase()
}

async function loadTenantSaasModuleState(tenantId: string): Promise<TenantSaasModuleState> {
  const key = tenantCacheKey(tenantId)
  const hit = stateCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.state

  const enc = encodeURIComponent(tenantId)
  const [moduleRows, featureRows] = await Promise.all([
    supabaseSelectFilter("tenant_module_pricing", `tenant_id=eq.${enc}`, {
      limit: 50,
      select: "module_key,is_enabled",
    }).catch(() => []),
    supabaseSelectFilter("tenant_feature_overrides", `tenant_id=eq.${enc}`, {
      limit: 50,
      select: "feature_key,is_enabled",
    }).catch(() => []),
  ])

  const modules: Partial<Record<SaasModuleKey, boolean>> = {}
  for (const row of (moduleRows || []) as Array<{ module_key?: string; is_enabled?: boolean }>) {
    const mk = String(row.module_key || "").trim() as SaasModuleKey
    if (!SAAS_MODULE_KEYS.includes(mk)) continue
    modules[mk] = row.is_enabled === true
  }

  const features: Partial<Record<keyof FeatureFlags, boolean>> = {}
  for (const row of (featureRows || []) as Array<{ feature_key?: string; is_enabled?: boolean }>) {
    const fk = String(row.feature_key || "").trim() as keyof FeatureFlags
    if (!fk) continue
    features[fk] = row.is_enabled === true
  }

  const state = { modules, features }
  stateCache.set(key, { at: Date.now(), state })
  return state
}

function resolveModuleEnabledFromState(state: TenantSaasModuleState, moduleKey: SaasModuleKey): boolean {
  if (ALWAYS_ON_SAAS_MODULES.includes(moduleKey)) return true

  const featureKeys = MODULE_FEATURE_KEYS[moduleKey] || []
  for (const fk of featureKeys) {
    if (state.features[fk] === true) return true
    if (state.features[fk] === false) return false
  }

  if (state.modules[moduleKey] != null) return state.modules[moduleKey] === true
  return DEFAULT_SAAS_MODULE_PRICES[moduleKey].isEnabled === true
}

/** tenantId 없으면(충만 레거시) 전 모듈 허용 */
export async function isSaasModuleEnabledForAuth(
  auth: JwtPayload,
  moduleKey: SaasModuleKey
): Promise<boolean> {
  const tenantId = String(auth.tenantId || "").trim()
  if (!tenantId) return true
  const state = await loadTenantSaasModuleState(tenantId)
  return resolveModuleEnabledFromState(state, moduleKey)
}

export async function loadSaasEnabledModulesForAuth(
  auth: JwtPayload
): Promise<Record<SaasModuleKey, boolean>> {
  const tenantId = String(auth.tenantId || "").trim()
  const out = {} as Record<SaasModuleKey, boolean>
  if (!tenantId) {
    for (const key of SAAS_MODULE_KEYS) out[key] = true
    return out
  }
  const state = await loadTenantSaasModuleState(tenantId)
  for (const key of SAAS_MODULE_KEYS) {
    out[key] = resolveModuleEnabledFromState(state, key)
  }
  return out
}

export async function requireSaasModuleForAuth(
  auth: JwtPayload,
  moduleKey: SaasModuleKey
): Promise<void> {
  const ok = await isSaasModuleEnabledForAuth(auth, moduleKey)
  if (!ok) {
    throw new SaasModuleGateError(moduleKey)
  }
}

export class SaasModuleGateError extends Error {
  readonly moduleKey: SaasModuleKey
  readonly status = 403

  constructor(moduleKey: SaasModuleKey) {
    super(`SaaS module not enabled: ${moduleKey}`)
    this.name = "SaasModuleGateError"
    this.moduleKey = moduleKey
  }
}

export function saasModuleGateJsonResponse(moduleKey: SaasModuleKey): NextResponse {
  const labelKey = SAAS_MODULE_LABEL_KEY[moduleKey]
  return NextResponse.json(
    {
      success: false,
      code: "SAAS_MODULE_DISABLED",
      moduleKey,
      labelKey,
      message: "이 기능은 현재 고객사 계약에 포함되어 있지 않습니다. SaaS 관리자에게 문의하세요.",
      msg: "이 기능은 현재 고객사 계약에 포함되어 있지 않습니다. SaaS 관리자에게 문의하세요.",
    },
    { status: 403 }
  )
}

const tenantActiveCache = new Map<string, { at: number; active: boolean }>()

/** tenants.is_active === false 이면 정지. 조회 실패·컬럼 없음은 통과(레거시). */
async function isSaasTenantAccountActive(tenantId: string): Promise<boolean> {
  const key = tenantCacheKey(tenantId)
  const hit = tenantActiveCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.active

  try {
    const rows = (await supabaseSelectFilter("tenants", `id=eq.${encodeURIComponent(tenantId)}`, {
      limit: 1,
      select: "is_active",
    })) as Array<{ is_active?: boolean | null }>
    const active = rows?.[0] == null ? true : rows[0].is_active !== false
    tenantActiveCache.set(key, { at: Date.now(), active })
    return active
  } catch {
    tenantActiveCache.set(key, { at: Date.now(), active: true })
    return true
  }
}

export function saasTenantSuspendedJsonResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      code: "tenant_suspended",
      message: "이용이 중지된 고객사입니다. 본사/SaaS 관리자에게 문의하세요.",
      msg: "이용이 중지된 고객사입니다. 본사/SaaS 관리자에게 문의하세요.",
    },
    { status: 403 }
  )
}

/** requireAuth 마지막 단계 — 정지 계정 fail-closed + API 경로 모듈 게이트 */
export async function resolveSaasModuleGateResponse(
  auth: JwtPayload,
  apiPathname: string
): Promise<NextResponse | null> {
  const tenantId = String(auth.tenantId || "").trim()
  if (!tenantId) return null

  if (!(await isSaasTenantAccountActive(tenantId))) {
    return saasTenantSuspendedJsonResponse()
  }

  const moduleKey = resolveApiPathSaasModule(apiPathname)
  if (!moduleKey) return null

  const enabled = await isSaasModuleEnabledForAuth(auth, moduleKey)
  if (enabled) return null
  return saasModuleGateJsonResponse(moduleKey)
}
