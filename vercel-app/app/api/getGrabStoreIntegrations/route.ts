import { NextRequest, NextResponse } from 'next/server'
import { isLegacyChoongmanErpSupabase } from '@/lib/erp-legacy-supabase'
import { appendTenantFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { resolveInventoryTenantScope } from '@/lib/inventory-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

type Row = {
  id?: number
  grab_merchant_id?: string
  partner_merchant_id?: string
  integration_status?: string
  last_request_id?: string | null
  last_message?: string | null
  payload_json?: unknown
  created_at?: string | null
  updated_at?: string | null
}

/** Grab 매장 연동 상태 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  const tenantScope = await resolveInventoryTenantScope({ auth: authRes.auth })
  if (tenantScope.enforce && !tenantScope.tenantId) {
    return NextResponse.json([], { headers })
  }

  const { searchParams } = new URL(req.url)
  const grabMerchantID = String(searchParams.get('grabMerchantID') ?? '').trim()
  const partnerMerchantID = String(searchParams.get('partnerMerchantID') ?? '').trim()
  const status = String(searchParams.get('status') ?? '').trim().toUpperCase()
  const limitRaw = Number(searchParams.get('limit') ?? 200)
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.trunc(limitRaw))) : 200

  const filters: string[] = []
  if (grabMerchantID) filters.push(`grab_merchant_id=eq.${encodeURIComponent(grabMerchantID)}`)
  if (partnerMerchantID) filters.push(`partner_merchant_id=eq.${encodeURIComponent(partnerMerchantID)}`)
  if (status) filters.push(`integration_status=eq.${encodeURIComponent(status)}`)
  let filter = filters.length > 0 ? filters.join('&') : 'id=gt.0'
  if (tenantScope.enforce && tenantScope.tenantId && !isLegacyChoongmanErpSupabase()) {
    filter = appendTenantFilter(filter, { tenantId: tenantScope.tenantId })
  }

  try {
    const rows = (await supabaseSelectFilter('pos_grab_store_integrations', filter, {
      order: 'updated_at.desc',
      limit,
      select:
        'id,grab_merchant_id,partner_merchant_id,integration_status,last_request_id,last_message,payload_json,created_at,updated_at',
    })) as Row[] | null
    const list = (rows || []).map((r) => ({
      id: Number(r.id ?? 0),
      grabMerchantID: String(r.grab_merchant_id ?? ''),
      partnerMerchantID: String(r.partner_merchant_id ?? ''),
      integrationStatus: String(r.integration_status ?? ''),
      lastRequestID: r.last_request_id ? String(r.last_request_id) : null,
      lastMessage: r.last_message ? String(r.last_message) : null,
      payload: r.payload_json ?? null,
      createdAt: r.created_at ? String(r.created_at) : null,
      updatedAt: r.updated_at ? String(r.updated_at) : null,
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    const msg = String(e ?? '')
    if (/pos_grab_store_integrations|does not exist|42p01/i.test(msg)) {
      return NextResponse.json([], { headers })
    }
    console.error('getGrabStoreIntegrations:', e)
    return NextResponse.json([], { headers })
  }
}
