import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { withPurchaseLocationFallback } from '@/lib/warehouse-purchase-locations'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 본사 발주용 출고지 목록: warehouse_locations. Omni는 tenant 격리, 충만만 빈 목록 시드. */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    if (isInventoryTenantQueryBlocked(tenantScope)) {
      return NextResponse.json([], { headers })
    }

    const locations: { name: string; address: string; location_code: string }[] = []
    const filter = appendInventoryTenantFilter('', tenantScope)

    try {
      const whRows = (
        filter
          ? await supabaseSelectFilter('warehouse_locations', filter, {
              order: 'sort_order.asc',
              limit: 50,
            })
          : await supabaseSelect('warehouse_locations', { order: 'sort_order.asc', limit: 50 })
      ) as {
        name?: string
        address?: string
        location_code?: string
      }[] | null
      for (const row of whRows || []) {
        if (row?.name) {
          locations.push({
            name: String(row.name),
            address: String(row.address || ''),
            location_code: String(row.location_code || row.name),
          })
        }
      }
    } catch {
      // 테이블 없을 수 있음
    }

    return NextResponse.json(withPurchaseLocationFallback(locations, tenantScope.enforce), { headers })
  } catch (e) {
    console.error('getPurchaseLocations:', e)
    return NextResponse.json([], { headers })
  }
}
