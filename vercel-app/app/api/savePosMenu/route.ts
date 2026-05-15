import { NextRequest, NextResponse } from 'next/server'
import { upsertPosMenuFromBody } from '@/lib/pos-menu-upsert-server'
import { triggerGrabMenuNotification } from '@/lib/grab-menu-sync-trigger'

/** POS 메뉴 저장 (등록/수정) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as Parameters<typeof upsertPosMenuFromBody>[0]
    const isNewMenu = !String(body.id || '').trim()
    const isImageOnly = body.imageOnly === true
    const storeCodes =
      Array.isArray(body.storeCodes)
        ? body.storeCodes.map((x) => String(x || '').trim()).filter(Boolean)
        : []
    if (isNewMenu && !isImageOnly && storeCodes.length === 0) {
      return NextResponse.json(
        { success: false, message: '신규 메뉴는 노출 매장을 1개 이상 선택해야 합니다.' },
        { headers }
      )
    }
    const result = await upsertPosMenuFromBody(body, { upsertByCode: false })
    if (result.success) {
      const changed = result.syncHint?.changedFields || []
      const hasMenuImpact =
        changed.length === 0 ||
        changed.includes('insert') ||
        changed.includes('name') ||
        changed.includes('category') ||
        changed.includes('category_main') ||
        changed.includes('price') ||
        changed.includes('price_delivery') ||
        changed.includes('image')
      if (hasMenuImpact) {
        const reason = result.syncHint?.imageChanged ? 'menu_image_changed' : 'menu_updated'
        void triggerGrabMenuNotification({
          reason,
          partnerMerchantID: result.syncHint?.partnerMerchantID ?? null,
        })
      }
    }
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('savePosMenu:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
