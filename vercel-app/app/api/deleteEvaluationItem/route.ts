import { NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'

/** 평가 항목 삭제 */
export async function POST(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const { type = 'kitchen', itemId } = body

    if (itemId == null || itemId === '') {
      return NextResponse.json(
        { error: '항목 ID가 없습니다.' },
        { status: 400, headers }
      )
    }

    const typeVal = type === 'service' ? 'service' : 'kitchen'

    const rows = (await supabaseSelectFilter(
      'evaluation_items',
      `eval_type=eq.${encodeURIComponent(typeVal)}&item_id=eq.${encodeURIComponent(String(itemId))}`,
      { limit: 1 }
    )) as { id?: number }[] | null

    if (!rows || rows.length === 0 || rows[0].id == null) {
      return NextResponse.json(
        { error: '항목을 찾을 수 없습니다.' },
        { status: 404, headers }
      )
    }

    await supabaseDeleteByFilter(
      'evaluation_items',
      `id=eq.${rows[0].id}`
    )

    return NextResponse.json('SUCCESS', { headers })
  } catch (e) {
    console.error('deleteEvaluationItem:', e)
    return NextResponse.json(
      { error: String(e) },
      { status: 500, headers }
    )
  }
}
