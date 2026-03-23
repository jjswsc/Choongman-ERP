import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'

function parseUserRole(request: NextRequest, body?: Record<string, unknown>): string {
  const fromQuery = new URL(request.url).searchParams.get('userRole')
  if (fromQuery) return String(fromQuery).trim()
  if (body && typeof body.userRole === 'string') return body.userRole.trim()
  return ''
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const userRole = parseUserRole(request)
  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  const { searchParams } = new URL(request.url)
  const taxMonth = String(searchParams.get('taxMonth') || '').trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(taxMonth)) {
    return NextResponse.json({ error: 'INVALID_TAX_MONTH' }, { status: 400, headers })
  }

  try {
    const rows = (await supabaseSelectFilter(
      'withholding_tax_ledger_entries',
      `tax_month=eq.${encodeURIComponent(taxMonth)}`,
      { select: '*', limit: 5000, order: 'payment_date.asc,id.asc' }
    )) as Record<string, unknown>[] | null
    return NextResponse.json({ entries: rows || [] }, { headers })
  } catch (e) {
    console.error('withholdingTaxLedger GET:', e)
    return NextResponse.json({ entries: [] }, { headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = parseUserRole(request, body)
    assertCanManageAccountingCompliance(userRole)

    const id = body.id != null ? Number(body.id) : 0
    const paymentDate = String(body.paymentDate || body.payment_date || '').slice(0, 10)
    const taxMonth = String(body.taxMonth || body.tax_month || '').trim().slice(0, 7)
    if (!paymentDate || !/^\d{4}-\d{2}$/.test(taxMonth)) {
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400, headers })
    }

    const row = {
      payment_date: paymentDate,
      tax_month: taxMonth,
      payee_name: body.payeeName != null ? String(body.payeeName).slice(0, 500) : null,
      payee_tax_id: body.payeeTaxId != null ? String(body.payeeTaxId).slice(0, 32) : null,
      income_type: body.incomeType != null ? String(body.incomeType).slice(0, 128) : null,
      gross_amount: body.grossAmount != null ? Number(body.grossAmount) : null,
      wht_rate: body.whtRate != null ? Number(body.whtRate) : null,
      wht_amount: Number(body.whtAmount ?? body.wht_amount) || 0,
      form_hint: body.formHint != null ? String(body.formHint).slice(0, 64) : null,
      certificate_no: body.certificateNo != null ? String(body.certificateNo).slice(0, 128) : null,
      memo: body.memo != null ? String(body.memo).slice(0, 2000) : null,
      updated_at: new Date().toISOString(),
    }

    if (id > 0) {
      await supabaseUpdate('withholding_tax_ledger_entries', id, row)
      return NextResponse.json({ success: true, id }, { headers })
    }

    const inserted = (await supabaseInsert('withholding_tax_ledger_entries', {
      ...row,
      created_by: body.createdBy != null ? String(body.createdBy).slice(0, 200) : null,
      created_at: new Date().toISOString(),
    })) as { id?: number }[]
    const newId = Number(inserted?.[0]?.id || 0)
    return NextResponse.json({ success: true, id: newId }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('withholdingTaxLedger POST:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = parseUserRole(request, body)
    assertCanManageAccountingCompliance(userRole)

    const id = Number(body.id || 0)
    if (!id) {
      return NextResponse.json({ success: false, error: 'INVALID_ID' }, { status: 400, headers })
    }

    await supabaseDeleteByFilter('withholding_tax_ledger_entries', `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('withholdingTaxLedger DELETE:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
