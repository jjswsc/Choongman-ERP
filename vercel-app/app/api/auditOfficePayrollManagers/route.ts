import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isDirectorRole } from '@/lib/permissions'
import { auditOfficePayrollManagers } from '@/lib/office-payroll-manager-audit'

/** Director 전용 — 오피스 급여 담당자 감사(동명이인·퇴사자 플래그 등) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'director')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  if (!isDirectorRole(authResult.auth.role || '')) {
    return NextResponse.json({ success: false, msg: 'Director 권한이 필요합니다.' }, { status: 403, headers })
  }

  try {
    const select =
      'id,employee_code,store,name,role,job,resign_date,employment_status,can_manage_office_payroll,deleted_at'
    let rows: unknown[] = []
    try {
      rows = (await supabaseSelect('employees', { order: 'id.asc', select, limit: 10000 })) as unknown[]
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (/can_manage_office_payroll|42703|column/i.test(em)) {
        return NextResponse.json(
          {
            success: false,
            msg: 'can_manage_office_payroll 컬럼이 없습니다. sql/employees_can_manage_office_payroll.sql 을 실행하세요.',
          },
          { status: 503, headers }
        )
      }
      throw e
    }

    const audit = auditOfficePayrollManagers(rows as Parameters<typeof auditOfficePayrollManagers>[0])
    return NextResponse.json({ success: true, ...audit }, { headers })
  } catch (e) {
    console.error('auditOfficePayrollManagers:', e)
    return NextResponse.json(
      { success: false, msg: e instanceof Error ? e.message : '감사 조회 실패' },
      { status: 500, headers }
    )
  }
}

export async function OPTIONS() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return new NextResponse(null, { status: 204, headers })
}
