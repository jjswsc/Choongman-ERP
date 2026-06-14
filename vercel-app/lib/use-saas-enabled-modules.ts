"use client"

import * as React from "react"
import { apiFetchWithOffline } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { SAAS_MODULE_KEYS, type SaasModuleKey } from "@/lib/saas-module-pricing"

export type SaasEnabledModulesMap = Record<SaasModuleKey, boolean>

/** SaaS 테넌트 모듈 ON/OFF. null = 로딩 전(레거시 UX — 전부 허용). tenantId 없으면 전부 true. */
export function useSaasEnabledModules(): SaasEnabledModulesMap | null {
  const { auth } = useAuth()
  const [modules, setModules] = React.useState<SaasEnabledModulesMap | null>(null)

  React.useEffect(() => {
    if (!auth) {
      setModules(null)
      return
    }
    let cancelled = false
    void apiFetchWithOffline("/api/saas/enabled-modules")
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) {
            const allOn = {} as SaasEnabledModulesMap
            for (const key of SAAS_MODULE_KEYS) allOn[key] = true
            setModules(allOn)
          }
          return
        }
        const json = (await res.json()) as { modules?: Partial<SaasEnabledModulesMap> }
        if (cancelled) return
        const out = {} as SaasEnabledModulesMap
        for (const key of SAAS_MODULE_KEYS) {
          out[key] = json.modules?.[key] !== false
        }
        setModules(out)
      })
      .catch(() => {
        if (!cancelled) {
          const allOn = {} as SaasEnabledModulesMap
          for (const key of SAAS_MODULE_KEYS) allOn[key] = true
          setModules(allOn)
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
