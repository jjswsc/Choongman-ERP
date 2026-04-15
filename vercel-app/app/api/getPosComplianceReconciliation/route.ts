import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const PAID_LIKE = new Set(['paid', 'completed', 'ready'])

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (!authResult.auth) {
    return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401, headers })
  }
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || '').trim().slice(0, 10)
  const requestedStore = String(searchParams.get('storeCode') || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
    return NextResponse.json({ success: false, message: 'startStr/endStr 형식이 올바르지 않습니다.' }, { status: 400, headers })
  }
  const office = isOfficeRole(authResult.auth.role || '')
  const authStore = String(authResult.auth.store || '').trim()
  const storeCode = office ? requestedStore : requestedStore || authStore
  if (!office && storeCode && authStore && storeCode !== authStore) {
    return NextResponse.json({ success: false, message: '다른 매장 데이터에는 접근할 수 없습니다.' }, { status: 403, headers })
  }

  try {
    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    const orderFilterParts = [
      `created_at=gte.${encodeURIComponent(startISO)}`,
      `created_at=lt.${encodeURIComponent(endISOExclusive)}`,
    ]
    if (storeCode) {
      orderFilterParts.push(`store_code=eq.${encodeURIComponent(storeCode)}`)
    }
    const orderRows = (await supabaseSelectFilter('pos_orders', orderFilterParts.join('&'), {
      limit: 50000,
      select: 'id,status,subtotal,vat,total',
      order: 'created_at.asc',
    })) as { status?: string; subtotal?: number; vat?: number; total?: number }[] | null
    let posSubtotal = 0
    let posVat = 0
    let posTotal = 0
    let posCount = 0
    for (const row of orderRows || []) {
      const s = String(row.status || '').trim().toLowerCase()
      if (!PAID_LIKE.has(s)) continue
      posCount += 1
      posSubtotal += Number(row.subtotal || 0)
      posVat += Number(row.vat || 0)
      posTotal += Number(row.total || 0)
    }

    const vatFilterParts = [
      `doc_date=gte.${encodeURIComponent(startStr)}`,
      `doc_date=lte.${encodeURIComponent(endStr)}`,
      'direction=eq.output',
    ]
    if (storeCode) {
      vatFilterParts.push(`store_name=eq.${encodeURIComponent(storeCode)}`)
    }
    const vatRows = (await supabaseSelectFilter('vat_ledger_entries', vatFilterParts.join('&'), {
      limit: 20000,
      select: 'net_amount,vat_amount,total_amount,filing_status,memo',
      order: 'doc_date.asc,id.asc',
    })) as {
      net_amount?: number
      vat_amount?: number
      total_amount?: number
      filing_status?: string
      memo?: string
    }[] | null
    let vatDraftNet = 0
    let vatDraftVat = 0
    let vatDraftTotal = 0
    let vatDraftCount = 0
    for (const row of vatRows || []) {
      if (String(row.filing_status || 'draft').trim().toLowerCase() !== 'draft') continue
      vatDraftCount += 1
      vatDraftNet += Number(row.net_amount || 0)
      vatDraftVat += Number(row.vat_amount || 0)
      vatDraftTotal += Number(row.total_amount || 0)
    }

    return NextResponse.json(
      {
        success: true,
        window: { startStr, endStr, storeCode: storeCode || null },
        pos: {
          count: posCount,
          subtotal: Number(posSubtotal.toFixed(2)),
          vat: Number(posVat.toFixed(2)),
          total: Number(posTotal.toFixed(2)),
        },
        vatDraft: {
          count: vatDraftCount,
          net: Number(vatDraftNet.toFixed(2)),
          vat: Number(vatDraftVat.toFixed(2)),
          total: Number(vatDraftTotal.toFixed(2)),
        },
        gap: {
          net: Number((posSubtotal - vatDraftNet).toFixed(2)),
          vat: Number((posVat - vatDraftVat).toFixed(2)),
          total: Number((posTotal - vatDraftTotal).toFixed(2)),
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosComplianceReconciliation:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
