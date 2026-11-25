import { NextRequest, NextResponse } from 'next/server'
import { parsePoBillingRateVersionRows } from '@/lib/po-billing-rate-versions'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

export const runtime = 'nodejs'

/** GET /api/accounting/po-billing-rate-history?store= */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const store = String(new URL(request.url).searchParams.get('store') || '').trim()
    const raw = store
      ? ((await supabaseSelectFilter(
          'po_billing_rate_versions',
          `store_name=eq.${encodeURIComponent(store)}`,
          { order: 'effective_from.desc', limit: 2000 }
        )) as Record<string, unknown>[])
      : ((await supabaseSelect('po_billing_rate_versions', {
          order: 'store_name.asc,effective_from.desc',
          limit: 5000,
        })) as Record<string, unknown>[])

    const list = parsePoBillingRateVersionRows(raw || []).sort((a, b) => {
      const c = a.store_name.localeCompare(b.store_name)
      if (c !== 0) return c
      return b.effective_from.localeCompare(a.effective_from)
    })

    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('po-billing-rate-history:', e)
    return NextResponse.json(
      {
        success: false,
        list: [],
        message: e instanceof Error ? e.message : '조회 실패',
      },
      { status: 500, headers }
    )
  }
}
