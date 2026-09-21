import { NextRequest, NextResponse } from 'next/server'
import { loadInvoiceSellerAndBillTo } from '@/lib/invoice-vendor-clients'
import { resolveInventoryTenantScope } from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 인보이스 인쇄용: 본사 정보 + 매출처(회사명별) 정보 반환 (Supabase vendors, Omni: tenant 격리) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const scope = await resolveInventoryTenantScope({ auth })
    const { company, clients } = await loadInvoiceSellerAndBillTo(scope)
    return NextResponse.json({ company, clients }, { headers })
  } catch (e) {
    console.error('getInvoiceData:', e)
    return NextResponse.json(
      { company: null, clients: {} },
      { status: 500, headers }
    )
  }
}
