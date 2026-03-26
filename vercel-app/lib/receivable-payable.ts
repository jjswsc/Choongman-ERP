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

/** 인보이스 번호 생성: IV{yyyymmdd}-{orderId} (출고 관리와 동일 형식) */
export function formatReceivableInvoiceNo(orderId: number, transDate: string): string {
  const datePart = String(transDate || '').replace(/\D/g, '').slice(0, 8) || new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `IV${datePart}-${orderId}`
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
