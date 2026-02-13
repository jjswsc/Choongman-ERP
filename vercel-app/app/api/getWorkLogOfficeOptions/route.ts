import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 업무일지용 - 오피스 소속 전 부서·전 직원 (store 비어있거나 본사/오피스인 경우 + job 기준) */
const OFFICE_STORES = ['', '본사', '오피스', 'office', 'hq', 'headquarters']
const OFFICE_JOBS = [
  'director', 'officer', 'ceo', 'hr', 'office', 'manager', 'admin', 'marketing', 'accounting',
  '이사', '임원', '인사', '오피스', '매니저', '관리자', '직원', 'staff', 'assistant',
]

function isOfficeStaff(store: string, job: string): boolean {
  const s = String(store || '').toLowerCase().trim()
  const j = String(job || '').toLowerCase().trim()
  const storeOffice = !s || OFFICE_STORES.some((o) => s.includes(o))
  const jobOffice = !j || OFFICE_JOBS.some((o) => j.includes(o) || o.includes(j))
  return storeOffice || jobOffice
}

export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const list = (await supabaseSelect('employees', { order: 'name.asc' })) || []
    const all = list as { name?: string; nick?: string; job?: string; store?: string }[]
    const officeOnly = all.filter((e) => isOfficeStaff(e.store || '', e.job || ''))
    const useList = officeOnly.length > 0 ? officeOnly : all
    const staff = useList.map((e) => {
      const n = String(e.name || '').trim()
      const nick = String(e.nick || '').trim()
      return { name: n, displayName: nick || n }
    }).filter((e) => e.name)

    const deptSet = new Set<string>()
    for (const e of useList) {
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
