/**
 * 통장 입금 vs POS 자동분개(4110/1130) 이중 인식 가드.
 */
import { isPosChannelSettlementMemo } from '@/lib/bank-import-deposit-category'
import { expandStoreVariantsForGrade } from '@/lib/grade-store-key-variants'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const POS_REVENUE_DEPOSIT_CATEGORIES = new Set([
  'revenue_delivery',
  'revenue_card',
  'revenue_qr',
  'revenue_cash',
])

export class BankSettlementGuardError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message)
    this.name = 'BankSettlementGuardError'
  }
}

/** Next.js 번들 중복 시 instanceof 가 실패할 수 있어 code/name 으로도 판별 */
export function isBankSettlementGuardError(e: unknown): e is BankSettlementGuardError {
  if (e instanceof BankSettlementGuardError) return true
  if (!e || typeof e !== 'object') return false
  const o = e as { name?: string; code?: string }
  return o.name === 'BankSettlementGuardError' && typeof o.code === 'string'
}

export type PosRevenueDepositGuardVerdict = 'allow' | 'require_store' | 'check_pos_orders'

/**
 * revenue_* 저장 여부 — DB 조회 없이 판정.
 * POS 매장은 채널 세부 GL(4111·4120 등)이어도 revenue_* 금지 (4110 이중).
 */
export function classifyPosRevenueDepositGuard(params: {
  category: string
  storeName?: string | null
  memo?: string | null
}): PosRevenueDepositGuardVerdict {
  const cat = String(params.category || '').toLowerCase()
  if (!POS_REVENUE_DEPOSIT_CATEGORIES.has(cat)) return 'allow'
  const store = String(params.storeName || '').trim()
  if (!store) {
    return isPosChannelSettlementMemo(params.memo) ? 'require_store' : 'allow'
  }
  return 'check_pos_orders'
}

/** 동일 통장 입금에 채널 정산이 이미 연결된 경우 receivable_receive 등 금지 */
export async function assertBankNotUsedByChannelSettlement(bankTransactionId: number): Promise<void> {
  if (!bankTransactionId || bankTransactionId <= 0) return
  const rows = (await supabaseSelectFilter(
    'pos_channel_settlements',
    `bank_transaction_id=eq.${bankTransactionId}`,
    { select: 'id,store_code,settle_date,channel', limit: 5 }
  )) as { id?: number; store_code?: string; settle_date?: string; channel?: string }[] | null
  if (rows?.length) {
    const s = rows[0]
    throw new BankSettlementGuardError(
      `이 통장 입금은 이미 POS 채널 정산(#${s.id}, ${s.store_code} ${s.settle_date} ${s.channel})에 연결되어 있습니다. 매출 수령(receivable_receive)과 채널 정산을 동시에 쓸 수 없습니다.`,
      'BANK_LINKED_TO_CHANNEL_SETTLEMENT'
    )
  }
}

/** 채널 정산에 통장 연결 시 매출 수령 분류인지 검사 */
export async function assertBankDepositAllowedForChannelSettlement(
  bankTransactionId: number
): Promise<void> {
  if (!bankTransactionId || bankTransactionId <= 0) return
  const rows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
    select: 'id,category,trans_type',
    limit: 1,
  })) as { id?: number; category?: string; trans_type?: string }[] | null
  const row = rows?.[0]
  if (!row?.id) return
  if (String(row.trans_type || '').toLowerCase() !== 'deposit') {
    throw new BankSettlementGuardError('채널 정산에는 입금 거래만 연결할 수 있습니다.', 'BANK_NOT_DEPOSIT')
  }
  const cat = String(row.category || '').toLowerCase()
  if (cat === 'receivable_receive') {
    throw new BankSettlementGuardError(
      '매출 수령(receivable_receive)으로 분류된 통장 입금에는 채널 정산을 연결할 수 없습니다. 용도를 변경하거나 채널 정산만 사용하세요.',
      'BANK_RECEIVABLE_RECEIVE_CONFLICT'
    )
  }
}

/** POS 완료 주문이 있는 매장인지 (store_code 별칭 CM 접두 포함) */
export async function storeHasPosCompletedOrders(storeName: string): Promise<boolean> {
  const variants = expandStoreVariantsForGrade(String(storeName || '').trim())
  for (const code of variants) {
    if (!code) continue
    const orders = (await supabaseSelectFilter(
      'pos_orders',
      `store_code=eq.${encodeURIComponent(code)}&status=in.(completed,paid,ready)`,
      { select: 'id', limit: 1 }
    )) as { id?: number }[] | null
    if (orders?.length) return true
  }
  return false
}

/** POS 매출 이중 위험: 완료 주문이 있는 매장은 revenue_* 입금 분류 차단 */
export async function assertPosRevenueDepositCategorySafe(params: {
  storeName: string
  category: string
  memo?: string | null
}): Promise<void> {
  const verdict = classifyPosRevenueDepositGuard({
    category: params.category,
    storeName: params.storeName,
    memo: params.memo,
  })
  if (verdict === 'allow') return
  if (verdict === 'require_store') {
    throw new BankSettlementGuardError(
      BANK_REVENUE_DEPOSIT_STORE_REQUIRED_MESSAGE,
      'BANK_REVENUE_DEPOSIT_STORE_REQUIRED'
    )
  }
  const store = String(params.storeName || '').trim()
  if (await storeHasPosCompletedOrders(store)) {
    const cat = String(params.category || '').toLowerCase()
    throw new BankSettlementGuardError(
      posRevenueDepositDoubleRiskMessage(store, cat),
      'POS_REVENUE_DEPOSIT_DOUBLE_RISK'
    )
  }
}

export const BANK_REVENUE_DEPOSIT_STORE_REQUIRED_MESSAGE =
  'Grab·카드·QR 등 채널 정산 입금은 매장을 지정하고 매출 수령(receivable_receive) 또는 채널 정산으로 저장하세요. 매장 없이 revenue_* 로 넣을 수 없습니다.'

export function posRevenueDepositDoubleRiskMessage(store: string, category: string): string {
  return `매장「${store}」에 POS 완료 주문이 있어 입금 분류「${category}」은 매출(4110) 이중 인식 위험이 있습니다. 카드·배달 입금은 채널 정산을, 가맹 수금은 매출 수령(receivable_receive)을 사용하세요.`
}

/** 조회 탭에서 메모만 바꿀 때는 옛 revenue_* 를 다시 막지 않음 */
export function shouldAssertPosRevenueDepositOnBankUpdate(categoryInPayload: boolean): boolean {
  return categoryInPayload
}
