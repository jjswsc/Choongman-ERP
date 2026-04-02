import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

/** LINKPOS 결제수단 매핑 규칙 저장(추가/수정) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json()
    const id = Number(body?.id ?? 0)
    const storeCode = String(body?.storeCode ?? '__shared__').trim() || '__shared__'
    const matchKeyword = String(body?.matchKeyword ?? '').trim().toLowerCase().replace(/\s+/g, '')
    const tenderGroup = String(body?.tenderGroup ?? 'card').trim() === 'qr' ? 'qr' : 'card'
    const tenderKey = String(body?.tenderKey ?? '').trim()
    const priorityRaw = Number(body?.priority ?? 100)
    const priority = Number.isFinite(priorityRaw) ? Math.max(1, Math.min(9999, Math.trunc(priorityRaw))) : 100
    const isActive = body?.isActive !== false

    if (!matchKeyword) {
      return NextResponse.json({ success: false, message: 'matchKeyword_required' }, { status: 400, headers })
    }
    if (!tenderKey) {
      return NextResponse.json({ success: false, message: 'tenderKey_required' }, { status: 400, headers })
    }

    const row = {
      store_code: storeCode,
      match_keyword: matchKeyword,
      tender_group: tenderGroup,
      tender_key: tenderKey,
      priority,
      is_active: isActive,
    }

    if (id > 0) {
      const existing = (await supabaseSelectFilter('pos_linkpos_tender_rules', `id=eq.${id}`, {
        limit: 1,
      })) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdate('pos_linkpos_tender_rules', existing[0].id!, row)
        return NextResponse.json({ success: true, id: Number(existing[0].id) }, { headers })
      }
    }

    const inserted = (await supabaseInsert('pos_linkpos_tender_rules', row)) as
      | { id?: number }[]
      | { id?: number }
    const newId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id
    return NextResponse.json({ success: true, id: Number(newId || 0) }, { headers })
  } catch (e) {
    console.error('savePosLinkposTenderRule:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

