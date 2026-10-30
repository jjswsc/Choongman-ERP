import { NextResponse } from 'next/server'
import { canAccessAdminPayroll } from '@/lib/permissions'

/** 관리자 급여 API — Manager/Franchisee 등 비권한 403 */
export function forbidUnlessAdminPayroll(
  role: string | undefined | null,
  headers?: Headers
): NextResponse | null {
  if (canAccessAdminPayroll(String(role || ''))) return null
  return NextResponse.json(
    {
      success: false,
      msg: '급여 관리는 본사·회계·슈퍼바이저만 가능합니다.',
      message: '급여 관리는 본사·회계·슈퍼바이저만 가능합니다.',
    },
    { status: 403, headers }
  )
}
