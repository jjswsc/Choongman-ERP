import { NextRequest, NextResponse } from 'next/server'
import { isAccountingStoreScopeForbidden } from '@/lib/accounting-store-scope'
import {
  computePosCostSalesWeighted,
  type PosCostSalesWeightedChannelFilter,
} from '@/lib/pos-cost-sales-weighted'
import { canAccessPosCostAnalysis } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

export const maxDuration = 120

const CHANNELS = new Set<PosCostSalesWeightedChannelFilter>([
  'all',
  'dine_in',
  'takeout',
  'delivery',
  'other',
])

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  if (!canAccessPosCostAnalysis(String(auth.role || ''))) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
  }

  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || '').trim()
  const endStr = String(searchParams.get('endStr') || '').trim()
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const channelRaw = String(searchParams.get('channel') || 'all').trim() as PosCostSalesWeightedChannelFilter
  const channel = CHANNELS.has(channelRaw) ? channelRaw : 'all'
  const miseRaw = searchParams.get('misePercent')
  const miseRatePercent =
    miseRaw != null && miseRaw !== '' && Number.isFinite(Number(miseRaw)) ? Number(miseRaw) : undefined

  if (!startStr || !endStr) {
    return NextResponse.json({ error: 'MISSING_DATE_RANGE' }, { status: 400, headers })
  }

  try {
    const data = await computePosCostSalesWeighted({
      startStr,
      endStr,
      storeFilter,
      channel,
      miseRatePercent,
      auth: {
        userRole: auth.role,
        userStore: auth.store,
        allowedStores: auth.allowedStores,
        tenantId: auth.tenantId,
      },
    })
    return NextResponse.json(data, { headers })
  } catch (e) {
    if (isAccountingStoreScopeForbidden(e)) {
      return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
    }
    console.error('getPosCostSalesWeighted:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
