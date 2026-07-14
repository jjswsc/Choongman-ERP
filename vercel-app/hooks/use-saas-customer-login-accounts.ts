"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/api/fetch"
import {
  buildCustomerAdminLoginHref,
  pickSaasCustomerLoginAccounts,
  type SaasCustomerLoginAccount,
} from "@/lib/saas-customer-login-info"

type EmployeeApiRow = {
  id?: number
  company?: string
  store?: string
  name?: string
  role?: string
  resignDate?: string
}

export function useSaasCustomerLoginAccounts(tenantId: string | undefined, companyName: string) {
  const [accounts, setAccounts] = useState<SaasCustomerLoginAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")

  const reload = useCallback(async () => {
    const id = String(tenantId || "").trim()
    if (!id) {
      setAccounts([])
      setLoadError("")
      return
    }
    setLoading(true)
    setLoadError("")
    try {
      const params = new URLSearchParams()
      params.set("tenantId", id)
      params.set("limit", "200")
      const res = await apiFetch(`/api/saasAdminEmployees?${params.toString()}`)
      const json = (await res.json()) as { success?: boolean; message?: string; rows?: EmployeeApiRow[] }
      if (!res.ok || json.success !== true || !Array.isArray(json.rows)) {
        throw new Error(json.message || "load failed")
      }
      setAccounts(pickSaasCustomerLoginAccounts(json.rows, companyName))
    } catch (e) {
      setAccounts([])
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [companyName, tenantId])

  useEffect(() => {
    void reload()
  }, [reload])

  const primary = accounts[0] ?? null
  const loginHref = useMemo(() => {
    if (primary) {
      return buildCustomerAdminLoginHref({
        company: primary.company || companyName,
        store: primary.store,
        name: primary.name,
      })
    }
    return buildCustomerAdminLoginHref({ company: companyName })
  }, [companyName, primary])

  return { accounts, loading, loadError, primary, loginHref, reload }
}
