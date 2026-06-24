import { supabaseInsert, supabaseSelectFilter, supabaseSelectFilterAllPages, supabaseUpdate } from '@/lib/supabase-server'
import { postBankCardBillJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { resolveCardBillAccountSubjectId } from '@/lib/card-bill-account'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'

const INTERNAL_BANK_SOURCE_MARKER = 'source:expense_internal'
const LINKED_BANK_SCAN_MAX_ROWS = 1_000_000

/** 카드사·카드대금 키워드 (통장 적요 필터·힌트용) */
export const CARD_BILL_MEMO_KEYWORDS = [
  'card',
  'credit',
  'visa',
  'master',
  'kbank',
  'k-bank',
  'kasikorn',
  'scb',
  'bbl',
  'ktb',
  'tmb',
  'ttb',
  'uob',
  'cimb',
  'bay',
  'krungthai',
  '카드',
  '신용',
  '체크',
  'creditcard',
  'cr card',
  'card payment',
  'card pymt',
] as const

export type UnlinkedBankWithdrawalForCard = {
  id: number
  transDate: string
  amount: number
  memo: string
  likelyCardBill: boolean
}

function memoLikelyCardBill(memo: string): boolean {
  const lower = memo.toLowerCase()
  return CARD_BILL_MEMO_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
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
    select: 'id,trans_date,amount,memo,note',
  })) as { id?: number; trans_date?: string; amount?: number; memo?: string; note?: string }[]

  if (!rows?.length) return []

  const [payableRows, cardRows] = await Promise.all([
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
  ])

  const linkedIds = new Set<number>()
  for (const r of [...(payableRows || []), ...(cardRows || [])]) {
    const bid = Number(r.bank_transaction_id || 0)
    if (bid > 0) linkedIds.add(bid)
  }

  return (rows || [])
    .filter((r) => !String(r.note || '').toLowerCase().includes(INTERNAL_BANK_SOURCE_MARKER))
    .filter((r) => !linkedIds.has(Number(r.id || 0)))
    .map((r) => {
      const memo = String(r.memo || '').trim()
      return {
        id: Number(r.id || 0),
        transDate: String(r.trans_date || '').slice(0, 10),
        amount: Math.abs(Number(r.amount || 0)),
        memo,
        likelyCardBill: memoLikelyCardBill(memo),
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

  const amount = Math.abs(Number(bankRow.amount || 0))
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
