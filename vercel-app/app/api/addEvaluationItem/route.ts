import { NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'
import { normalizeEvalItemType } from '@/lib/eval-item-type'

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

    const typeVal = normalizeEvalItemType(type)

    let maxId = 0
    let maxSort = 0
    try {
      const idRows = (await supabaseSelectFilter(
        'evaluation_items',
        `eval_type=eq.${encodeURIComponent(typeVal)}`,
        { order: 'item_id.desc', limit: 1 }
      )) as { item_id?: number }[] | null
      if (idRows && idRows.length > 0 && idRows[0].item_id != null) {
        maxId = Number(idRows[0].item_id) || 0
      }
    } catch {
      //
    }
    try {
      const sortRows = (await supabaseSelectFilter(
        'evaluation_items',
        `eval_type=eq.${encodeURIComponent(typeVal)}`,
        { order: 'sort_order.desc', limit: 1 }
      )) as { sort_order?: number }[] | null
      if (sortRows && sortRows.length > 0 && sortRows[0].sort_order != null) {
        maxSort = Number(sortRows[0].sort_order) || 0
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
      sort_order: maxSort + 1,
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
