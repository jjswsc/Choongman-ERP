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

/** 본사 발주용 거래처 목록: 매입/둘다/본사 (매장→본사 전환 시 본사 거래처 포함) */
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
      addr?: string
      tax_id?: string
      phone?: string
      bank_account_no?: string
      sales_outlet?: string
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
      .filter((row) => row?.code)
      .filter((row) => {
        const t = String(row.type || '').toLowerCase().trim()
        if (t === '매출' || t === 'sales' || t === '매출처') return false
        return true
      })
      .map((row) => ({
        code: String(row.code),
        name: String(row.name || '').trim(),
        address: String(row.addr || ''),
        taxId: String((row as { tax_id?: string }).tax_id || '').trim(),
        phone: String((row as { phone?: string }).phone || '').trim(),
        bankAccountNo: String((row as { bank_account_no?: string }).bank_account_no || '').trim() || null,
        salesOutlet: String(row.sales_outlet || '').trim() || null,
      }))

    return NextResponse.json(sortVendorsByDisplayName(list), { headers })
  } catch (e) {
    console.error('getVendorsForPurchase:', e)
    return NextResponse.json([], { headers })
  }
}
