import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 은행 적요 키워드 규칙 목록 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const rows = (await supabaseSelect('bank_memo_rules', {
      order: 'trans_type.asc,keyword.asc',
      limit: 500,
    })) as { id?: number; keyword?: string; trans_type?: string; category?: string; account_subject_id?: number }[] | null

    const list = (rows || []).map((r) => ({
      id: r.id,
      keyword: String(r.keyword || '').trim(),
      transType: String(r.trans_type || 'withdraw').toLowerCase(),
      category: String(r.category || '').trim(),
      accountSubjectId: r.account_subject_id ?? null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getBankMemoRules:', e)
    return NextResponse.json([], { headers })
  }
}
