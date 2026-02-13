import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 업무일지용 - 오피스 직원만 반환 (부서·직원 필터) */
const OFFICE_JOBS = ['director', 'officer', 'ceo', 'hr', 'office', '이사', '임원', '인사', '오피스', '오피스직원']

function isOfficeJob(job: string): boolean {
  const j = String(job || '').toLowerCase().trim()
  if (!j) return false
  return OFFICE_JOBS.some((o) => j.includes(o) || o.includes(j))
}

export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const list = (await supabaseSelect('employees', { order: 'name.asc' })) || []
    const officeOnly = (list as { name?: string; nick?: string; job?: string }[]).filter(
      (e) => isOfficeJob(e.job || '')
    )
    const staff = officeOnly.map((e) => {
      const n = String(e.name || '').trim()
      const nick = String(e.nick || '').trim()
      return { name: n, displayName: nick || n }
    }).filter((e) => e.name)

    const deptSet = new Set<string>()
    for (const e of officeOnly) {
      const job = String((e as { job?: string }).job || '').trim()
      if (job) deptSet.add(job)
    }
    const depts = Array.from(deptSet).sort()

    return NextResponse.json({ staff, depts }, { headers })
  } catch (e) {
    console.error('getWorkLogOfficeOptions:', e)
    return NextResponse.json({ staff: [], depts: [] }, { headers })
  }
}
