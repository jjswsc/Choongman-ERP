import { supabaseInsert, supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpdate } from '@/lib/supabase-server'
import { postBankCardBillJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { resolveCardBillAccountSubjectId } from '@/lib/card-bill-account'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'
import {
  INTERNAL_BANK_SOURCE_MARKER,
  extractWithdrawalCategoryFromNote,
  hasCardBillQueueMarker,
  mergeCardBillQueueIntoBankNote,
} from '@/lib/bank-transaction-note-meta'
import { collectLinkedBankTransactionIds } from '@/lib/petty-bank-expense-link-server'
import { moneyEqual, parseMoneyAmount } from '@/lib/money-amount'
import { canQueueWithdrawCategoryForCardBill, memoLooksLikeCardBill } from '@/lib/card-bill-memo'

const LINKED_BANK_SCAN_MAX_ROWS = 1_000_000

export type UnlinkedBankWithdrawalForCard = {
  id: number
  transDate: string
  amount: number
  memo: string
  likelyCardBill: boolean
}

function resolvedWithdrawCategory(row: { category?: string; note?: string }): string {
  const cat = String(row.category || '').trim().toLowerCase()
  if (cat) return cat
  return String(extractWithdrawalCategoryFromNote(String(row.note || '')) || '').trim().toLowerCase()
}

export async function getUnlinkedBankWithdrawalsForCard(params: {
  accountId: number
  startStr: string
  endStr: string
}): Promise<UnlinkedBankWithdrawalForCard[]> {
  const accountId = Number(params.accountId || 0)
  const startStr = String(params.startStr || '').slice(0, 10)
  const endStr = String(params.endStr || '').slice(0, 10)
  if (!accountId || !startStr || !endStr) return []

  const filter = `account_id=eq.${accountId}&trans_type=eq.withdraw&trans_date=gte.${startStr}&trans_date=lte.${endStr}`
  const rows = (await supabaseSelectFilter('bank_transactions', filter, {
    order: 'trans_date.desc,id.desc',
    limit: 10000,
    select: 'id,trans_date,amount,memo,note,category',
  })) as { id?: number; trans_date?: string; amount?: number; memo?: string; note?: string; category?: string }[]

  if (!rows?.length) return []

  const linkedIds = await collectLinkedBankTransactionIds()

  return (rows || [])
    .filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    .filter((r) => hasCardBillQueueMarker(String(r.note || '')))
    .filter((r) => !linkedIds.has(Number(r.id || 0)))
    .map((r) => {
      const memo = String(r.memo || '').trim()
      return {
        id: Number(r.id || 0),
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(r.amount || 0)),
        memo,
        likelyCardBill: memoLooksLikeCardBill(memo),
      }
    })
    .filter((r) => r.id > 0 && r.amount > 0)
}

type BankTxRow = {
  id?: number
  trans_date?: string
  trans_type?: string
  amount?: number
  memo?: string
  note?: string
  category?: string
}

/** 지출등록(이체)에서 카드대금 연동 대기열에 넣을 출금 후보 */
export async function getBankWithdrawalsForCardBillQueueMark(params: {
  accountId: number
  startStr: string
  endStr: string
  amount?: number | null
  transDate?: string | null
}): Promise<UnlinkedBankWithdrawalForCard[]> {
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
    .filter((r) =>
      canQueueWithdrawCategoryForCardBill(resolvedWithdrawCategory(r), String(r.memo || ''))
    )
    .filter((r) => !hasCardBillQueueMarker(String(r.note || '')))
    .filter((r) => !linkedIds.has(Number(r.id || 0)))
    .map((r) => {
      const memo = String(r.memo || '').trim()
      return {
        id: Number(r.id || 0),
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: parseMoneyAmount(r.amount),
        memo,
        likelyCardBill: memoLooksLikeCardBill(memo),
      }
    })
    .filter((r) => {
      if (!(r.id > 0 && r.amount > 0)) return false
      if (amount != null && amount > 0 && !moneyEqual(r.amount, amount)) return false
      if (transDate && /^\d{4}-\d{2}-\d{2}$/.test(transDate) && r.transDate !== transDate) return false
      return true
    })
}

export async function markBankTransactionForCardBill(params: {
  bankTransactionId: number
}): Promise<{ ok: true } | { ok: false; message: string; status?: number }> {
  const bankTransactionId = Number(params.bankTransactionId || 0)
  if (!bankTransactionId) {
    return { ok: false, message: '통장 거래 ID가 필요합니다.', status: 400 }
  }

  const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
    limit: 1,
    select: 'id,trans_type,note,category,memo',
  })) as BankTxRow[] | null
  const bankRow = bankRows?.[0]
  if (!bankRow?.id) {
    return { ok: false, message: '통장 거래를 찾을 수 없습니다.', status: 404 }
  }
  if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
    return { ok: false, message: '출금 거래만 연결할 수 있습니다.', status: 400 }
  }
  if (!canQueueWithdrawCategoryForCardBill(resolvedWithdrawCategory(bankRow), String(bankRow.memo || ''))) {
    return { ok: false, message: '이체(transfer) 구분 출금만 카드대금 연동 대기열에 넣을 수 있습니다.', status: 400 }
  }

  const linkedIds = await collectLinkedBankTransactionIds()
  if (linkedIds.has(bankTransactionId)) {
    return { ok: false, message: '이미 지출·매입 또는 카드와 연결된 통장 거래입니다.', status: 400 }
  }
  if (hasCardBillQueueMarker(String(bankRow.note || ''))) {
    return { ok: true }
  }

  await supabaseUpdate('bank_transactions', bankTransactionId, {
    note: mergeCardBillQueueIntoBankNote(String(bankRow.note || '')),
    category: 'transfer',
    updated_at: new Date().toISOString(),
  })

  return { ok: true }
}

export async function registerCardExpenseFromBankTransaction(params: {
  bankTransactionId: number
  cardAccountId: number
  accountSubjectId?: number | null
  memo?: string | null
  note?: string | null
  postedBy?: string | null
}): Promise<{ ok: true; id: number } | { ok: false; message: string; status?: number }> {
  const bankTransactionId = Number(params.bankTransactionId || 0)
  const cardAccountId = Number(params.cardAccountId || 0)
  if (!bankTransactionId || !cardAccountId) {
    return { ok: false, message: '통장 거래 ID와 카드가 필요합니다.', status: 400 }
  }

  if (params.accountSubjectId != null && !isNaN(Number(params.accountSubjectId))) {
    const hdr = await assertAccountSubjectNotHeader(Number(params.accountSubjectId))
    if (!hdr.ok) {
      return { ok: false, message: hdr.message, status: hdr.status }
    }
  }

  const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
    limit: 1,
    select: 'id,trans_date,trans_type,amount,memo',
  })) as BankTxRow[] | null
  const bankRow = bankRows?.[0]
  if (!bankRow?.id) {
    return { ok: false, message: '통장 거래를 찾을 수 없습니다.', status: 404 }
  }
  if (String(bankRow.trans_type || '').toLowerCase() !== 'withdraw') {
    return { ok: false, message: '출금 거래만 연결할 수 있습니다.', status: 400 }
  }

  const amount = parseMoneyAmount(bankRow.amount)
  const transDate = String(bankRow.trans_date || '').slice(0, 10)
  if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
    return { ok: false, message: '통장 거래 정보가 올바르지 않습니다.', status: 400 }
  }

  const [payableLinked, cardLinked] = await Promise.all([
    supabaseSelectFilter('payable_transactions', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1, select: 'id' }),
    supabaseSelectFilter('card_transactions', `bank_transaction_id=eq.${bankTransactionId}`, { limit: 1, select: 'id' }),
  ])
  if ((payableLinked as { id?: number }[] | null)?.length) {
    return {
      ok: false,
      message: '이미 지출·매입 관리에 연결된 통장 거래입니다. 카드 지출로 중복 등록할 수 없습니다.',
      status: 400,
    }
  }
  if ((cardLinked as { id?: number }[] | null)?.length) {
    return { ok: false, message: '이미 카드 거래와 연결된 통장 출금입니다.', status: 400 }
  }

  const cardAccounts = (await supabaseSelectFilter('card_accounts', `id=eq.${cardAccountId}`, {
    limit: 1,
    select: 'id',
  })) as { id?: number }[] | null
  if (!cardAccounts?.[0]?.id) {
    return { ok: false, message: '카드를 찾을 수 없습니다.', status: 404 }
  }

  const bankMemo = String(bankRow.memo || '').trim()
  const userMemo = params.memo != null ? String(params.memo || '').trim() : bankMemo
  let accountSubjectId =
    params.accountSubjectId != null && !isNaN(Number(params.accountSubjectId))
      ? Number(params.accountSubjectId)
      : null
  if (accountSubjectId == null) {
    accountSubjectId = await resolveCardBillAccountSubjectId()
  }

  const inserted = (await supabaseInsert('card_transactions', {
    card_account_id: cardAccountId,
    trans_date: transDate,
    trans_type: 'expense',
    amount,
    memo: userMemo || (bankMemo ? `카드대금: ${bankMemo}`.slice(0, 240) : '카드대금(통장연동)'),
    bank_transaction_id: bankTransactionId,
    account_subject_id: null,
    note: CARD_BILL_HEADER_NOTE,
    is_bill_header: true,
    parent_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })) as { id?: number }[]

  const newId = Number(inserted?.[0]?.id || 0)
  if (!newId) {
    return { ok: false, message: '카드 지출 등록에 실패했습니다.', status: 500 }
  }

  try {
    await postBankCardBillJournal({
      bankTransactionId,
      transDate,
      amountAbs: amount,
      memo: userMemo || bankMemo || '카드대금(통장연동)',
      accountSubjectId,
      postedBy: params.postedBy || undefined,
    })
    await supabaseUpdate('bank_transactions', bankTransactionId, {
      account_subject_id: accountSubjectId,
      category: 'transfer',
    })
  } catch (postingErr) {
    console.error('registerCardExpenseFromBankTransaction posting:', postingErr)
  }

  return { ok: true, id: newId }
}
