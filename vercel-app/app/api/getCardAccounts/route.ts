import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 카드 계정 목록 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const rows = (await supabaseSelect('card_accounts', {
      order: 'name.asc',
      limit: 1000,
    })) as { id?: number; name?: string; store?: string; memo?: string; card_number?: string; holder_name?: string; card_company?: string }[]
    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      store: (r.store || '').toString().trim() || null,
      memo: (r.memo || '').toString().trim() || null,
      cardNumber: (r.card_number || '').toString().trim() || null,
      holderName: (r.holder_name || '').toString().trim() || null,
      cardCompany: (r.card_company || '').toString().trim() || null,
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getCardAccounts:', e)
    return NextResponse.json([], { headers })
  }
}
