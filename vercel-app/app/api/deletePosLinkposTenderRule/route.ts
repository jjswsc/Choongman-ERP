import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

/** LINKPOS 결제수단 매핑 규칙 삭제 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { id?: number | string }
    const id = Number(body?.id ?? 0)
    if (!(id > 0)) {
      return NextResponse.json({ success: false, message: 'id_required' }, { status: 400, headers })
    }
    const existing = (await supabaseSelectFilter('pos_linkpos_tender_rules', `id=eq.${id}`, {
      limit: 1,
      select: 'id',
    })) as { id?: number }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: 'not_found' }, { status: 404, headers })
    }
    await supabaseDeleteByFilter('pos_linkpos_tender_rules', `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deletePosLinkposTenderRule:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

