import { NextResponse } from 'next/server'
import { loadEmployedEmployeesForWorkLog } from '@/lib/work-log-store-scope'

/** 업무일지 직원 선택용 - name, nick 반환 (퇴사일 지난 직원 제외) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const employed = await loadEmployedEmployeesForWorkLog()
    const staff = employed
      .map((e) => {
        const id = e.id != null && Number.isFinite(Number(e.id)) ? Math.floor(Number(e.id)) : 0
        const n = String(e.name || '').trim()
        const nick = String(e.nick || '').trim()
        return {
          id,
          name: n,
          displayName: nick || n,
        }
      })
      .filter((e) => e.name && e.id > 0)

    return NextResponse.json({ staff }, { headers })
  } catch (e) {
    console.error('getWorkLogStaffList:', e)
    return NextResponse.json({ staff: [] }, { headers })
  }
}
