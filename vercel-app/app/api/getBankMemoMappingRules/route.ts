import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 은행 적요 키워드 매핑 규칙 목록 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('bank_memo_mapping_rules', { order: 'id.asc', limit: 5000 })) as {
      id?: number
      keyword?: string
      trans_type?: string
      category?: string
      account_subject_id?: number | null
      created_at?: string
    }[] | null

    const list = (rows || []).map((r) => ({
      id: r.id,
      keyword: String(r.keyword || '').trim(),
      transType: String(r.trans_type || '').toLowerCase(),
      category: String(r.category || '').trim(),
      accountSubjectId: r.account_subject_id ?? null,
      createdAt: r.created_at ? String(r.created_at).slice(0, 19) : undefined,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getBankMemoMappingRules:', e)
    return NextResponse.json([], { headers })
  }
}
