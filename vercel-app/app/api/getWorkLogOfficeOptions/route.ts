import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 업무일지용 - 오피스 소속 부서·직원만 (store 비었거나 본사/오피스인 경우, 매장명 있으면 제외) */
const OFFICE_STORE_PATTERNS = ['본사', '오피스', 'office', 'hq', 'headquarters', '본점']

function isOfficeStaff(store: string): boolean {
  const s = String(store || '').trim().toLowerCase()
  if (!s || s === '-' || s === 'null') return true
  return OFFICE_STORE_PATTERNS.some((o) => s.includes(o.toLowerCase()))
}

export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const list = (await supabaseSelect('employees', { order: 'name.asc' })) || []
    const all = list as { name?: string; nick?: string; job?: string; store?: string }[]
    const officeOnly = all.filter((e) => isOfficeStaff(e.store || ''))
    const useList = officeOnly
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
