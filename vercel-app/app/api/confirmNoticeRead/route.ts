import { NextRequest, NextResponse } from 'next/server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import { persistNoticeRead } from '@/lib/notice-read-persist'
import { isNoticeConfirmAction } from '@/lib/notice-confirm-action'
import { normalizeNoticePersonName } from '@/lib/notice-person-key'
import {
  assertSaasTenantWritable,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

function corsHeaders() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return headers
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

/** 공지 수신 확인 - notice_reads upsert (확인/다음에 보기) */
export async function POST(request: NextRequest) {
  const headers = corsHeaders()

  try {
    const body = await request.json()
    const noticeId = Number(body?.noticeId ?? body?.notice_id)
    const store = String(body?.store || '').trim()
    const name = normalizeNoticePersonName(String(body?.name || ''))
    const actionRaw = String(body?.action || '확인').trim() || '확인'
    const isConfirm = isNoticeConfirmAction(actionRaw)

    if (isNaN(noticeId) || noticeId <= 0 || !store || !name) {
      return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400, headers })
    }

    const auth = await tryVerifyBearerFromRequest(request)
    // JWT에 매장·이름이 있으면 클라이언트가 보낸 값보다 우선(위조·구버전 캐시 방지)
    const storeFinal = String(auth?.store || store).trim() || store
    const nameFinal = normalizeNoticePersonName(String(auth?.name || name)) || name

    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: storeFinal,
    })
    const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
      tableHint: 'notice_reads',
      label: '공지 확인',
    })
    if (tenantWriteErr) {
      return NextResponse.json({ success: false, message: tenantWriteErr }, { status: 403, headers })
    }

    if (isConfirm) {
      const saved = await persistNoticeRead({
        noticeId,
        store: storeFinal,
        name: nameFinal,
        tenantScope,
      })
      return NextResponse.json(
        {
          success: true,
          verified: saved.verified,
          message: '수신 확인되었습니다.',
          noticeId,
          store: storeFinal,
          name: saved.name || nameFinal,
        },
        { headers }
      )
    }

    return NextResponse.json(
      {
        success: true,
        verified: false,
        message: '나중에 다시 확인해 주세요.',
        noticeId,
        store: storeFinal,
        name: nameFinal,
      },
      { headers }
    )
  } catch (e) {
    console.error('confirmNoticeRead:', e)
    return NextResponse.json(
      {
        success: false,
        verified: false,
        message: '처리 실패. 네트워크 확인 후 다시 눌러 주세요.',
      },
      { status: 500, headers }
    )
  }
}
