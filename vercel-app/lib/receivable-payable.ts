/**
 * 미수금/미지급금 upsert 로직
 * - 주문 승인/수정, 발주 승인/수정 시 트랜잭션 생성 또는 업데이트
 * - (ref_type, ref_id) 유니크: 있으면 UPDATE, 없으면 INSERT
 */
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
} from './supabase-server'

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
}): Promise<void> {
  const { orderId, storeName, total, transDate } = params
  if (!storeName || total <= 0) return

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
    memo: `주문 #${orderId}`,
  }
  if (existing?.length) {
    await supabaseUpdate('receivable_transactions', existing[0].id!, {
      amount: total,
      trans_date: row.trans_date,
      memo: row.memo,
    })
  } else {
    await supabaseInsert('receivable_transactions', row)
  }
}
