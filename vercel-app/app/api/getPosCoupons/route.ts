import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 쿠폰 목록 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('pos_coupons', {
      order: 'code.asc',
      limit: 500,
      select: 'id,code,name,discount_type,discount_value,start_date,end_date,max_uses,used_count,is_active',
    })) as {
      id?: number
      code?: string
      name?: string
      discount_type?: string
      discount_value?: number
      start_date?: string | null
      end_date?: string | null
      max_uses?: number | null
      used_count?: number
      is_active?: boolean
    }[] | null

    const list = (rows || []).map((r) => ({
      id: r.id,
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      discountType: r.discount_type || 'amount',
      discountValue: Number(r.discount_value) ?? 0,
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
      maxUses: r.max_uses ?? null,
      usedCount: r.used_count ?? 0,
      isActive: r.is_active !== false,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosCoupons:', e)
    return NextResponse.json([], { headers })
  }
}
