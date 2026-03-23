import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

export interface PromoMirrorPayload {
  promoId: string
  code: string
  name: string
  categoryMain: string
  categorySub: string
  price: number
  priceDelivery: number | null
  vatIncluded: boolean
  isActive: boolean
}

/** 프로모션과 동일 코드·가격의 미러 메뉴 upsert (promo_id 컬럼 없으면 스킵) */
export async function upsertPromoMirrorMenu(p: PromoMirrorPayload): Promise<{
  ok: boolean
  message?: string
}> {
  const promoIdNum = Number(p.promoId)
  if (!promoIdNum) return { ok: false, message: 'promo id 없음' }

  const baseMenuRow: Record<string, unknown> = {
    code: p.code,
    name: p.name,
    category: p.categorySub || '프로모션',
    category_main: p.categoryMain || '프로모션',
    price: p.price,
    price_delivery: p.priceDelivery,
    image: '',
    vat_included: p.vatIncluded !== false,
    is_active: p.isActive !== false,
    sort_order: 0,
    promo_id: promoIdNum,
  }

  try {
    const linked = (await supabaseSelectFilter(
      'pos_menus',
      `promo_id=eq.${promoIdNum}`,
      { limit: 1, select: 'id,code' }
    )) as { id?: number; code?: string }[] | null

    if (linked && linked.length > 0) {
      const menuId = String(linked[0].id ?? '')
      await supabaseUpdateByFilter('pos_menus', `id=eq.${menuId}`, baseMenuRow)
      return { ok: true }
    }

    const codeRows = (await supabaseSelectFilter(
      'pos_menus',
      `code=eq.${encodeURIComponent(p.code)}`,
      { limit: 2, select: 'id,promo_id' }
    )) as { id?: number; promo_id?: number | null }[] | null
    const conflict = (codeRows || []).find(
      (r) => r.promo_id == null || Number(r.promo_id) !== promoIdNum
    )
    if (conflict) {
      return { ok: false, message: '동일 코드의 일반 메뉴가 이미 있습니다. 프로모션 코드를 바꿔 주세요.' }
    }

    await supabaseInsert('pos_menus', baseMenuRow)
    return { ok: true }
  } catch (e) {
    const msg = String(e)
    if (msg.includes('promo_id') || msg.includes('42703') || msg.includes('column')) {
      console.warn('upsertPromoMirrorMenu: promo_id 컬럼 없음 — SQL 마이그레이션 필요', e)
      return { ok: true }
    }
    return { ok: false, message: msg }
  }
}

export async function deactivateMirrorMenuByPromoId(promoId: string): Promise<void> {
  const n = Number(promoId)
  if (!n) return
  try {
    await supabaseUpdateByFilter('pos_menus', `promo_id=eq.${n}`, { is_active: false })
  } catch {
    /* promo_id 없으면 무시 */
  }
}
