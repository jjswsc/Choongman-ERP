import { NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'

/** 평가 항목 일괄 수정 (name, use_flag) */
export async function POST(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const { type = 'kitchen', updates = [] } = body

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: '업데이트할 항목이 없습니다.' },
        { status: 400, headers }
      )
    }

    const typeVal = type === 'service' ? 'service' : 'kitchen'

    for (const up of updates) {
      const id = up.id != null ? String(up.id) : ''
      if (!id) continue
      const name = String(up.name ?? '').trim()
      const use =
        up.use === true ||
        up.use === 1 ||
        up.use === '1' ||
        String(up.use).toLowerCase() === 'y'

      const filter = `eval_type=eq.${encodeURIComponent(typeVal)}&item_id=eq.${encodeURIComponent(id)}`
      await supabaseUpdateByFilter('evaluation_items', filter, {
        name,
        use_flag: use,
      })
    }

    return NextResponse.json('SUCCESS', { headers })
  } catch (e) {
    console.error('updateEvaluationItems:', e)
    return NextResponse.json(
      { error: String(e) },
      { status: 500, headers }
    )
  }
}
