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
import { shouldCreateFranchiseReceivableSubledgerFromBankReceive } from './franchise-receivable-subledger-gate'
import { storeHasPosCompletedOrders } from './bank-settlement-guards'
import { formatReceivableInvoiceNo } from './receivable-invoice-format'
import {
  isAccountingPurchaseOrderByCartJson,
  purchaseOrderMetaOrderDate,
  resolveAccountingPoReceivableStoreName,
} from './purchase-order-cart'

export { formatReceivableInvoiceNo }

/** @deprecated 매입채무는 입고(Inbound) 기준. 신규 PO 미지급 행을 만들지 않는다. */
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

/** 입고 등록·발주 취소·승인 재동기화 시 ref_type=PO 미지급 행 제거 */
export async function deletePayableFromPO(poId: number): Promise<void> {
  if (!poId) return
  await supabaseDeleteByFilter('payable_transactions', `ref_type=eq.PO&ref_id=eq.${poId}`)
}

/**
 * 발주 승인·재동기화 시 PO 미지급 행 정리.
 * 매입채무는 입고 등록(Inbound) 시에만 생성한다 — 발주 승인으로 payable_transactions PO 행을 만들지 않는다.
 */
export async function syncPayableFromApprovedPo(poId: number): Promise<void> {
  if (!poId) return
  await deletePayableFromPO(poId)
}

export async function deleteReceivableFromAccountingPo(poId: number): Promise<void> {
  if (!poId) return
  await supabaseDeleteByFilter('receivable_transactions', `ref_type=eq.AccountingPO&ref_id=eq.${poId}`)
}

/**
 * Tax Invoice 인쇄 화면에서 저장된 issueDate(invoice_settings의 invoice_print_override:tax:*)를 조회.
 * - 미수금 행 ref_type별로 매칭되는 모든 코드를 시도해 최초 유효한 YYYY-MM-DD를 반환.
 * - AccountingPO 행은 UI 흐름상 sourceRefType이 'PO'로 저장되거나 'AccountingPO'로 저장될 수 있어 둘 다 조회.
 */
async function readTaxInvoiceIssueDateOverride(
  refType: 'Order' | 'ForceOutbound' | 'AccountingPO' | 'PO',
  refId: number
): Promise<string | null> {
  if (!refId || !Number.isFinite(refId)) return null
  const codes =
    refType === 'AccountingPO' || refType === 'PO'
      ? [
          `invoice_print_override:tax:PO:${refId}`,
          `invoice_print_override:tax:AccountingPO:${refId}`,
        ]
      : [`invoice_print_override:tax:${refType}:${refId}`]
  for (const code of codes) {
    try {
      const rows = (await supabaseSelectFilter(
        'invoice_settings',
        `code=eq.${encodeURIComponent(code)}`,
        { select: 'value', limit: 1 }
      )) as { value?: string }[] | null
      if (!rows?.length) continue
      const parsed = JSON.parse(String(rows[0].value || '{}')) as { issueDate?: string }
      const issueDate = String(parsed.issueDate || '').trim().slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return issueDate
    } catch {
      /* malformed override는 무시하고 다음 후보 시도 */
    }
  }
  return null
}

/**
 * 회계 전용 발주(cart_json 메타) 승인 → 미수금 1건(ref AccountingPO).
 * 물류 PO는 호출 시 기존 AccountingPO 행만 정리한다.
 */
export async function syncReceivableFromApprovedAccountingPo(poId: number): Promise<void> {
  if (!poId) return
  const rows = (await supabaseSelectFilter('purchase_orders', `id=eq.${poId}`, { limit: 1 })) as {
    status?: string
    cart_json?: string
    total?: number
    withholding_tax_amount?: number | null
    created_at?: string
    po_no?: string
    location_name?: string
  }[]
  if (!rows?.length) return
  const po = rows[0]

  if (!isAccountingPurchaseOrderByCartJson(po.cart_json)) {
    await deleteReceivableFromAccountingPo(poId)
    return
  }
  if (po.status !== 'Approved') {
    await deleteReceivableFromAccountingPo(poId)
    return
  }

  const total = Number(po.total) || 0
  const wht = Math.max(0, Number(po.withholding_tax_amount) || 0)
  const net = Math.round((total - wht) * 100) / 100

  const metaYmd = purchaseOrderMetaOrderDate(po.cart_json)
  const fallbackTransDate = metaYmd
    ? metaYmd
    : po.created_at && !isNaN(Date.parse(String(po.created_at)))
      ? new Date(po.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
      : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

  // Tax Invoice 인쇄 화면에서 발행일을 수정한 경우, PO 재저장 시 그 값을 우선 사용해 trans_date·invoice_no 원복을 방지
  const overrideTransDate = await readTaxInvoiceIssueDateOverride('AccountingPO', poId)
  const transDate = overrideTransDate || fallbackTransDate

  const storeName = resolveAccountingPoReceivableStoreName(po)

  if (!storeName || net <= 0) {
    await deleteReceivableFromAccountingPo(poId)
    return
  }

  const datePart = String(transDate).replace(/\D/g, '').slice(0, 8)
  const invNo = `APO${datePart}-${poId}`
  const memoBase = String(po.po_no || '').trim() || `PO #${poId}`
  const memo = `회계발주 ${memoBase}`

  const existing = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.AccountingPO&ref_id=eq.${poId}`,
    { limit: 1 }
  )) as { id?: number }[]
  const row = {
    store_name: storeName,
    amount: net,
    ref_type: 'AccountingPO',
    ref_id: poId,
    trans_date: transDate.slice(0, 10),
    memo,
    invoice_no: invNo,
  }
  if (existing?.length) {
    await supabaseUpdate('receivable_transactions', existing[0].id!, {
      store_name: storeName,
      amount: net,
      trans_date: row.trans_date,
      memo,
      invoice_no: invNo,
    })
  } else {
    await supabaseInsert('receivable_transactions', row)
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
 * Tax Invoice 인쇄 화면(Update)에서 저장한 날짜·문서번호를 미수금/엑셀에도 반영.
 * (invoice_print_override는 invoice_settings에만 있고 receivable은 갱신되지 않던 문제)
 *
 * 지원 refType:
 *  - 'Order'         → receivable_transactions.ref_type='Order' (invoice_no/memo는 docNo로 갱신)
 *  - 'ForceOutbound' → receivable_transactions.ref_type='ForceOutbound' (invoice_no/memo는 docNo로 갱신)
 *  - 'AccountingPO' / 'PO' → receivable_transactions.ref_type='AccountingPO' (invoice_no는 APO{YYYYMMDD}-{poId}로 재생성)
 */
export async function applyTaxInvoiceOverrideToReceivable(params: {
  refType: string
  refId: number
  issueDate: string
  documentNo?: string
}): Promise<void> {
  const refTypeRaw = String(params.refType || '').trim()
  const refId = Number(params.refId)
  if (refId <= 0 || !Number.isFinite(refId)) return

  let receivableRefType: 'Order' | 'ForceOutbound' | 'AccountingPO'
  if (refTypeRaw === 'Order') receivableRefType = 'Order'
  else if (refTypeRaw === 'ForceOutbound') receivableRefType = 'ForceOutbound'
  else if (refTypeRaw === 'AccountingPO' || refTypeRaw === 'PO') receivableRefType = 'AccountingPO'
  else return

  const transDate = String(params.issueDate || '')
    .trim()
    .slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) return

  const existing = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.${receivableRefType}&ref_id=eq.${refId}`,
    { limit: 1 }
  )) as { id?: number }[]

  if (!existing?.length || !existing[0].id) return

  const docNo = String(params.documentNo || '').trim()
  const patch: Record<string, string> = { trans_date: transDate }

  if (receivableRefType === 'AccountingPO') {
    // 회계발주 invoice_no 패턴 APO{YYYYMMDD}-{poId} — 날짜 변경 시 자동 재생성해 표시 일관성 유지
    const dateDigits = transDate.replace(/\D/g, '').slice(0, 8)
    if (dateDigits.length === 8) {
      patch.invoice_no = `APO${dateDigits}-${refId}`
    }
  } else if (docNo) {
    patch.invoice_no = docNo
    patch.memo = receivableRefType === 'Order' ? docNo : `강제출고 ${docNo}`
  }

  await supabaseUpdate('receivable_transactions', existing[0].id, patch)
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
 * 통장 `receivable_receive` 저장 시 본사 B2B 미수금 보조원장(Receive) 생성 여부.
 * POS 매장이라도 채널 정산 적요(Grab·카드·QR 등)가 아니면 B2B 수금으로 보조원장에 반영한다.
 * @see docs/ACCOUNTING_LEDGER_SOP.md §2–3
 */
export async function shouldUpsertFranchiseReceivableSubledger(params: {
  storeName: string
  memo?: string | null
  bankTransactionId?: number
}): Promise<boolean> {
  const store = String(params.storeName || '').trim()
  if (!store) return false

  let linkedToChannelSettlement = false
  const bankTransactionId = Number(params.bankTransactionId || 0)
  if (bankTransactionId > 0) {
    const linked = (await supabaseSelectFilter(
      'pos_channel_settlements',
      `bank_transaction_id=eq.${bankTransactionId}`,
      { select: 'id', limit: 1 }
    )) as { id?: number }[] | null
    linkedToChannelSettlement = Boolean(linked?.length)
  }

  return shouldCreateFranchiseReceivableSubledgerFromBankReceive({
    linkedToChannelSettlement,
    hasPosCompletedOrders: await storeHasPosCompletedOrders(store),
    memo: params.memo,
  })
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
  if (!(await shouldUpsertFranchiseReceivableSubledger({ storeName, memo, bankTransactionId }))) {
    await deleteReceivableFromBankReceive({ bankTransactionId, storeName, amountAbs, transDate, memo })
    return
  }
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

/**
 * 통장 입금 연동 미수금(ref Receive) 정리.
 * - 1차: bank_transaction_id 일치 행 삭제
 * - 2차: 과거 레거시 데이터(bank_transaction_id null) 중 자동 생성 패턴 행 삭제
 */
export async function deleteReceivableFromBankReceive(params: {
  bankTransactionId: number
  storeName?: string | null
  amountAbs?: number
  transDate?: string
  memo?: string
}): Promise<void> {
  const bankTransactionId = Number(params.bankTransactionId || 0)
  if (!bankTransactionId) return

  await supabaseDeleteByFilter('receivable_transactions', `bank_transaction_id=eq.${bankTransactionId}`)

  const transDate = String(params.transDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transDate)) return

  const amountAbs = Math.abs(Number(params.amountAbs) || 0)
  const legacyFilterParts = [
    'bank_transaction_id=is.null',
    'ref_type=eq.Receive',
    'ref_id=is.null',
    `trans_date=eq.${transDate}`,
  ]
  if (amountAbs > 0) {
    legacyFilterParts.push(`amount=eq.${-amountAbs}`)
  }
  const storeName = String(params.storeName || '').trim()
  if (storeName) {
    legacyFilterParts.push(`store_name=eq.${encodeURIComponent(storeName)}`)
  }

  const legacyRows = (await supabaseSelectFilter('receivable_transactions', legacyFilterParts.join('&'), {
    select: 'id,memo',
    order: 'id.asc',
    limit: 100,
  })) as { id?: number; memo?: string | null }[] | null

  const expectedMemo = String(params.memo || '').trim()
  const legacyIds = (legacyRows || [])
    .filter((row) => {
      const memo = String(row.memo || '').trim()
      if (memo === '통장 수령') return true
      if (expectedMemo && memo === expectedMemo) return true
      return memo.startsWith('통장 수령:')
    })
    .map((row) => Number(row.id || 0))
    .filter((id) => id > 0)

  for (const id of legacyIds) {
    await supabaseDeleteByFilter('receivable_transactions', `id=eq.${id}`)
  }
}
