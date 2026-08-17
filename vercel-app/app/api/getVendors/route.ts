import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { sortVendorsByDisplayName } from '@/lib/vendor-sort'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

import { mapVendorType } from '@/lib/vendor-type'

/** 관리자 거래처 관리 - Supabase vendors 테이블 조회 (Omni: tenant 격리) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const scope = await resolveInventoryTenantScope({ auth })
    if (isInventoryTenantQueryBlocked(scope)) {
      return NextResponse.json([], { headers })
    }

    const tenantFilter = appendInventoryTenantFilter('', scope)
    let rows: {
      id?: number
      code?: string
      name?: string
      type?: string
      manager?: string
      phone?: string
      addr?: string
      tax_id?: string
      memo?: string
      gps_name?: string
      sales_outlet?: string
      direct_settlement?: boolean
      bank_account_no?: string | null
      bank_name?: string | null
    }[] | null

    try {
      rows = tenantFilter
        ? ((await supabaseSelectFilter('vendors', tenantFilter, {
            order: 'id.asc',
            limit: 5000,
          })) as typeof rows)
        : ((await supabaseSelect('vendors', { order: 'id.asc', limit: 5000 })) as typeof rows)
    } catch (err) {
      if (tenantFilter && isMissingInventoryTenantIdColumnError(err)) {
        markInventoryTenantIdColumnMissing()
        if (scope.enforce) return NextResponse.json([], { headers })
      }
      throw err
    }

    const list = (rows || [])
      .filter((row) => row?.code)
      .map((row) => {
        const t = mapVendorType(row.type || '')
        const gpsName = String(row.gps_name || '').trim()
        const salesOutlet = String((row as { sales_outlet?: string }).sales_outlet || '').trim() || undefined
        const fullName = String(row.name || '').trim()
        return {
          code: String(row.code),
          name: fullName,
          gps_name: gpsName,
          sales_outlet: salesOutlet,
          contact: String(row.manager || ''),
          phone: String(row.phone || ''),
          email: '',
          address: String(row.addr || ''),
          tax_no: String((row as { tax_id?: string }).tax_id || '').trim() || undefined,
          type: t,
          memo: String(row.memo || ''),
          direct_settlement: Boolean(row.direct_settlement),
          bank_account_no: String(row.bank_account_no || '').trim() || undefined,
          bank_name: String(row.bank_name || '').trim() || undefined,
        }
      })

    return NextResponse.json(sortVendorsByDisplayName(list), { headers })
  } catch (e) {
    console.error('getVendors:', e)
    return NextResponse.json([], { headers })
  }
}
