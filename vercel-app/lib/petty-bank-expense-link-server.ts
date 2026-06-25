import { supabaseInsert, supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpdate } from '@/lib/supabase-server'
import { postWithdrawalJournal } from '@/lib/accounting-posting'
import {
  extractWithdrawalCategoryFromNote,
  hasPettyCashQueueMarker,
  mergePettyCashQueueIntoBankNote,
  mergeWithdrawalCategoryIntoBankNote,
} from '@/lib/bank-transaction-note-meta'
import { moneyEqual, parseMoneyAmount } from '@/lib/money-amount'

const INTERNAL_BANK_SOURCE_MARKER = 'source:expense_internal'
const LINKED_BANK_SCAN_MAX_ROWS = 1_000_000

/** 패티캐시 보충·이체 키워드 (통장 적요 필터·힌트용) */
export const PETTY_CASH_MEMO_KEYWORDS = [
  'petty',
  'petty cash',
  'cash float',
  'replenish',
  '패티',
  '패티캐시',
  '패티캐쉬',
  '소액',
  '보충',
  '시재',
] as const

export type UnlinkedBankWithdrawalForPetty = {
  id: number
  transDate: string
  amount: number
  memo: string
  likelyPettyCash: boolean
}

function memoLikelyPettyCash(memo: string): boolean {
  const lower = memo.toLowerCase()
  return PETTY_CASH_MEMO_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
}

type BankTxRow = {
  id?: number
  trans_date?: string
  trans_type?: string
  amount?: number
  memo?: string
  note?: string
  category?: string
  store?: string | null
}

function isTransferBankWithdrawal(row: { category?: string; note?: string }): boolean {
  const cat = String(row.category || '').trim().toLowerCase()
  if (cat === 'transfer' || cat.startsWith('transfer_')) return true
  const fromNote = extractWithdrawalCategoryFromNote(String(row.note || ''))
  return fromNote === 'transfer' || (fromNote?.startsWith('transfer_') ?? false)
}

export async function collectLinkedBankTransactionIds(): Promise<Set<number>> {
  const [payableRows, cardRows, pettyRows] = await Promise.all([
    supabaseSelectFilterAllPages('payable_transactions', 'bank_transaction_id=not.is.null', {
      select: 'bank_transaction_id',
      pageSize: 8000,
      maxRows: LINKED_BANK_SCAN_MAX_ROWS,
    }) as Promise<{ bank_transaction_id?: number }[]>,
    supabaseSelectFilterAllPages('card_transactions', 'bank_transaction_id=not.is.null', {
      select: 'bank_transaction_id',
      pageSize: 8000,
      maxRows: LINKED_BANK_SCAN_MAX_ROWS,
    }) as Promise<{ bank_transaction_id?: number }[]>,
    supabaseSelectFilterAllPages('petty_cash_transactions', 'bank_transaction_id=not.is.null', {
      select: 'bank_transaction_id',
      pageSize: 8000,
      maxRows: LINKED_BANK_SCAN_MAX_ROWS,
    }) as Promise<{ bank_transaction_id?: number }[]>,
  ])
  const linkedIds = new Set<number>()
  for (const r of [...(payableRows || []), ...(cardRows || []), ...(pettyRows || [])]) {
    const bid = Number(r.bank_transaction_id || 0)
    if (bid > 0) linkedIds.add(bid)
  }
  return linkedIds
}

/** 패티캐시 탭 — 대기열에 등록된 통장 이체 출금 */
export async function getUnlinkedBankWithdrawalsForPetty(params: {
  accountId: number
  startStr: string
  endStr: string
}): Promise<UnlinkedBankWithdrawalForPetty[]> {
  const accountId = Number(params.accountId || 0)
  const startStr = String(params.startStr || '').slice(0, 10)
  const endStr = String(params.endStr || '').slice(0, 10)
  if (!accountId || !startStr || !endStr) return []

  const filter = `account_id=eq.${accountId}&trans_type=eq.withdraw&trans_date=gte.${startStr}&trans_date=lte.${endStr}`
  const rows = (await supabaseSelectFilter('bank_transactions', filter, {
    order: 'trans_date.desc,id.desc',
    limit: 10000,
    select: 'id,trans_date,amount,memo,note,category',
  })) as BankTxRow[]

  if (!rows?.length) return []

  const linkedIds = await collectLinkedBankTransactionIds()

  return (rows || [])
    .filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    .filter((r) => hasPettyCashQueueMarker(String(r.note || '')))
    .filter((r) => !linkedIds.has(Number(r.id || 0)))
    .map((r) => {
      const memo = String(r.memo || '').trim()
      return {
        id: Number(r.id || 0),
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(r.amount || 0)),
        memo,
        likelyPettyCash: memoLikelyPettyCash(memo),
      }
    })
    .filter((r) => r.id > 0 && r.amount > 0)
}

/** 지출등록(이체)에서 패티캐시 연동 대기열에 넣을 이체 출금 후보 */
export async function getBankWithdrawalsForPettyQueueMark(params: {
  accountId: number
  startStr: string
  endStr: string
  amount?: number | null
  transDate?: string | null
}): Promise<UnlinkedBankWithdrawalForPetty[]> {
  const accountId = Number(params.accountId || 0)
  const startStr = String(params.startStr || '').slice(0, 10)
  const endStr = String(params.endStr || '').slice(0, 10)
  if (!accountId || !startStr || !endStr) return []

  const filter = `account_id=eq.${accountId}&trans_type=eq.withdraw&trans_date=gte.${startStr}&trans_date=lte.${endStr}`
  const rows = (await supabaseSelectFilter('bank_transactions', filter, {
    order: 'trans_date.desc,id.desc',
    limit: 10000,
    select: 'id,trans_date,amount,memo,note,category',
  })) as BankTxRow[]

  if (!rows?.length) return []

  const linkedIds = await collectLinkedBankTransactionIds()
  const amount = params.amount != null ? parseMoneyAmount(params.amount) : null
  const transDate = String(params.transDate || '').slice(0, 10)

  return (rows || [])
    .filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    .filter((r) => isTransferBankWithdrawal(r))
    .filter((r) => !hasPettyCashQueueMarker(String(r.note || '')))
    .filter((r) => !linkedIds.has(Number(r.id || 0)))
    .map((r) => {
      const memo = String(r.memo || '').trim()
      return {
        id: Number(r.id || 0),
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: parseMoneyAmount(r.amount),
        memo,
        likelyPettyCash: memoLikelyPettyCash(memo),
      }
    })
    .filter((r) => {
      if (!(r.id > 0 && r.amount > 0)) return false
      if (amount != null && amount > 0 && !moneyEqual(r.amount, amount)) return false
      if (transDate && /^\d{4}-\d{2}-\d{2}$/.test(transDate) && r.transDate !== transDate) return false
      return true
    })
}

export async function markBankTransactionForPettyCash(params: {
  bankTransactionId: number
}): Promise<{ ok: true } | { ok: false; message: string; status?: number }> {
  const bankTransactionId = Number(params.bankTransactionId || 0)
  if (!bankTransactionId) {
    return { ok: false, message: '통장 거래 ID가 필요합니다.', status: 400 }
  }

  const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
    limit: 1,
    select: 'id,trans_type,note,category',
  })) as BankTxRow[] | null
  const bankRow = bankRows?.[0]
  if (!bankRow?.id) {
    return { ok: false, message: '통장 거래를 찾을 수 없습니다.', status: 404 }
  }
  if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
    return { ok: false, message: '출금 거래만 연결할 수 있습니다.', status: 400 }
  }
  if (!isTransferBankWithdrawal(bankRow)) {
    return { ok: false, message: '이체(transfer) 구분 출금만 패티캐시 연동 대기열에 넣을 수 있습니다.', status: 400 }
  }

  const linkedIds = await collectLinkedBankTransactionIds()
  if (linkedIds.has(bankTransactionId)) {
    return { ok: false, message: '이미 지출·매입·카드·패티캐시와 연결된 통장 거래입니다.', status: 400 }
  }
  if (hasPettyCashQueueMarker(String(bankRow.note || ''))) {
    return { ok: true }
  }

  await supabaseUpdate('bank_transactions', bankTransactionId, {
    note: mergePettyCashQueueIntoBankNote(String(bankRow.note || '')),
    category: 'transfer',
    updated_at: new Date().toISOString(),
  })

  return { ok: true }
}

export async function registerPettyReplenishFromBankTransaction(params: {
  bankTransactionId: number
  store: string
  memo?: string | null
  postedBy?: string | null
  userEmployeeId?: number | null
  userEmployeeCode?: string | null
  /** 지급예정(보충 청구) → 통장 연동 시 이체 구분·대기열 없이 허용 */
  fromExpenseAccrualId?: number | null
}): Promise<{ ok: true; id: number } | { ok: false; message: string; status?: number }> {
  const bankTransactionId = Number(params.bankTransactionId || 0)
  const store = String(params.store || '').trim()
  if (!bankTransactionId || !store) {
    return { ok: false, message: '통장 거래 ID와 매장이 필요합니다.', status: 400 }
  }

  const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
    limit: 1,
    select: 'id,trans_date,trans_type,amount,memo,note,store',
  })) as BankTxRow[] | null
  const bankRow = bankRows?.[0]
  if (!bankRow?.id) {
    return { ok: false, message: '통장 거래를 찾을 수 없습니다.', status: 404 }
  }
  if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
    return { ok: false, message: '출금 거래만 연결할 수 있습니다.', status: 400 }
  }
  const fromAccrualId = Number(params.fromExpenseAccrualId || 0)
  const fromExpenseAccrual = fromAccrualId > 0
  if (
    !isTransferBankWithdrawal(bankRow) &&
    !hasPettyCashQueueMarker(String(bankRow.note || '')) &&
    !fromExpenseAccrual
  ) {
    return { ok: false, message: '이체(transfer) 구분 출금만 패티캐시 보충으로 연결할 수 있습니다.', status: 400 }
  }

  const amount = parseMoneyAmount(bankRow.amount)
  const transDate = String(bankRow.trans_date || '').slice(0, 10)
  if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
    return { ok: false, message: '통장 거래 정보가 올바르지 않습니다.', status: 400 }
  }

  const linkedIds = await collectLinkedBankTransactionIds()
  if (linkedIds.has(bankTransactionId)) {
    return { ok: false, message: '이미 다른 내역과 연결된 통장 출금입니다.', status: 400 }
  }

  const bankMemo = String(bankRow.memo || '').trim()
  const userMemo = params.memo != null ? String(params.memo || '').trim() : bankMemo
  const replenishMemo = userMemo
    ? `통장이체: ${userMemo.slice(0, 200)}`
    : '통장이체'

  const row: Record<string, unknown> = {
    store,
    trans_date: transDate,
    trans_type: 'replenish',
    amount,
    memo: replenishMemo,
    bank_transaction_id: bankTransactionId,
    user_name: params.postedBy || null,
  }
  if (params.userEmployeeId != null && Number.isFinite(Number(params.userEmployeeId))) {
    row.user_employee_id = Math.floor(Number(params.userEmployeeId))
  }
  if (params.userEmployeeCode) row.user_employee_code = params.userEmployeeCode

  let inserted: { id?: number }[] = []
  try {
    inserted = (await supabaseInsert('petty_cash_transactions', row)) as { id?: number }[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (msg.includes('bank_transaction_id')) {
      return {
        ok: false,
        message: 'DB에 bank_transaction_id 컬럼이 없습니다. sql/petty_cash_bank_link.sql을 실행해 주세요.',
        status: 500,
      }
    }
    if (msg.includes('user_employee_id') || msg.includes('user_employee_code')) {
      delete row.user_employee_id
      delete row.user_employee_code
      inserted = (await supabaseInsert('petty_cash_transactions', row)) as { id?: number }[]
    } else {
      throw e
    }
  }

  const pettyId = Number(inserted?.[0]?.id || 0)
  if (!pettyId) {
    return { ok: false, message: '패티캐시 보충 등록에 실패했습니다.', status: 500 }
  }

  const bankStore = String(bankRow.store || '').trim() || store
  let noteBase = String(bankRow.note || '').replace(/\s*\|\s*petty_cash_queue\b/gi, '').trim()
  if (fromExpenseAccrual) {
    noteBase = noteBase
      ? `${noteBase};expense_accrual_id:${fromAccrualId};withdrawal_category:transfer_to_petty`
      : `expense_accrual_id:${fromAccrualId};withdrawal_category:transfer_to_petty`
  }
  const categoryNote = mergeWithdrawalCategoryIntoBankNote(noteBase, 'transfer_to_petty')

  try {
    await postWithdrawalJournal({
      sourceType: 'bank_transaction',
      sourceId: bankTransactionId,
      category: 'transfer_to_petty',
      accountingDate: transDate,
      amountAbs: amount,
      memo: userMemo || bankMemo || '패티캐시 보충(통장연동)',
      storeName: bankStore,
      postedBy: params.postedBy || undefined,
      transferToPettyStore: store,
    })
    await supabaseUpdate('bank_transactions', bankTransactionId, {
      note: categoryNote,
      category: 'transfer',
      store: bankStore || null,
    })
  } catch (postingErr) {
    console.error('registerPettyReplenishFromBankTransaction posting:', postingErr)
  }

  return { ok: true, id: pettyId }
}
