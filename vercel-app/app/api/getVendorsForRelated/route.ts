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
import { isRelatedVendorType } from '@/lib/vendor-type'

/** 차입/대여 상대: vendors.type = related */
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
      code?: string
      name?: string
      type?: string
      bank_account_no?: string
      bank_name?: string
    }[] | null

    try {
      rows = tenantFilter
        ? ((await supabaseSelectFilter('vendors', tenantFilter, {
            order: 'id.asc',
            limit: 10000,
          })) as typeof rows)
        : ((await supabaseSelect('vendors', { order: 'id.asc', limit: 10000 })) as typeof rows)
    } catch (e) {
      if (isMissingInventoryTenantIdColumnError(e)) {
        markInventoryTenantIdColumnMissing()
        rows = (await supabaseSelect('vendors', { order: 'id.asc', limit: 10000 })) as typeof rows
      } else {
        throw e
      }
    }

    const list = (rows || [])
      .filter((row) => row?.code && isRelatedVendorType(row.type))
      .map((row) => ({
        code: String(row.code),
        name: String(row.name || '').trim(),
        bankAccountNo: String(row.bank_account_no || '').trim() || null,
        bankName: String(row.bank_name || '').trim() || null,
      }))

    return NextResponse.json(sortVendorsByDisplayName(list), { headers })
  } catch (e) {
    console.error('getVendorsForRelated:', e)
    return NextResponse.json([], { headers })
  }
}
