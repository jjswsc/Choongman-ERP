import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

export async function GET(_request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const rows = (await supabaseSelect('po_billing_settings', {
      order: 'store_name.asc',
      limit: 500,
    })) as {
      store_name?: string
      royalty_pct?: number
      delivery_gp_pct?: number
      grab_gp_pct?: number
      label_royalty?: string | null
      label_delivery_gp?: string | null
      label_grab_gp?: string | null
      updated_at?: string
    }[]
    return NextResponse.json({ success: true, list: rows || [] }, { headers })
  } catch (e) {
    console.error('getPoBillingSettings:', e)
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
