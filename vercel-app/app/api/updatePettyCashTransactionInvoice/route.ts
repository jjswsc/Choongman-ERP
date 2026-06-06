import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { syncPettyCashInvoiceEvidence } from '@/lib/petty-cash-invoice-sync'
import { updateVatLedgerEntryEvidence } from '@/lib/vat-ledger-invoice-evidence'
import { requireAuth } from '@/lib/verify-auth'

/** 패티캐시 거래 세금계산서 수령 여부 (PP30 매입 증빙 연동) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }

    const body = await request.json()
    const pettyCashId = Number(body.pettyCashId ?? body.petty_cash_id ?? body.id ?? 0)
    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const invoiceNo = body.invoiceNo ?? body.invoice_no
    const invoicePhotoUrl = body.invoicePhotoUrl ?? body.invoice_photo_url ?? body.invoice_photo
    const vatAmountRaw = body.vatAmount ?? body.vat_amount

    if (!pettyCashId || isNaN(pettyCashId)) {
      return NextResponse.json({ success: false, message: '패티 거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('petty_cash_transactions', `id=eq.${pettyCashId}`, {
      limit: 1,
      select: 'id,trans_type',
    })) as { id?: number; trans_type?: string | null }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '해당 패티 거래가 없습니다.' }, { status: 404, headers })
    }

    const patch: Record<string, unknown> = {}
    if (typeof invoiceReceived === 'boolean') patch.invoice_received = invoiceReceived
    if (invoiceNo !== undefined) patch.invoice_no = String(invoiceNo || '').trim() || null
    if (invoicePhotoUrl !== undefined) patch.invoice_photo_url = String(invoicePhotoUrl || '').trim() || null
    if (vatAmountRaw !== undefined) {
      const v = Math.max(0, Math.abs(Number(vatAmountRaw) || 0))
      patch.vat_amount = v > 0 ? v : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' }, { headers })
    }

    await supabaseUpdate('petty_cash_transactions', pettyCashId, patch)

    const linkedPayable = (await supabaseSelectFilter(
      'payable_transactions',
      `petty_cash_transaction_id=eq.${pettyCashId}`,
      { select: 'expense_accrual_id,vendor_code', limit: 5 }
    )) as { expense_accrual_id?: number | null; vendor_code?: string | null }[] | null
    const isPurchasePayment = (linkedPayable || []).some((p) => String(p.vendor_code || '').trim())

    try {
      await syncPettyCashInvoiceEvidence(pettyCashId, { skipPurchasePayment: isPurchasePayment })
    } catch (syncErr) {
      console.error('updatePettyCashTransactionInvoice sync:', syncErr)
    }

    // 연결된 지출 발생 VAT 증빙도 동기화 (지급예정 → 패티 지급 건)
    if (typeof invoiceReceived === 'boolean') {
      const accrualIds = [
        ...new Set((linkedPayable || []).map((p) => Math.floor(Number(p.expense_accrual_id) || 0)).filter((n) => n > 0)),
      ]
      const evidenceStatus = invoiceReceived ? 'received' : 'required_pending'
      const evidenceReasonCode = invoiceReceived ? null : 'missing_invoice'
      for (const expenseId of accrualIds) {
        const memoTag = encodeURIComponent(`%[AUTO:EXPENSE_ACCRUAL:${expenseId}]%`)
        const vatRows = (await supabaseSelectFilter('vat_ledger_entries', `memo=ilike.${memoTag}`, {
          select: 'id',
          limit: 20,
        })) as { id?: number }[] | null
        for (const v of vatRows || []) {
          const vid = Math.floor(Number(v.id) || 0)
          if (vid > 0) await updateVatLedgerEntryEvidence(vid, evidenceStatus, evidenceReasonCode)
        }
      }
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updatePettyCashTransactionInvoice:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
