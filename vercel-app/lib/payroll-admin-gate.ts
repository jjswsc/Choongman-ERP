import { NextResponse } from 'next/server'
import { canAccessAdminPayroll, type PayrollAccessOpts } from '@/lib/permissions'
import { getAppBrandConfigFromEnv } from '@/lib/app-brand'

export type PayrollGateAuth = {
  role?: string | null
  canViewStorePayroll?: boolean | null
}

/** 관리자 급여 API — 비권한 403 (Omni 점주·허용 매니저 포함) */
export function forbidUnlessAdminPayroll(
  authOrRole: string | PayrollGateAuth | undefined | null,
  headers?: Headers
): NextResponse | null {
  const role =
    typeof authOrRole === 'string' || authOrRole == null
      ? String(authOrRole || '')
      : String(authOrRole.role || '')
  const opts: PayrollAccessOpts =
    typeof authOrRole === 'object' && authOrRole != null
      ? { canViewStorePayroll: authOrRole.canViewStorePayroll === true }
      : {}
  const brandKey = getAppBrandConfigFromEnv().key
  if (canAccessAdminPayroll(role, brandKey, opts)) return null
  return NextResponse.json(
    {
      success: false,
      msg: '급여 관리는 본사·회계·슈퍼바이저만 가능합니다.',
      message: '급여 관리는 본사·회계·슈퍼바이저만 가능합니다.',
    },
    { status: 403, headers }
  )
}
