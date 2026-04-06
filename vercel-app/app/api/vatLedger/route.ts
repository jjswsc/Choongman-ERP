import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { appendStoreNameFilter } from '@/lib/accounting-ledger-store-filter'

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
  const storeFilter = String(searchParams.get('storeFilter') || '').trim()
  if (!/^\d{4}-\d{2}$/.test(taxMonth)) {
    return NextResponse.json({ error: 'INVALID_TAX_MONTH' }, { status: 400, headers })
  }

  try {
    const filter = appendStoreNameFilter(`tax_month=eq.${encodeURIComponent(taxMonth)}`, storeFilter)
    const rows = (await supabaseSelectFilter('vat_ledger_entries', filter, {
      select: '*',
      limit: 5000,
      order: 'doc_date.asc,id.asc',
    })) as Record<string, unknown>[] | null
    return NextResponse.json({ entries: rows || [] }, { headers })
  } catch (e) {
    console.error('vatLedger GET:', e)
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
    const docDate = String(body.docDate || body.doc_date || '').slice(0, 10)
    const taxMonth = String(body.taxMonth || body.tax_month || '').trim().slice(0, 7)
    const direction = String(body.direction || '').toLowerCase()
    if (!docDate || !/^\d{4}-\d{2}$/.test(taxMonth) || (direction !== 'output' && direction !== 'input')) {
      return NextResponse.json({ success: false, error: 'INVALID_BODY' }, { status: 400, headers })
    }

    const row = {
      doc_date: docDate,
      tax_month: taxMonth,
      direction,
      counterparty_name: body.counterpartyName != null ? String(body.counterpartyName).slice(0, 500) : null,
      counterparty_tax_id: body.counterpartyTaxId != null ? String(body.counterpartyTaxId).slice(0, 32) : null,
      invoice_number: body.invoiceNumber != null ? String(body.invoiceNumber).slice(0, 128) : null,
      net_amount: Number(body.netAmount ?? body.net_amount) || 0,
      vat_amount: Number(body.vatAmount ?? body.vat_amount) || 0,
      total_amount: Number(body.totalAmount ?? body.total_amount) || 0,
      vat_status: body.vatStatus != null ? String(body.vatStatus).slice(0, 64) : null,
      memo: body.memo != null ? String(body.memo).slice(0, 2000) : null,
      store_name:
        body.storeName != null && String(body.storeName).trim() !== ''
          ? String(body.storeName).slice(0, 200)
          : null,
      updated_at: new Date().toISOString(),
    }

    if (id > 0) {
      await supabaseUpdate('vat_ledger_entries', id, {
        ...row,
      })
      return NextResponse.json({ success: true, id }, { headers })
    }

    const inserted = (await supabaseInsert('vat_ledger_entries', {
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
    console.error('vatLedger POST:', e)
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

    await supabaseDeleteByFilter('vat_ledger_entries', `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === 'ACCOUNTING_FORBIDDEN') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    console.error('vatLedger DELETE:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
