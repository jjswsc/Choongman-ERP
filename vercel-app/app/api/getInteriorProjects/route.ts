import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 인테리어 프로젝트 목록 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('interior_projects', {
      order: 'code.asc',
      limit: 200,
    })) as { id?: number; code?: string; name?: string; location?: string; status?: string; budget_total?: number; start_date?: string; end_date?: string }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      code: String(r.code || '').trim(),
      name: String(r.name || '').trim(),
      location: String(r.location || '').trim(),
      status: String(r.status || 'active').trim(),
      budgetTotal: Number(r.budget_total) ?? 0,
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorProjects:', e)
    return NextResponse.json([], { headers })
  }
}
