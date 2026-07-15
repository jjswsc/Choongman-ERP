"use client"

import * as React from "react"
import { apiFetchWithOffline } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { SAAS_MODULE_KEYS, type SaasModuleKey } from "@/lib/saas-module-pricing"

export type SaasEnabledModulesMap = Record<SaasModuleKey, boolean>

/** loginCheck 응답으로 심은 모듈 — 로그인 직후 /api/saas/enabled-modules 왕복 생략 */
let seededModules: SaasEnabledModulesMap | null = null
let seededTenantKey: string | null = null

function tenantSeedKey(tenantId?: string | null): string {
  return String(tenantId || "").trim().toLowerCase()
}

function normalizeModulesMap(
  partial: Partial<SaasEnabledModulesMap> | null | undefined
): SaasEnabledModulesMap {
  const out = {} as SaasEnabledModulesMap
  for (const key of SAAS_MODULE_KEYS) {
    out[key] = partial?.[key] !== false
  }
  return out
}

/**
 * loginCheck 성공 직후 호출 — useSaasEnabledModules가 즉시 맵을 쓰도록 시드.
 * tenantId 없으면(충만·파트너) 전부 ON으로 저장.
 */
export function seedSaasEnabledModules(
  modules: Partial<SaasEnabledModulesMap> | null | undefined,
  tenantId?: string | null
): void {
  seededModules = normalizeModulesMap(modules)
  seededTenantKey = tenantSeedKey(tenantId)
}

export function clearSaasEnabledModulesSeed(): void {
  seededModules = null
  seededTenantKey = null
}

/** SaaS 테넌트 모듈 ON/OFF. null = 로딩 전(레거시 UX — 전부 허용). tenantId 없으면 전부 true. */
export function useSaasEnabledModules(): SaasEnabledModulesMap | null {
  const { auth } = useAuth()
  const [modules, setModules] = React.useState<SaasEnabledModulesMap | null>(() => {
    if (seededModules) return seededModules
    return null
  })

  React.useEffect(() => {
    if (!auth) {
      setModules(null)
      clearSaasEnabledModulesSeed()
      return
    }
    let cancelled = false
    const tid = tenantSeedKey(auth.tenantId)

    if (seededModules && seededTenantKey === tid) {
      setModules(seededModules)
      /** 시드가 있으면 즉시 사용 — 백그라운드 재검증은 skip (로그인 직후 hop 제거 목적) */
      return () => {
        cancelled = true
      }
    }

    void apiFetchWithOffline("/api/saas/enabled-modules")
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) {
            const allOn = normalizeModulesMap(null)
            setModules(allOn)
          }
          return
        }
        const json = (await res.json()) as { modules?: Partial<SaasEnabledModulesMap> }
        if (cancelled) return
        const out = normalizeModulesMap(json.modules)
        setModules(out)
        seededModules = out
        seededTenantKey = tid
      })
      .catch(() => {
        if (!cancelled) {
          setModules(normalizeModulesMap(null))
        }
      })
    return () => {
      cancelled = true
    }
  }, [auth])

  return modules
}

export function isSaasModuleEnabled(
  modules: SaasEnabledModulesMap | null,
  moduleKey: SaasModuleKey | null
): boolean {
  if (!moduleKey) return true
  if (modules == null) return true
  return modules[moduleKey] !== false
}
