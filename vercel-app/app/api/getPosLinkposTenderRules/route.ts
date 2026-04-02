import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** LINKPOS 결제수단 매핑 규칙 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || '').trim()
  const includeShared = String(searchParams.get('includeShared') || 'true').trim() !== 'false'

  try {
    let filter = 'is_active=in.(true,false)'
    if (storeCode) {
      filter = includeShared
        ? `or(store_code.eq.${encodeURIComponent(storeCode)},store_code.eq.__shared__)`
        : `store_code=eq.${encodeURIComponent(storeCode)}`
    } else if (includeShared) {
      filter = 'store_code=eq.__shared__'
    }

    const rows = (await supabaseSelectFilter('pos_linkpos_tender_rules', filter, {
      order: 'store_code.asc,priority.asc,id.asc',
      limit: 5000,
      select: 'id,store_code,match_keyword,tender_group,tender_key,priority,is_active,created_at',
    })) as {
      id?: number
      store_code?: string
      match_keyword?: string
      tender_group?: string
      tender_key?: string
      priority?: number
      is_active?: boolean
      created_at?: string
    }[] | null

    const list = (rows || []).map((r) => ({
      id: Number(r.id) || 0,
      storeCode: String(r.store_code ?? '__shared__'),
      matchKeyword: String(r.match_keyword ?? ''),
      tenderGroup: String(r.tender_group ?? 'card'),
      tenderKey: String(r.tender_key ?? ''),
      priority: Number(r.priority ?? 100),
      isActive: !!r.is_active,
      createdAt: String(r.created_at ?? ''),
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosLinkposTenderRules:', e)
    return NextResponse.json([], { headers })
  }
}

