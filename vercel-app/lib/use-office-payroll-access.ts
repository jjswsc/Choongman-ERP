'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiFetch } from '@/lib/api-client'

/** DB에 오피스 급여 담당 플래그가 있는데 JWT·세션에 없을 때 보강 */
export function useSyncOfficePayrollAccess() {
  const { auth, setAuth } = useAuth()

  useEffect(() => {
    if (!auth?.store || auth.canManageOfficePayroll) return
    let cancelled = false
    void apiFetch('/api/getOfficePayrollAccess')
      .then((r) => r.json())
      .then((d: { canManageOfficePayroll?: boolean }) => {
        if (cancelled || !d?.canManageOfficePayroll || !auth) return
        setAuth({ ...auth, canManageOfficePayroll: true })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [auth, setAuth])
}
