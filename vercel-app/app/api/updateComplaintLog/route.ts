import { NextRequest, NextResponse } from 'next/server'
import { extractAnyMissingColumn, supabaseUpdateByFilterWithPgrst204Fallback } from '@/lib/supabase-pgrst204-retry'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { normalizeTenantId } from '@/lib/tenant-context'
import { assertAuthTenantMatchesStore } from '@/lib/saas-tenant-scope'

/** 컴플레인 일지 수정 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rowOrId = String(body.rowOrId ?? body.id ?? '').trim()
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body)

    const authRes = await requireAuth(request, 'manager')
    if (authRes.errorResponse) return authRes.errorResponse
    const authTenantId = String(authRes.auth?.tenantId || '').trim()

    const storeCode = String(data.store || '').trim()
    if ((await assertAuthTenantMatchesStore(authRes.auth, storeCode)) === 'tenant_mismatch') {
      return NextResponse.json({ success: false, message: 'tenant_mismatch' }, { status: 403 })
    }

    if (!rowOrId) {
      return NextResponse.json({ success: false, message: '잘못된 행입니다.' }, { status: 400 })
    }

    const idFilter = `id=eq.${encodeURIComponent(rowOrId)}`
    const tenantFilter = authTenantId ? `&tenant_id=eq.${encodeURIComponent(authTenantId)}` : ''
    const patch: Record<string, unknown> = {
      log_date: (data.date || '').toString().trim().slice(0, 10) || null,
      log_time: String(data.time || '').trim(),
      store_name: storeCode,
      store_code: storeCode,
      tenant_id: authTenantId || null,
      writer: String(data.writer || '').trim(),
      customer: String(data.customer || '').trim(),
      contact: String(data.contact || '').trim(),
      visit_path: String(data.visitPath || '').trim(),
      platform: String(data.platform || '').trim(),
      complaint_type: String(data.type || '').trim(),
      menu: String(data.menu || '').trim(),
      title: String(data.title || '').trim(),
      content: String(data.content || '').trim(),
      severity: String(data.severity || '').trim(),
      action: String(data.action || '').trim(),
      customer_reply: String(data.customerReply || '').trim(),
      status: String(data.status || '접수').trim(),
      handler: String(data.handler || '').trim(),
      done_date: (data.doneDate || '').toString().trim().slice(0, 10) || null,
      photo_url: String(data.photoUrl || '').trim(),
      remark: String(data.remark || '').trim(),
    }

    try {
      await supabaseUpdateByFilterWithPgrst204Fallback(
        'complaint_logs',
        `${idFilter}${tenantFilter}`,
        patch,
        'updateComplaintLog'
      )
    } catch (e) {
      // tenant_id 컬럼 미적용 DB: 필터에서 tenant_id 를 빼면 id 만으로 수정
      const missing = extractAnyMissingColumn(e)
      if (tenantFilter && (missing === 'tenant_id' || /tenant_id/i.test(String(e)))) {
        const legacyPatch = { ...patch }
        delete legacyPatch.tenant_id
        delete legacyPatch.store_code
        await supabaseUpdateByFilter('complaint_logs', idFilter, legacyPatch)
      } else {
        throw e
      }
    }

    return NextResponse.json({ success: true, message: '수정되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('updateComplaintLog:', msg)
    return NextResponse.json({ success: false, message: '수정 실패: ' + msg }, { status: 500 })
  }
}
