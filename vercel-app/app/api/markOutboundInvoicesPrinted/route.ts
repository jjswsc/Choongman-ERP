import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { isOfficeRole } from '@/lib/permissions'
import { supabaseUpsert } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    if (!auth || !isOfficeRole(String(auth.role || ''))) {
      return NextResponse.json({ success: false, message: 'FORBIDDEN' }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      invoiceNos?: unknown
    }
    const invoiceNos = Array.isArray(body.invoiceNos)
      ? [...new Set(body.invoiceNos.map((v) => String(v || '').trim()).filter(Boolean))]
      : []
    if (invoiceNos.length === 0) {
      return NextResponse.json({ success: false, message: 'invoiceNos required' }, { status: 400 })
    }

    const now = getBangkokDateTimeString()
    const rows = invoiceNos.map((invoiceNo) => ({
      invoice_no: invoiceNo,
      printed: true,
      printed_at: now,
      printed_by: String(auth.name || '').trim() || null,
      updated_at: now,
    }))

    await supabaseUpsert('outbound_invoice_print_status', rows, 'invoice_no')
    return NextResponse.json({ success: true, saved: rows.length })
  } catch (err) {
    console.error('markOutboundInvoicesPrinted:', err)
    return NextResponse.json({ success: false, message: 'failed to save print status' }, { status: 500 })
  }
}

