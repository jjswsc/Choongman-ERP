import { NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'

/** 평가 항목 추가 */
export async function POST(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const {
      type = 'kitchen',
      mainCat = '',
      subCat = '',
      itemName = '(새 항목)',
    } = body

    const typeVal = type === 'service' ? 'service' : 'kitchen'

    let maxId = 0
    try {
      const rows = (await supabaseSelectFilter(
        'evaluation_items',
        `eval_type=eq.${encodeURIComponent(typeVal)}`,
        { order: 'item_id.desc', limit: 1 }
      )) as { item_id?: number }[] | null
      if (rows && rows.length > 0 && rows[0].item_id != null) {
        maxId = Number(rows[0].item_id) || 0
      }
    } catch {
      //
    }

    await supabaseInsert('evaluation_items', {
      eval_type: typeVal,
      item_id: maxId + 1,
      main_cat: String(mainCat || '').trim(),
      sub_cat: String(subCat || '').trim(),
      name: String(itemName || '(새 항목)').trim(),
      use_flag: true,
      sort_order: maxId + 1,
    })

    return NextResponse.json('SUCCESS', { headers })
  } catch (e) {
    console.error('addEvaluationItem:', e)
    return NextResponse.json(
      { error: String(e) },
      { status: 500, headers }
    )
  }
}
