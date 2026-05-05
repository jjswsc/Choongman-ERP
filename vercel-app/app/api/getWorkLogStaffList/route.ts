import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { isEmployedAsOf } from '@/lib/employee-headcount-utils'

/** 업무일지 직원 선택용 - name, nick 반환 (퇴사일 지난 직원 제외) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const todayBkk = getBangkokTodayDateString()
    const list =
      (await supabaseSelect('employees', {
        order: 'name.asc',
        select: 'id,name,nick,join_date,resign_date',
        limit: 2000,
      })) || []
    const staff = (list as {
      id?: number
      name?: string
      nick?: string
      join_date?: unknown
      resign_date?: unknown
    }[])
      .filter((e) =>
        isEmployedAsOf(
          e.join_date != null ? String(e.join_date) : '',
          e.resign_date != null ? String(e.resign_date) : '',
          todayBkk
        )
      )
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
