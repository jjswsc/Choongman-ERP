import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 출고지(창고) 삭제 - 사용 중인 품목이 있으면 삭제 불가. Omni는 tenant 격리. */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    const writeBlock = assertInventoryTenantWritable(tenantScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { headers })
    }

    const body = (await request.json()) as { id?: number; location_code?: string }
    const id = body.id ? Number(body.id) : 0
    const locationCode = String(body.location_code || '').trim()

    if (id <= 0 && !locationCode) {
      return NextResponse.json({ success: false, message: 'id 또는 location_code가 필요합니다.' }, { headers })
    }

    let targetCode = locationCode
    if (!targetCode && id > 0) {
      const rows = (await supabaseSelectFilter(
        'warehouse_locations',
        appendInventoryTenantFilter(`id=eq.${id}`, tenantScope),
        { limit: 1, select: 'location_code' }
      )) as { location_code?: string }[] | null
      targetCode = (rows?.[0]?.location_code || '').trim()
    }

    if (targetCode) {
      const used = (await supabaseSelectFilter(
        'items',
        appendInventoryTenantFilter(`outbound_location=eq.${encodeURIComponent(targetCode)}`, tenantScope),
        { limit: 1 }
      )) as unknown[]
      if (used && used.length > 0) {
        return NextResponse.json(
          { success: false, message: '해당 출고지를 사용 중인 품목이 있어 삭제할 수 없습니다.' },
          { headers }
        )
      }
    }

    const filter = appendInventoryTenantFilter(
      id > 0 ? `id=eq.${id}` : `location_code=eq.${encodeURIComponent(targetCode!)}`,
      tenantScope
    )
    await supabaseDeleteByFilter('warehouse_locations', filter)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteWarehouseLocation:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}
