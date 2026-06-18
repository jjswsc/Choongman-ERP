import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpdate, supabaseSelectFilter } from '@/lib/supabase-server'
import { syncExpenseAccrualInputVatLedger } from '@/lib/expense-input-vat-ledger'
import { syncInvoiceBackedBankInputVatLedgerForBankId } from '@/lib/invoice-backed-input-vat-ledger'
import { updateVatLedgerEntryEvidence } from '@/lib/vat-ledger-invoice-evidence'

/** 통장 거래 인보이스 수령 체크 (매입 대금 건)
 * purchase_order_id가 있으면 발주서와 동기화 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const bankTxId = Number(body.bankTransactionId ?? body.id ?? body.bankTxId)
    const invoiceReceived = body.invoiceReceived ?? body.invoice_received
    const invoiceNo = body.invoiceNo ?? body.invoice_no
    const invoicePhotoUrl = body.invoicePhotoUrl ?? body.invoice_photo_url ?? body.invoice_photo
    const purchaseOrderId = body.purchaseOrderId ?? body.purchase_order_id

    if (!bankTxId || isNaN(bankTxId)) {
      return NextResponse.json({ success: false, message: '통장 거래 ID가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTxId}`, { limit: 1 })) as {
      id?: number
      category?: string
      purchase_order_id?: number
      invoice_received?: boolean | null
      invoice_no?: string | null
      invoice_photo_url?: string | null
    }[]
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '해당 통장 거래가 없습니다.' }, { status: 404, headers })
    }

    const patch: Record<string, unknown> = {}
    if (typeof invoiceReceived === 'boolean') patch.invoice_received = invoiceReceived
    if (invoiceNo !== undefined) patch.invoice_no = String(invoiceNo || '').trim() || null
    if (invoicePhotoUrl !== undefined) patch.invoice_photo_url = String(invoicePhotoUrl || '').trim() || null
    if (purchaseOrderId !== undefined) {
      const poId = purchaseOrderId ? Number(purchaseOrderId) : null
      patch.purchase_order_id = poId && !isNaN(poId) ? poId : null
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: true, message: '변경 사항 없음' }, { headers })
    }

    await supabaseUpdate('bank_transactions', bankTxId, patch)

    // 연동: purchase_order_id가 있으면 발주서 인보이스도 동기화
    const poIdRaw = patch.purchase_order_id !== undefined ? patch.purchase_order_id : existing[0].purchase_order_id
    const poId = typeof poIdRaw === 'number' && !isNaN(poIdRaw) ? poIdRaw : null
    if (poId != null && typeof invoiceReceived === 'boolean') {
      await supabaseUpdate('purchase_orders', poId, { invoice_received: invoiceReceived })
    }

    // 연동: 통장 인보이스 체크 상태를 VAT 보조장부 증빙상태에 동기화
    if (typeof invoiceReceived === 'boolean') {
      const evidenceStatus = invoiceReceived ? 'received' : 'required_pending'
      const evidenceReasonCode = invoiceReceived ? null : 'missing_invoice'

      // 1) 지출발생(expense_accruals) 기반 VAT 행 동기화
      const payableRows = (await supabaseSelectFilter(
        'payable_transactions',
        `bank_transaction_id=eq.${bankTxId}`,
        { select: 'expense_accrual_id', limit: 200 }
      )) as { expense_accrual_id?: number | null }[] | null
      const expenseIds = [...new Set((payableRows || []).map((r) => Number(r.expense_accrual_id || 0)).filter((n) => n > 0))]
      for (const expenseId of expenseIds) {
        const memoTag = encodeURIComponent(`%[AUTO:EXPENSE_ACCRUAL:${expenseId}]%`)
        const vatRows = (await supabaseSelectFilter(
          'vat_ledger_entries',
          `memo=ilike.${memoTag}`,
          { select: 'id', limit: 20 }
        )) as { id?: number }[] | null
        for (const v of vatRows || []) {
          const vid = Number(v.id || 0)
          if (vid > 0) {
            await updateVatLedgerEntryEvidence(vid, evidenceStatus, evidenceReasonCode)
          }
        }
        const bankInvoicePatch: Record<string, unknown> = {}
        if (typeof invoiceReceived === 'boolean') bankInvoicePatch.invoice_received = invoiceReceived
        if (invoiceNo !== undefined) bankInvoicePatch.invoice_no = String(invoiceNo || '').trim() || null
        if (invoicePhotoUrl !== undefined) {
          bankInvoicePatch.invoice_photo_url = String(invoicePhotoUrl || '').trim() || null
        }
        if (Object.keys(bankInvoicePatch).length > 0) {
          await supabaseUpdate('expense_accruals', expenseId, bankInvoicePatch)
        }
        await syncExpenseAccrualInputVatLedger(expenseId)
      }

      // 2) 발주/입고(stock_logs) 기반 VAT 행 동기화 (purchase_order_id 연결 시)
      if (poId != null) {
        try {
          const batches = (await supabaseSelectFilter(
            'inbound_batches',
            `purchase_order_id=eq.${poId}`,
            { select: 'id', limit: 200 }
          )) as { id?: number }[] | null
          const batchIds = (batches || []).map((b) => Number(b.id || 0)).filter((n) => n > 0)
          if (batchIds.length > 0) {
            const logs = (await supabaseSelectFilter(
              'stock_logs',
              `inbound_batch_id=in.(${batchIds.join(',')})`,
              { select: 'id', limit: 2000 }
            )) as { id?: number }[] | null
            for (const lg of logs || []) {
              const sid = Number(lg.id || 0)
              if (sid <= 0) continue
              const memoTag = encodeURIComponent(`%[AUTO:STOCK_LOG:${sid}]%`)
              const vatRows = (await supabaseSelectFilter(
                'vat_ledger_entries',
                `memo=ilike.${memoTag}`,
                { select: 'id', limit: 20 }
              )) as { id?: number }[] | null
              for (const v of vatRows || []) {
                const vid = Number(v.id || 0)
                if (vid > 0) {
                  await updateVatLedgerEntryEvidence(vid, evidenceStatus, evidenceReasonCode)
                }
              }
            }
          }
        } catch {
          // 스키마 차이(inbound_batch_id 미존재 등) 환경에서는 VAT 연동만 스킵
        }
      }
    }

    try {
      await syncInvoiceBackedBankInputVatLedgerForBankId(bankTxId)
    } catch (bankVatErr) {
      console.warn('updateBankTransactionInvoice bank VAT sync:', bankVatErr)
    }

    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateBankTransactionInvoice:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
