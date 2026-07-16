import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany } from '@/lib/supabase-server'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { requireAuth } from '@/lib/verify-auth'
import {
  assertInventoryTenantWritable,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
  stampInventoryTenantId,
} from '@/lib/inventory-tenant-scope'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    // 모바일 사용(재고 출고): 일반 직원도 본인 매장에서 사용 등록 가능. 매장 검증은 아래 isScopedRole 분기
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const tenantScope = await resolveInventoryTenantScope({ auth })
    const writeBlock = assertInventoryTenantWritable(tenantScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { status: 400, headers })
    }
    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : []
    const requestedStoreName = String(body.storeName || body.store || '').trim()
    const userRole = String(auth.role || '').trim()
    const userStore = String(auth.store || '').trim()
    const allowedStores = Array.from(
      new Set(
        [...(Array.isArray(auth.allowedStores) ? auth.allowedStores : []), userStore]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    )
    const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
    if (isScopedRole && allowedStores.length === 0) {
      return NextResponse.json(
        { success: false, message: '접근 가능한 매장 정보가 없습니다.' },
        { status: 403, headers }
      )
    }
    const fallbackStore = allowedStores[0] || userStore
    const storeName = requestedStoreName || fallbackStore
    if (
      isScopedRole &&
      (!storeName || !allowedStores.some((s) => storesMatchForGradeLookup(s, storeName)))
    ) {
      return NextResponse.json(
        { success: false, message: '허용되지 않은 매장입니다.' },
        { status: 403, headers }
      )
    }

    if (!storeName) {
      return NextResponse.json(
        { success: false, message: '❌ 매장 정보가 없습니다.' },
        { headers }
      )
    }
    if (items.length === 0) {
      return NextResponse.json(
        { success: false, message: '❌ 사용 품목이 없습니다.' },
        { headers }
      )
    }

    const userName = String(auth.name || body.userName || body.user_name || '').trim()
    const now = new Date().toISOString()
    const rows = items
      .filter((k: { code?: string; qty?: number }) => k && (k.code || (k as { name?: string }).name) && Number((k as { qty?: number }).qty) > 0)
      .map((k: { code?: string; name?: string; qty?: number }) => {
        const r: Record<string, unknown> = {
          location: storeName,
          item_code: String((k as { code?: string }).code || '').trim(),
          item_name: String((k as { name?: string }).name || '').trim(),
          spec: 'Usage',
          qty: -Math.abs(Number((k as { qty?: number }).qty) || 0),
          log_date: now,
          vendor_target: 'Store',
          log_type: 'Usage',
        }
        if (userName) r.user_name = userName
        return stampInventoryTenantId(r, tenantScope)
      })
      .filter((r: { qty: number }) => r.qty !== 0)

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, message: '❌ 유효한 품목이 없습니다.' },
        { headers }
      )
    }

    await supabaseInsertMany('stock_logs', rows)
    return NextResponse.json({ success: true, message: '✅ 사용 확정 완료' }, { headers })
  } catch (e) {
    if (isMissingInventoryTenantIdColumnError(e)) {
      markInventoryTenantIdColumnMissing()
      return NextResponse.json(
        { success: false, message: 'inventory tenant_id 스키마가 없습니다.' },
        { status: 400, headers }
      )
    }
    console.error('processUsage:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
