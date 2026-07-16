import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { normalizeTenantId } from '@/lib/tenant-context'
import { resolveTenantIdForStoreCode } from '@/lib/tenant-integration-resolve'

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
    const tenantFromStore = await resolveTenantIdForStoreCode(storeCode).catch(() => undefined)
    const resolvedTenantId = tenantFromStore ? normalizeTenantId(tenantFromStore) : ''
    if (authTenantId && resolvedTenantId && authTenantId !== resolvedTenantId) {
      return NextResponse.json({ success: false, message: 'tenant_mismatch' }, { status: 403 })
    }

    if (!rowOrId) {
      return NextResponse.json({ success: false, message: '잘못된 행입니다.' }, { status: 400 })
    }

    const tenantFilter = authTenantId ? `&tenant_id=eq.${encodeURIComponent(authTenantId)}` : ''
    await supabaseUpdateByFilter('complaint_logs', `id=eq.${encodeURIComponent(rowOrId)}${tenantFilter}`, {
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
      status: String(data.status || '접수').trim(),
      handler: String(data.handler || '').trim(),
      done_date: (data.doneDate || '').toString().trim().slice(0, 10) || null,
      photo_url: String(data.photoUrl || '').trim(),
      remark: String(data.remark || '').trim(),
    })

    return NextResponse.json({ success: true, message: '수정되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('updateComplaintLog:', msg)
    return NextResponse.json({ success: false, message: '수정 실패: ' + msg }, { status: 500 })
  }
}
