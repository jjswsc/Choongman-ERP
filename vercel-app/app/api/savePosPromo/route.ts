import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { PROMOTION_MAIN_CATEGORY, normalizePromotionSubcategory } from '@/lib/pos-promo-constants'
import { upsertPromoMirrorMenu } from '@/lib/pos-promo-mirror-menu'
import {
  allocateNextPromoCodeForCampaign,
  allocateNextStandaloneSetPromoCode,
} from '@/lib/marketing-promo-code'
import {
  fetchCampaignMetaForExpenseMemo,
  syncMarketingExpenseAccrual,
} from '@/lib/marketing-expense-accrual-sync'
import { triggerGrabMenuNotification } from '@/lib/grab-menu-sync-trigger'
import { requireAuth } from '@/lib/verify-auth'

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
    const authResult = await requireAuth(req, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
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
      marketingActualCost?: number | null
      /** true: 캠페인 없이 메뉴 관리 세트만 저장 시 자동 코드(SET-1 …) */
      standaloneSetMenu?: boolean
      userName?: string
      user_name?: string
      /** 세트 구성 Step 1 가격 기준: hall | delivery */
      composePricingBasis?: string
      compose_pricing_basis?: string
    }

    let code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const editingId = body.id ? String(body.id).trim() : null
    const campaignIdRaw = String(body.marketingCampaignId ?? '').trim()

    if (!name) {
      return NextResponse.json(
        { success: false, message: '프로모션명이 필요합니다.' },
        { headers }
      )
    }
    const standaloneSet = body.standaloneSetMenu === true

    if (!editingId && !campaignIdRaw && !standaloneSet) {
      return NextResponse.json(
        { success: false, message: '캠페인 선택은 필수입니다. 캠페인 허브에서 연동 후 저장해 주세요.' },
        { headers }
      )
    }

    if (!editingId && !campaignIdRaw && standaloneSet && !code) {
      try {
        code = await allocateNextStandaloneSetPromoCode()
      } catch (e) {
        return NextResponse.json(
          { success: false, message: e instanceof Error ? e.message : '세트 전용 코드 자동 부여 실패' },
          { headers }
        )
      }
    }

    if (!editingId && campaignIdRaw) {
      const cid = Number(campaignIdRaw)
      if (Number.isFinite(cid) && cid > 0) {
        if (!code) {
          try {
            code = await allocateNextPromoCodeForCampaign(cid)
          } catch (e) {
            return NextResponse.json(
              { success: false, message: e instanceof Error ? e.message : '프로모션 코드 자동 부여 실패' },
              { headers }
            )
          }
        }
      }
    }

    if (!code) {
      return NextResponse.json(
        { success: false, message: '프로모션 코드가 필요합니다. 캠페인을 선택한 뒤 다시 저장해 주세요.' },
        { headers }
      )
    }

    const categorySub = normalizePromotionSubcategory(String(body.category ?? 'Set').trim() || 'Set')
    const categoryMain = String(body.categoryMain ?? PROMOTION_MAIN_CATEGORY).trim() || PROMOTION_MAIN_CATEGORY
    const userRole = String(auth.role || '')
    const userName = String(auth.name || (body.userName ?? body.user_name ?? '')).trim()
    const marketingActualCost =
      body.marketingActualCost != null && Number.isFinite(Number(body.marketingActualCost))
        ? Math.abs(Number(body.marketingActualCost))
        : 0

    const deliveryCodes =
      Array.isArray(body.deliveryAppCodes) && body.deliveryAppCodes.length > 0
        ? body.deliveryAppCodes.map((c) => String(c).trim()).filter(Boolean)
        : null

    const hasComposeBasis =
      body.composePricingBasis !== undefined || body.compose_pricing_basis !== undefined
    const composeBasisRaw = String(body.composePricingBasis ?? body.compose_pricing_basis ?? '')
      .toLowerCase()
      .trim()
    const compose_pricing_basis = composeBasisRaw === 'delivery' ? 'delivery' : 'hall'

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

    if (hasComposeBasis) {
      ext.compose_pricing_basis = compose_pricing_basis
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
    let priorAccrualId: number | null = null
    if (editingId) {
      try {
        const prev = (await supabaseSelectFilter(
          'pos_promos',
          `id=eq.${editingId}`,
          { limit: 1, select: 'expense_accrual_id' }
        )) as { expense_accrual_id?: number | null }[] | null
        const pid = prev?.[0]?.expense_accrual_id
        priorAccrualId = pid != null && Number(pid) > 0 ? Number(pid) : null
      } catch {
        priorAccrualId = null
      }
    }

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
        const rows = (await supabaseSelectFilter(
          'pos_promos',
          `code=eq.${encodeURIComponent(code)}`,
          { limit: 1, select: 'id' }
        )) as { id?: number }[] | null
        const rid = rows?.[0]?.id
        if (rid != null) promoId = String(rid)
      }
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

    const channelDelivery = body.channelDelivery !== false
    if (channelDelivery && ext.is_active !== false) {
      void triggerGrabMenuNotification({ reason: 'save_pos_promo' })
    }

    const campaignIdForExpense = campaignIdRaw || String(body.marketingCampaignId ?? '').trim()
    let expenseSyncMessage: string | undefined
    if (campaignIdForExpense && promoId) {
      const camp = await fetchCampaignMetaForExpenseMemo(campaignIdForExpense)
      const topic = camp?.topic || ''
      const campaignNo = camp?.campaignNo || ''
      const expenseDate = body.validFrom?.trim() ? String(body.validFrom).slice(0, 10) : ''
      const sync = await syncMarketingExpenseAccrual({
        userRole,
        userName,
        campaignId: campaignIdForExpense,
        campaignTopic: topic,
        campaignNo,
        channel: 'promo',
        recordId: promoId,
        amount: marketingActualCost,
        expenseDate,
        dueDate: null,
        detailLine: `${code} ${name}`.trim().slice(0, 120),
        existingExpenseAccrualId: priorAccrualId,
      })
      expenseSyncMessage = sync.message
      if (sync.linkExpenseAccrualId !== undefined) {
        try {
          await supabaseUpdateByFilter('pos_promos', `id=eq.${promoId}`, {
            expense_accrual_id: sync.linkExpenseAccrualId,
          })
        } catch (e) {
          if (!isColumnSchemaError(e)) throw e
          expenseSyncMessage =
            (expenseSyncMessage ? expenseSyncMessage + ' ' : '') +
            'DB에 marketing_actual_cost/expense_accrual_id 컬럼이 없습니다. sql/marketing_expense_accrual_link.sql 을 실행하세요.'
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: editingId ? '수정되었습니다.' : '저장되었습니다.',
      id: promoId,
      expenseSyncMessage,
    }, { headers })
  } catch (e) {
    console.error('savePosPromo:', e)
    const raw = e instanceof Error ? e.message : String(e)
    let message = raw
    if (
      raw.includes('23505') ||
      raw.includes('idx_pos_promos_code') ||
      /duplicate key value violates unique constraint/i.test(raw)
    ) {
      message =
        '이미 사용 중인 프로모션 코드입니다. 코드를 바꾸거나 페이지에서 자동 채번을 다시 적용해 주세요. RLS로 pos_promos 목록 조회가 막혀 있으면 중복인데도 통과한 뒤 저장 시 이 오류가 날 수 있으니, SUPABASE_SERVICE_ROLE_KEY 또는 pos_promos SELECT 정책을 확인하세요.'
    } else if (
      raw.includes('42501') ||
      (raw.includes('PGRST') && raw.includes('row-level security')) ||
      /row-level security policy/i.test(raw)
    ) {
      const menusHint = /pos_menus/i.test(raw)
        ? ' 그리고 pos_menus용으로 vercel-app/sql/pos_menus_rls_policies.sql 도 실행하세요.'
        : ''
      message =
        'Supabase RLS로 저장이 거부되었습니다. Vercel에 SUPABASE_SERVICE_ROLE_KEY를 넣거나(권장), Supabase에서 vercel-app/sql/pos_promos_rls_policies.sql 을 실행하세요.' +
        menusHint
    }
    return NextResponse.json({ success: false, message }, { headers })
  }
}
