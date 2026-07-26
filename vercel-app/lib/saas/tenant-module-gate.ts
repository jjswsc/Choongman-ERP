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

type TenantSaasModuleStateLoad =
  | { ok: true; state: TenantSaasModuleState }
  | { ok: false; unavailable: true }

async function loadTenantSaasModuleState(tenantId: string): Promise<TenantSaasModuleStateLoad> {
  const key = tenantCacheKey(tenantId)
  const hit = stateCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return { ok: true, state: hit.state }

  const enc = encodeURIComponent(tenantId)
  try {
    const [moduleRows, featureRows] = await Promise.all([
      supabaseSelectFilter("tenant_module_pricing", `tenant_id=eq.${enc}`, {
        limit: 50,
        select: "module_key,is_enabled",
      }),
      supabaseSelectFilter("tenant_feature_overrides", `tenant_id=eq.${enc}`, {
        limit: 50,
        select: "feature_key,is_enabled",
      }),
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
    return { ok: true, state }
  } catch (e) {
    console.warn("loadTenantSaasModuleState:", tenantId, e)
    return { ok: false, unavailable: true }
  }
}

export function saasModuleGateUnavailableJsonResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      code: "saas_module_gate_unavailable",
      message: "SaaS 모듈 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      msg: "SaaS 모듈 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    },
    { status: 503 }
  )
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

/** tenantId 없으면(충만 레거시) 전 모듈 허용. 조회 실패 시 false(유료 기능 fail-closed). */
export async function isSaasModuleEnabledForTenant(
  tenantId: string | undefined | null,
  moduleKey: SaasModuleKey
): Promise<boolean> {
  const tid = String(tenantId || "").trim()
  if (!tid) return true
  const loaded = await loadTenantSaasModuleState(tid)
  if (!loaded.ok) return false
  return resolveModuleEnabledFromState(loaded.state, moduleKey)
}

/** tenantId 없으면(충만 레거시) 전 모듈 허용 */
export async function isSaasModuleEnabledForAuth(
  auth: JwtPayload,
  moduleKey: SaasModuleKey
): Promise<boolean> {
  return isSaasModuleEnabledForTenant(auth.tenantId, moduleKey)
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
  const loaded = await loadTenantSaasModuleState(tenantId)
  for (const key of SAAS_MODULE_KEYS) {
    out[key] = loaded.ok ? resolveModuleEnabledFromState(loaded.state, key) : ALWAYS_ON_SAAS_MODULES.includes(key)
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

export type SaasTenantActiveLookup =
  | { ok: true; active: boolean }
  | { ok: false; unavailable: true }

/** tenants.is_active — 조회 실패 시 unavailable (fail-closed용) */
export async function lookupSaasTenantAccountActive(
  tenantId: string
): Promise<SaasTenantActiveLookup> {
  const id = String(tenantId || "").trim()
  if (!id) return { ok: true, active: true }
  const key = tenantCacheKey(id)
  const hit = tenantActiveCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return { ok: true, active: hit.active }

  try {
    const rows = (await supabaseSelectFilter("tenants", `id=eq.${encodeURIComponent(id)}`, {
      limit: 1,
      select: "is_active",
    })) as Array<{ is_active?: boolean | null }>
    const active = rows?.[0] == null ? true : rows[0].is_active !== false
    tenantActiveCache.set(key, { at: Date.now(), active })
    return { ok: true, active }
  } catch (e) {
    console.warn("lookupSaasTenantAccountActive:", id, e)
    return { ok: false, unavailable: true }
  }
}

export function saasTenantStatusUnavailableJsonResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      code: "saas_tenant_status_unavailable",
      message: "고객사 상태 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      msg: "고객사 상태 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    },
    { status: 503 }
  )
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

/** 정지 여부만 검사 (모듈 게이트 스킵 경로용). tenantId 없으면 null */
export async function resolveSaasTenantSuspendResponse(
  tenantId: string | undefined | null
): Promise<NextResponse | null> {
  const id = String(tenantId || "").trim()
  if (!id) return null
  const lookup = await lookupSaasTenantAccountActive(id)
  if (!lookup.ok) return saasTenantStatusUnavailableJsonResponse()
  if (!lookup.active) return saasTenantSuspendedJsonResponse()
  return null
}

/** requireAuth 마지막 단계 — 정지 계정 fail-closed + API 경로 모듈 게이트 */
export async function resolveSaasModuleGateResponse(
  auth: JwtPayload,
  apiPathname: string
): Promise<NextResponse | null> {
  const tenantId = String(auth.tenantId || "").trim()
  if (!tenantId) return null

  const suspend = await resolveSaasTenantSuspendResponse(tenantId)
  if (suspend) return suspend

  const moduleKey = resolveApiPathSaasModule(apiPathname)
  if (!moduleKey) return null

  const loaded = await loadTenantSaasModuleState(tenantId)
  if (!loaded.ok) return saasModuleGateUnavailableJsonResponse()
  if (resolveModuleEnabledFromState(loaded.state, moduleKey)) return null
  return saasModuleGateJsonResponse(moduleKey)
}
