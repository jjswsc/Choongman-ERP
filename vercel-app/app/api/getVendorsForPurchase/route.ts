import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 본사 발주용 거래처 목록: 매입/둘다/본사 (매장→본사 전환 시 본사 거래처 포함) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('vendors', { order: 'id.asc', limit: 5000 })) as {
      code?: string
      name?: string
      type?: string
      addr?: string
    }[] | null

    const list = (rows || [])
      .filter((row) => row?.code)
      .filter((row) => {
        const t = String(row.type || '').toLowerCase().trim()
        if (t === '매출' || t === 'sales' || t === '매출처') return false
        return true
      })
      .map((row) => ({
        code: String(row.code),
        name: String(row.name || '').trim(),
        address: String(row.addr || ''),
      }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getVendorsForPurchase:', e)
    return NextResponse.json([], { headers })
  }
}
