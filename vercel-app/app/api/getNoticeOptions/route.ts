import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 공지사항 발송용 매장·부서(job) 목록 - employees 테이블 store/job 열 기준 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const list = (await supabaseSelect('employees', { order: 'id.asc' })) as { store?: string; job?: string; role?: string }[] || []
    const stores: Record<string, boolean> = {}
    const jobs: Record<string, boolean> = {}

    for (let i = 0; i < list.length; i++) {
      const store = String(list[i].store || '').trim()
      const job = String(list[i].job || list[i].role || '').trim()
      if (store && store !== '매장명' && store !== 'Store') stores[store] = true
      if (job && job !== '직급' && job !== 'Job' && job !== '부서' && job !== '') jobs[job] = true
    }

    // 직원에 job 데이터가 없을 경우 기본 부서 옵션
    const DEFAULT_JOBS = ['Manager', '매니저', '직원', 'Staff', 'Service', 'Kitchen']
    if (Object.keys(jobs).length === 0) {
      for (const j of DEFAULT_JOBS) jobs[j] = true
    }

    const JOB_ORDER = ['Assis Manager', 'Assistant Manager', 'Manager', '매니저', '직원', 'Staff', 'Service', 'Kitchen']
    const idxOf = (job: string) => {
      const j = (job || '').toLowerCase()
      return JOB_ORDER.findIndex((x) => {
        const k = (x || '').toLowerCase()
        return j === k || j.startsWith(k) || k.startsWith(j)
      })
    }

    const jobKeys = Object.keys(jobs)
    const jobList = jobKeys.sort((a, b) => {
      const ai = idxOf(a)
      const bi = idxOf(b)
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return (a || '').localeCompare(b || '')
    })

    return NextResponse.json(
      { stores: Object.keys(stores).sort(), roles: jobList },
      { headers }
    )
  } catch (e) {
    console.error('getNoticeOptions:', e)
    return NextResponse.json({ stores: [], roles: [] }, { headers })
  }
}
