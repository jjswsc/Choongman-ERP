import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

const OFFICE_STORES = ['본사', 'Office', '오피스', '본점']

function isOfficeStore(s: string): boolean {
  const x = String(s || '').trim()
  return OFFICE_STORES.some((o) => x === o || x.toLowerCase().includes('office'))
}

/** 패티캐쉬 등록/조회용 옵션: 매장 목록 + 본사 부서 목록 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const empList = (await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,job',
    })) as { store?: string; job?: string }[] | null

    const storeSet = new Set<string>()
    const officeDeptSet = new Set<string>()
    for (const r of empList || []) {
      const store = String(r.store || '').trim()
      const job = String(r.job || '').trim()
      if (store) {
        if (!isOfficeStore(store)) {
          storeSet.add(store)
        } else if (job) {
          officeDeptSet.add(job)
        }
      }
    }

    const pettyRows = (await supabaseSelect('petty_cash_transactions', {
      select: 'store',
      limit: 1000,
    })) as { store?: string }[] | null

    for (const r of pettyRows || []) {
      const store = String(r.store || '').trim()
      if (store.startsWith('Office-')) {
        const dept = store.slice(7).trim()
        if (dept) officeDeptSet.add(dept)
      } else if (store && !isOfficeStore(store)) {
        storeSet.add(store)
      }
    }

    const stores = Array.from(storeSet).sort()
    let officeDepartments = Array.from(officeDeptSet).sort()
    if (officeDepartments.length === 0) officeDepartments = ['일반']

    return NextResponse.json({ stores, officeDepartments }, { headers })
  } catch (e) {
    console.error('getPettyCashOptions:', e)
    return NextResponse.json({ stores: [], officeDepartments: ['일반'] }, { headers })
  }
}
