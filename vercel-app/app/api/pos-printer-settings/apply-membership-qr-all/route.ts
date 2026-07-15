import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { canAccessPosPrinters, hasOfficeStaffScope } from '@/lib/permissions'
import { supabaseUpdateByFilter, supabaseUpsertMerge } from '@/lib/supabase-server'
import {
  POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK,
  POS_MEMBERSHIP_POINTS_MANUAL_QR_TEXT_DEFAULT,
  normalizeMembershipQrImageUrlForStorage,
  normalizeMembershipQrLinkUrlForStorage,
} from '@/lib/pos-membership-qr-defaults'

/**
 * 본사: 손님 영수증 멤버십 QR을 전 매장 pos_printer_settings에 일괄 반영.
 * POST body: { storeCodes?: string[], linkUrl?, text?, show?, imageUrl? }
 */
export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const auth = authRes.auth!
  if (!canAccessPosPrinters(auth.role, auth.store) || !hasOfficeStaffScope(auth.role, auth.store)) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      storeCodes?: string[]
      linkUrl?: string
      text?: string
      show?: boolean
      imageUrl?: string
    }

    const linkUrl = normalizeMembershipQrLinkUrlForStorage(
      body.linkUrl ?? POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK
    )
    const text = String(body.text ?? POS_MEMBERSHIP_POINTS_MANUAL_QR_TEXT_DEFAULT).trim()
    const show = body.show !== false
    const imageUrl = normalizeMembershipQrImageUrlForStorage(body.imageUrl)

    if (!linkUrl && !imageUrl) {
      return NextResponse.json(
        { success: false, message: 'QR 링크 또는 이미지가 필요합니다.' },
        { status: 400, headers }
      )
    }

    const patch = {
      receipt_membership_qr_link_url: linkUrl,
      receipt_membership_qr_image_url: imageUrl,
      receipt_membership_qr_text: text,
      receipt_show_membership_qr: show,
      updated_at: new Date().toISOString(),
    }

    // 기존 설정 행 전부 갱신
    await supabaseUpdateByFilter('pos_printer_settings', 'store_code=not.is.null', patch)

    const codes = Array.from(
      new Set(
        (Array.isArray(body.storeCodes) ? body.storeCodes : [])
          .map((c) => String(c || '').trim())
          .filter(Boolean)
      )
    )

    // 매장 목록에 있으나 설정 행이 없는 경우 upsert로 생성·보강
    let upserted = 0
    for (const storeCode of codes) {
      await supabaseUpsertMerge('pos_printer_settings', 'store_code', {
        store_code: storeCode,
        ...patch,
      })
      upserted += 1
    }

    return NextResponse.json(
      {
        success: true,
        updatedExisting: true,
        upsertedStores: upserted,
        linkUrl,
        imageUrl,
        text,
        show,
      },
      { headers }
    )
  } catch (e) {
    console.error('POST apply-membership-qr-all:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '일괄 적용 실패' },
      { status: 500, headers }
    )
  }
}
