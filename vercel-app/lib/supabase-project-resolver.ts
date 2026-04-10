import { normalizeTenantId } from "@/lib/tenant-context"

export interface SupabaseProjectConfig {
  url: string
  key: string
  projectId: string
}

type RuntimeMap = Record<string, { url?: string; serviceRoleKey?: string; anonKey?: string }>

function parseRuntimeMap(): RuntimeMap {
  const raw = String(process.env.SUPABASE_RUNTIME_MAP_JSON || "").trim()
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return parsed as RuntimeMap
  } catch {
    return {}
  }
}

function getDefaultConfig(): SupabaseProjectConfig {
  const url = String(process.env.SUPABASE_URL || "").trim()
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim()
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY(권장) 또는 SUPABASE_ANON_KEY가 필요합니다."
    )
  }
  return { url: url.replace(/\/$/, "").replace(/^http:\/\//, "https://"), key, projectId: "default" }
}

/**
 * 하이브리드 운영:
 * - 기본: 단일 멀티테넌트 프로젝트(default)
 * - 엔터프라이즈: tenant별 전용 프로젝트 매핑 (env: SUPABASE_RUNTIME_MAP_JSON)
 */
export function resolveSupabaseProjectConfig(tenantId?: string): SupabaseProjectConfig {
  const base = getDefaultConfig()
  const t = normalizeTenantId(tenantId)
  if (!t) return base
  const runtimeMap = parseRuntimeMap()
  const matched = runtimeMap[t]
  if (!matched?.url) return base
  const key = String(matched.serviceRoleKey || matched.anonKey || "").trim()
  if (!key) return base
  return {
    url: String(matched.url).trim().replace(/\/$/, "").replace(/^http:\/\//, "https://"),
    key,
    projectId: t,
  }
}
