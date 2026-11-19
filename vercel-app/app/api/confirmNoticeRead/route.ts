import { NextRequest, NextResponse } from 'next/server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import { persistNoticeRead } from '@/lib/notice-read-persist'
import { isNoticeConfirmAction } from '@/lib/notice-confirm-action'
import {
  assertSaasTenantWritable,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'

/** 공지 수신 확인 - notice_reads upsert (확인/다음에 보기) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  try {
    const body = await request.json()
    const noticeId = Number(body?.noticeId ?? body?.notice_id)
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()
    const actionRaw = String(body?.action || '확인').trim() || '확인'
    const isConfirm = isNoticeConfirmAction(actionRaw)

    if (isNaN(noticeId) || noticeId <= 0 || !store || !name) {
      return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400, headers })
    }

    const auth = await tryVerifyBearerFromRequest(request)
    // JWT에 매장·이름이 있으면 클라이언트가 보낸 값보다 우선(위조·구버전 캐시 방지)
    const storeFinal = String(auth?.store || store).trim() || store
    const nameFinal = String(auth?.name || name).trim() || name

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

    // 확인: 수신 확인 처리 (notice_reads에 기록 → 관리자 수신현황에 반영)
    // 다음에 보기: DB 기록 없이 닫기만 (미확인 유지, 나중에 다시 표시)
    if (isConfirm) {
      await persistNoticeRead({
        noticeId,
        store: storeFinal,
        name: nameFinal,
        tenantScope,
      })
    }

    return NextResponse.json(
      {
        success: true,
        message: isConfirm ? '수신 확인되었습니다.' : '나중에 다시 확인해 주세요.',
        noticeId,
        store: storeFinal,
        name: nameFinal,
      },
      { headers }
    )
  } catch (e) {
    console.error('confirmNoticeRead:', e)
    return NextResponse.json({ success: false, message: '처리 실패' }, { status: 500, headers })
  }
}
