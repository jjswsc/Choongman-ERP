import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** pos_promo_extensions.sql 적용 여부(컬럼 존재) — UI 경고용 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  let posPromosExtended = false
  let posMenusPromoId = false

  try {
    await supabaseSelect('pos_promos', { limit: 1, select: 'id,channel_hall' })
    posPromosExtended = true
  } catch {
    posPromosExtended = false
  }

  try {
    await supabaseSelect('pos_menus', { limit: 1, select: 'id,promo_id' })
    posMenusPromoId = true
  } catch {
    posMenusPromoId = false
  }

  return NextResponse.json({ posPromosExtended, posMenusPromoId, ok: posPromosExtended && posMenusPromoId }, { headers })
}
