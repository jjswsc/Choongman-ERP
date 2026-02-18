import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** POS 쿠폰 목록 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const rows = (await supabaseSelect('pos_coupons', {
      order: 'code',
      limit: 500,
    })) as {
      id?: number
      code?: string
      name?: string
      discount_type?: string
      discount_value?: number
      valid_from?: string | null
      valid_to?: string | null
      is_active?: boolean
    }[]
    const list = (rows || []).map((r) => ({
      id: r.id,
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      discountType: r.discount_type === 'percent' ? 'percent' : 'fixed',
      discountValue: Number(r.discount_value ?? 0),
      validFrom: r.valid_from || null,
      validTo: r.valid_to || null,
      isActive: Boolean(r.is_active ?? true),
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosCoupons:', e)
    return NextResponse.json([], { headers })
  }
}
