import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import {
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'

/** 공지 수신 확인 - notice_reads upsert (확인/다음에 보기) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const noticeId = Number(body?.noticeId ?? body?.notice_id)
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()
    const action = String(body?.action || '확인').trim() || '확인'

    if (isNaN(noticeId) || noticeId <= 0 || !store || !name) {
      return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400, headers })
    }

    const auth = await tryVerifyBearerFromRequest(request)
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode: store,
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
    if (action === '확인') {
      const readRow = stampSaasTenantId(
        {
          notice_id: noticeId,
          store,
          name,
          read_at: new Date().toISOString(),
          status: '확인',
        },
        tenantScope,
        'notice_reads'
      )
      try {
        await supabaseUpsert('notice_reads', [readRow], 'notice_id,store,name')
      } catch (e) {
        if (isMissingSaasTenantColumnError(e) && 'tenant_id' in readRow) {
          markSaasTenantColumnMissing('notice_reads')
          const { tenant_id: _t, ...withoutTenant } = readRow
          await supabaseUpsert('notice_reads', [withoutTenant], 'notice_id,store,name')
        } else {
          throw e
        }
      }
    }

    return NextResponse.json(
      { success: true, message: action === '확인' ? '수신 확인되었습니다.' : '나중에 다시 확인해 주세요.' },
      { headers }
    )
  } catch (e) {
    console.error('confirmNoticeRead:', e)
    return NextResponse.json({ success: false, message: '처리 실패' }, { status: 500, headers })
  }
}
