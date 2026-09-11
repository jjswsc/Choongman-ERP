import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 품목 관리·출고지 설정용 warehouse_locations 조회. Omni는 tenant 격리. */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    if (isInventoryTenantQueryBlocked(tenantScope)) {
      return NextResponse.json([], { headers })
    }

    const filter = appendInventoryTenantFilter('', tenantScope)
    const rows = (
      filter
        ? await supabaseSelectFilter('warehouse_locations', filter, {
            order: 'sort_order.asc',
            limit: 100,
            select: 'id,name,address,location_code,sort_order',
          })
        : await supabaseSelect('warehouse_locations', {
            order: 'sort_order.asc',
            limit: 100,
            select: 'id,name,address,location_code,sort_order',
          })
    ) as {
      id?: number
      name?: string
      address?: string
      location_code?: string
      sort_order?: number
    }[] | null

    const list = (rows || []).map((r) => ({
      id: r.id,
      name: String(r.name || '').trim(),
      address: String(r.address || '').trim(),
      location_code: String(r.location_code || r.name || '').trim(),
      sort_order: Number(r.sort_order) || 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getWarehouseLocations:', e)
    return NextResponse.json([], { headers })
  }
}
