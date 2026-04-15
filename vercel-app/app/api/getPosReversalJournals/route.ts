import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

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
    return NextResponse.json(
      { success: false, message: 'startStr/endStr 형식이 올바르지 않습니다.' },
      { status: 400, headers }
    )
  }

  const office = isOfficeRole(authResult.auth.role || '')
  const authStore = String(authResult.auth.store || '').trim()
  const storeCode = office ? requestedStore : requestedStore || authStore
  if (!office && storeCode && authStore && storeCode !== authStore) {
    return NextResponse.json(
      { success: false, message: '다른 매장 데이터에는 접근할 수 없습니다.' },
      { status: 403, headers }
    )
  }

  try {
    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    const parts = [
      `source_type=eq.${encodeURIComponent('pos_order_reversal')}`,
      `posted_at=gte.${encodeURIComponent(startISO)}`,
      `posted_at=lt.${encodeURIComponent(endISOExclusive)}`,
    ]
    if (storeCode) {
      parts.push(`store_name=eq.${encodeURIComponent(storeCode)}`)
    }
    const rows = (await supabaseSelectFilter('journal_entries', parts.join('&'), {
      limit: 2000,
      select: 'id,accounting_date,source_id,store_name,memo,posted_at',
      order: 'posted_at.desc,id.desc',
    })) as {
      id?: number
      accounting_date?: string
      source_id?: number
      store_name?: string
      memo?: string
      posted_at?: string
    }[] | null
    return NextResponse.json(
      {
        success: true,
        rows: (rows || []).map((r) => ({
          id: Number(r.id || 0),
          accountingDate: String(r.accounting_date || ''),
          posOrderId: Number(r.source_id || 0),
          storeCode: String(r.store_name || ''),
          memo: String(r.memo || ''),
          postedAt: String(r.posted_at || ''),
        })),
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosReversalJournals:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
