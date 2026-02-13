import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 업무일지 직원 선택용 - name, nick 반환 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const list = (await supabaseSelect('employees', { order: 'name.asc' })) || []
    const staff = (list as { name?: string; nick?: string }[]).map((e) => {
      const n = String(e.name || '').trim()
      const nick = String(e.nick || '').trim()
      return {
        name: n,
        displayName: nick || n,
      }
    }).filter((e) => e.name)

    return NextResponse.json({ staff }, { headers })
  } catch (e) {
    console.error('getWorkLogStaffList:', e)
    return NextResponse.json({ staff: [] }, { headers })
  }
}
