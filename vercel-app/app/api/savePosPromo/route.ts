import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { PROMOTION_MAIN_CATEGORY } from '@/lib/pos-promo-constants'
import { upsertPromoMirrorMenu } from '@/lib/pos-promo-mirror-menu'

function isColumnSchemaError(e: unknown): boolean {
  const s = String(e)
  return (
    s.includes('42703') ||
    s.includes('PGRST204') ||
    s.includes('schema cache') ||
    /Could not find the .* column/i.test(s) ||
    /column .* does not exist/i.test(s)
  )
}

function readInsertedId(inserted: unknown): string | null {
  const created = Array.isArray(inserted) ? inserted[0] : inserted
  const id = (created as { id?: number })?.id
  return id != null ? String(id) : null
}

/** POS 프로모션 저장 + 미러 메뉴 동기화 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as {
      id?: string
      code?: string
      name?: string
      category?: string
      categoryMain?: string
      price?: number
      priceDelivery?: number | null
      vatIncluded?: boolean
      isActive?: boolean
      sortOrder?: number
      marketingCampaignId?: string | null
      channelHall?: boolean
      channelTakeout?: boolean
      channelDelivery?: boolean
      deliveryAppCodes?: string[] | null
      discountPercent?: number | null
      validFrom?: string | null
      validTo?: string | null
    }

    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const editingId = body.id ? String(body.id).trim() : null

    if (!code || !name) {
      return NextResponse.json(
        { success: false, message: '코드와 프로모션명이 필요합니다.' },
        { headers }
      )
    }

    const categorySub = String(body.category ?? '세트').trim() || '세트'
    const categoryMain = String(body.categoryMain ?? PROMOTION_MAIN_CATEGORY).trim() || PROMOTION_MAIN_CATEGORY

    const deliveryCodes =
      Array.isArray(body.deliveryAppCodes) && body.deliveryAppCodes.length > 0
        ? body.deliveryAppCodes.map((c) => String(c).trim()).filter(Boolean)
        : null

    const ext: Record<string, unknown> = {
      category: categorySub,
      price: Number(body.price) ?? 0,
      price_delivery: body.priceDelivery != null ? Number(body.priceDelivery) : null,
      vat_included: body.vatIncluded !== false,
      is_active: body.isActive !== false,
      sort_order: Number(body.sortOrder) ?? 0,
      marketing_campaign_id:
        body.marketingCampaignId && body.marketingCampaignId !== 'null'
          ? Number(body.marketingCampaignId)
          : null,
      category_main: categoryMain,
      channel_hall: body.channelHall !== false,
      channel_takeout: body.channelTakeout !== false,
      channel_delivery: body.channelDelivery !== false,
      delivery_app_codes: deliveryCodes,
      discount_percent:
        body.discountPercent != null && Number.isFinite(body.discountPercent)
          ? Number(body.discountPercent)
          : null,
      valid_from: body.validFrom?.trim() || null,
      valid_to: body.validTo?.trim() || null,
    }

    /** 스키마에 없을 수 있는 컬럼 제외 — 레거시 DB 폴백용 */
    const rowBase: Record<string, unknown> = {
      code,
      name,
      category: categorySub,
      price: ext.price,
      price_delivery: ext.price_delivery,
      vat_included: ext.vat_included,
      is_active: ext.is_active,
      sort_order: ext.sort_order,
    }

    const rowWithCampaign: Record<string, unknown> = {
      ...rowBase,
      marketing_campaign_id: ext.marketing_campaign_id,
    }

    const fullPatch: Record<string, unknown> = { ...rowWithCampaign, ...ext }

    async function applyPromoRow(targetId: string): Promise<void> {
      const attempts: Record<string, unknown>[] = [fullPatch, rowWithCampaign, rowBase]
      let lastErr: unknown
      for (const patch of attempts) {
        try {
          await supabaseUpdateByFilter('pos_promos', `id=eq.${targetId}`, patch)
          return
        } catch (e) {
          lastErr = e
          if (!isColumnSchemaError(e)) throw e
        }
      }
      throw lastErr
    }

    async function insertPromoRow(): Promise<string | null> {
      const attempts: Record<string, unknown>[] = [fullPatch, rowWithCampaign, rowBase]
      let lastErr: unknown
      for (const row of attempts) {
        try {
          const inserted = await supabaseInsert('pos_promos', row)
          const id = readInsertedId(inserted)
          if (id) return id
        } catch (e) {
          lastErr = e
          if (!isColumnSchemaError(e)) throw e
        }
      }
      throw lastErr
    }

    let promoId: string | null = editingId || null

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'pos_promos',
        `id=eq.${editingId}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing && existing.length > 0) {
        await applyPromoRow(editingId)
      } else {
        return NextResponse.json(
          { success: false, message: '수정할 프로모션을 찾을 수 없습니다.' },
          { headers }
        )
      }
    } else {
      const codeExists = (await supabaseSelectFilter(
        'pos_promos',
        `code=eq.${encodeURIComponent(code)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (codeExists && codeExists.length > 0) {
        return NextResponse.json(
          { success: false, message: '이미 존재하는 프로모션 코드입니다.' },
          { headers }
        )
      }
      promoId = await insertPromoRow()
      if (!promoId) {
        return NextResponse.json({ success: false, message: '저장 후 ID를 확인할 수 없습니다.' }, { headers })
      }
    }

    const mirror = await upsertPromoMirrorMenu({
      promoId: promoId!,
      code,
      name,
      categoryMain,
      categorySub,
      price: Number(ext.price) || 0,
      priceDelivery: ext.price_delivery != null ? Number(ext.price_delivery) : null,
      vatIncluded: ext.vat_included !== false,
      isActive: ext.is_active !== false,
    })
    if (!mirror.ok) {
      return NextResponse.json(
        { success: false, message: mirror.message || '미러 메뉴 동기화 실패' },
        { headers }
      )
    }

    return NextResponse.json({
      success: true,
      message: editingId ? '수정되었습니다.' : '저장되었습니다.',
      id: promoId,
    }, { headers })
  } catch (e) {
    console.error('savePosPromo:', e)
    const raw = e instanceof Error ? e.message : String(e)
    let message = raw
    if (
      raw.includes('42501') ||
      (raw.includes('PGRST') && raw.includes('row-level security')) ||
      /row-level security policy/i.test(raw)
    ) {
      const menusHint = /pos_menus/i.test(raw)
        ? ' 그리고 pos_menus용으로 sql/pos_menus_rls_policies.sql 도 실행하세요.'
        : ''
      message =
        'Supabase RLS로 저장이 거부되었습니다. Vercel에 SUPABASE_SERVICE_ROLE_KEY를 넣거나(권장), Supabase에서 sql/pos_promos_rls_policies.sql 을 실행하세요.' +
        menusHint
    }
    return NextResponse.json({ success: false, message }, { headers })
  }
}
