/**
 * 미수금/미지급금 upsert 로직
 * - 주문 승인/수정, 발주 승인/수정 시 트랜잭션 생성 또는 업데이트
 * - (ref_type, ref_id) 유니크: 있으면 UPDATE, 없으면 INSERT
 */
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
  supabaseDeleteByFilter,
} from './supabase-server'
import { formatReceivableInvoiceNo } from './receivable-invoice-format'

export { formatReceivableInvoiceNo }

export async function upsertPayableFromPO(params: {
  poId: number
  vendorCode: string
  total: number
  transDate: string
}): Promise<void> {
  const { poId, vendorCode, total, transDate } = params
  if (!vendorCode || total <= 0) return

  const existing = (await supabaseSelectFilter(
    'payable_transactions',
    `ref_type=eq.PO&ref_id=eq.${poId}`,
    { limit: 1 }
  )) as { id?: number }[]
  const row = {
    vendor_code: vendorCode,
    amount: total,
    ref_type: 'PO',
    ref_id: poId,
    trans_date: transDate.slice(0, 10),
    memo: `발주 #${poId}`,
  }
  if (existing?.length) {
    await supabaseUpdate('payable_transactions', existing[0].id!, {
      amount: total,
      trans_date: row.trans_date,
      memo: row.memo,
    })
  } else {
    await supabaseInsert('payable_transactions', row)
  }
}

export async function upsertReceivableFromOrder(params: {
  orderId: number
  storeName: string
  total: number
  transDate: string
  /** 인보이스 번호 (생략 시 IV{date}-{orderId} 자동 생성) */
  invoiceNo?: string
}): Promise<void> {
  const { orderId, storeName, total, transDate, invoiceNo } = params
  if (!orderId) return

  // 본사 정산분이 0(직접정산·지두방만 등)이면 Order 미수금 행 제거 — 과거 잘못 적재분도 정리
  if (total <= 0) {
    await supabaseDeleteByFilter(
      'receivable_transactions',
      `ref_type=eq.Order&ref_id=eq.${orderId}`
    )
    return
  }

  if (!storeName) return

  const invNo = invoiceNo || formatReceivableInvoiceNo(orderId, transDate)

  const existing = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.Order&ref_id=eq.${orderId}`,
    { limit: 1 }
  )) as { id?: number }[]
  const row = {
    store_name: storeName,
    amount: total,
    ref_type: 'Order',
    ref_id: orderId,
    trans_date: transDate.slice(0, 10),
    memo: invNo,
    invoice_no: invNo,
  }
  if (existing?.length) {
    await supabaseUpdate('receivable_transactions', existing[0].id!, {
      amount: total,
      trans_date: row.trans_date,
      memo: row.memo,
      invoice_no: invNo,
    })
  } else {
    await supabaseInsert('receivable_transactions', row)
  }
}

/**
 * 통장 연동 매입 지급(ref Payment, 지출발생 미연동) — bank_transaction_id당 1행 유지.
 * CSV 재저장·출금관리 등으로 동일 통장 건에 insert가 반복되면 미지급 내역이 중복되어 보일 수 있어 upsert.
 */
export async function upsertPayableFromBankPurchasePayment(params: {
  bankTransactionId: number
  vendorCode: string
  amountAbs: number
  transDate: string
  memo: string
}): Promise<void> {
  const { bankTransactionId, vendorCode, amountAbs, transDate, memo } = params
  if (!bankTransactionId || !vendorCode || !amountAbs) return
  const filter = `bank_transaction_id=eq.${bankTransactionId}&ref_type=eq.Payment&expense_accrual_id=is.null`
  const rows = (await supabaseSelectFilter('payable_transactions', filter, {
    order: 'id.asc',
    limit: 50,
    select: 'id',
  })) as { id?: number }[]
  const row = {
    vendor_code: vendorCode,
    amount: -Math.abs(amountAbs),
    ref_type: 'Payment' as const,
    ref_id: null as null,
    trans_date: transDate.slice(0, 10),
    memo: memo.slice(0, 240),
    bank_transaction_id: bankTransactionId,
  }
  if (rows?.length) {
    const keepId = rows[0].id
    if (keepId) {
      await supabaseUpdate('payable_transactions', keepId, {
        vendor_code: row.vendor_code,
        amount: row.amount,
        trans_date: row.trans_date,
        memo: row.memo,
      })
    }
    for (const r of rows.slice(1)) {
      if (r.id) await supabaseDeleteByFilter('payable_transactions', `id=eq.${r.id}`)
    }
  } else {
    await supabaseInsert('payable_transactions', row)
  }
}

/**
 * 통장 연동 매출 수령(ref Receive) — bank_transaction_id당 1행 유지 (미수금 중복 방지).
 */
export async function upsertReceivableFromBankReceive(params: {
  bankTransactionId: number
  storeName: string
  amountAbs: number
  transDate: string
  memo: string
}): Promise<void> {
  const { bankTransactionId, storeName, amountAbs, transDate, memo } = params
  if (!bankTransactionId || !storeName || !amountAbs) return
  const filter = `bank_transaction_id=eq.${bankTransactionId}&ref_type=eq.Receive`
  const rows = (await supabaseSelectFilter('receivable_transactions', filter, {
    order: 'id.asc',
    limit: 50,
    select: 'id',
  })) as { id?: number }[]
  const row = {
    store_name: storeName,
    amount: -Math.abs(amountAbs),
    ref_type: 'Receive' as const,
    ref_id: null as null,
    trans_date: transDate.slice(0, 10),
    memo: memo.slice(0, 240),
    bank_transaction_id: bankTransactionId,
  }
  if (rows?.length) {
    const keepId = rows[0].id
    if (keepId) {
      await supabaseUpdate('receivable_transactions', keepId, {
        store_name: row.store_name,
        amount: row.amount,
        trans_date: row.trans_date,
        memo: row.memo,
      })
    }
    for (const r of rows.slice(1)) {
      if (r.id) await supabaseDeleteByFilter('receivable_transactions', `id=eq.${r.id}`)
    }
  } else {
    await supabaseInsert('receivable_transactions', row)
  }
}
