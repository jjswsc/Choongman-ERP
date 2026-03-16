import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseInsert, supabaseInsertMany, supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

type JournalLineInput = {
  accountCode: string
  accountName: string
  side: 'debit' | 'credit'
  amount: number
  memo?: string
}

type PostJournalParams = {
  accountingDate?: string
  sourceType: string
  sourceId?: number | null
  storeName?: string | null
  memo?: string
  postedBy?: string | null
  lines: JournalLineInput[]
}

function monthOf(dateYmd: string): string {
  return String(dateYmd || '').slice(0, 7)
}

function mkEntryNo(sourceType: string, sourceId?: number | null): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const hh = String(now.getUTCHours()).padStart(2, '0')
  const mm = String(now.getUTCMinutes()).padStart(2, '0')
  const ss = String(now.getUTCSeconds()).padStart(2, '0')
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `JE-${y}${m}${d}${hh}${mm}${ss}-${sourceType}-${sourceId || 0}-${rnd}`
}

async function upsertLedgerBalances(accountingDate: string, storeName: string, lines: JournalLineInput[]) {
  const ym = monthOf(accountingDate)
  const grouped: Record<string, { debit: number; credit: number }> = {}
  for (const line of lines) {
    if (!grouped[line.accountCode]) grouped[line.accountCode] = { debit: 0, credit: 0 }
    if (line.side === 'debit') grouped[line.accountCode].debit += line.amount
    else grouped[line.accountCode].credit += line.amount
  }

  const rows = Object.entries(grouped).map(([accountCode, v]) => ({
    year_month: ym,
    store_name: storeName || 'All',
    account_code: accountCode,
    debit_total: v.debit,
    credit_total: v.credit,
    balance: v.debit - v.credit,
    updated_at: new Date().toISOString(),
  }))
  if (rows.length > 0) {
    await supabaseUpsert('ledger_balances', rows, 'year_month,store_name,account_code')
  }
}

export async function postJournalEntry(params: PostJournalParams): Promise<number | null> {
  const accountingDate = (params.accountingDate || getBangkokTodayDateString()).slice(0, 10)
  const lines = (params.lines || []).filter((l) => (Number(l.amount) || 0) > 0)
  if (lines.length < 2) return null

  const debitSum = lines.filter((l) => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
  const creditSum = lines.filter((l) => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  if (Math.abs(debitSum - creditSum) > 0.01) {
    throw new Error(`분개 차대 불일치: debit=${debitSum}, credit=${creditSum}`)
  }

  const inserted = (await supabaseInsert('journal_entries', {
    entry_no: mkEntryNo(params.sourceType, params.sourceId),
    accounting_date: accountingDate,
    source_type: params.sourceType,
    source_id: params.sourceId ?? null,
    store_name: params.storeName || null,
    memo: params.memo || null,
    posted_by: params.postedBy || null,
  })) as { id?: number }[]
  const entryId = Number(inserted?.[0]?.id || 0)
  if (!entryId) return null

  await supabaseInsertMany(
    'journal_lines',
    lines.map((line, i) => ({
      journal_entry_id: entryId,
      line_no: i + 1,
      account_code: line.accountCode,
      account_name: line.accountName,
      side: line.side,
      amount: Math.abs(Number(line.amount) || 0),
      memo: line.memo || null,
    }))
  )

  await upsertLedgerBalances(accountingDate, params.storeName || 'All', lines)
  return entryId
}

export async function postBankTransactionJournal(params: {
  bankTransactionId?: number
  transDate: string
  transType: 'deposit' | 'withdraw'
  amountAbs: number
  category?: string
  memo?: string
  storeName?: string
  postedBy?: string
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  const cat = String(params.category || '').toLowerCase()
  const cash = { accountCode: '1010', accountName: '현금및예금' }
  const expense = { accountCode: '5520', accountName: '기타경비' }
  const payable = { accountCode: '2110', accountName: '매입채무' }
  const receivable = { accountCode: '1130', accountName: '매출채권' }
  const revenue = { accountCode: '4110', accountName: '매출' }

  let lines: JournalLineInput[] = []
  if (params.transType === 'deposit') {
    if (cat === 'receivable_receive') {
      lines = [
        { ...cash, side: 'debit', amount },
        { ...receivable, side: 'credit', amount },
      ]
    } else {
      lines = [
        { ...cash, side: 'debit', amount },
        { ...revenue, side: 'credit', amount },
      ]
    }
  } else {
    if (cat === 'purchase_payment') {
      lines = [
        { ...payable, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
    } else if (['transfer', 'loan', 'advance', 'correction', 'unclassified'].includes(cat)) {
      return null
    } else {
      lines = [
        { ...expense, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
    }
  }

  return postJournalEntry({
    accountingDate: params.transDate,
    sourceType: 'bank_transaction',
    sourceId: params.bankTransactionId || null,
    storeName: params.storeName || null,
    memo: params.memo || '통장 거래 자동분개',
    postedBy: params.postedBy || null,
    lines,
  })
}

export async function postPettyCashJournal(params: {
  pettyCashId?: number
  transDate: string
  transType: string
  amountAbs: number
  memo?: string
  storeName?: string
  postedBy?: string
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0 || String(params.transType).toLowerCase() !== 'expense') return null

  return postJournalEntry({
    accountingDate: params.transDate,
    sourceType: 'petty_cash',
    sourceId: params.pettyCashId || null,
    storeName: params.storeName || null,
    memo: params.memo || '시재 지출 자동분개',
    postedBy: params.postedBy || null,
    lines: [
      { accountCode: '5520', accountName: '기타경비', side: 'debit', amount },
      { accountCode: '1010', accountName: '현금및예금', side: 'credit', amount },
    ],
  })
}

export async function postExpenseAccrualJournal(params: {
  expenseAccrualId?: number
  accountingDate: string
  amountAbs: number
  expenseAccountCode?: string
  expenseAccountName?: string
  memo?: string
  storeName?: string
  postedBy?: string
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  return postJournalEntry({
    accountingDate: params.accountingDate,
    sourceType: 'expense_accrual',
    sourceId: params.expenseAccrualId || null,
    storeName: params.storeName || null,
    memo: params.memo || '지출 발생(미지급) 자동분개',
    postedBy: params.postedBy || null,
    lines: [
      {
        accountCode: params.expenseAccountCode || '5520',
        accountName: params.expenseAccountName || '기타경비',
        side: 'debit',
        amount,
      },
      { accountCode: '2110', accountName: '매입채무', side: 'credit', amount },
    ],
  })
}

export async function postPayableSettlementJournal(params: {
  sourceType: 'bank_transaction' | 'petty_cash'
  sourceId?: number
  accountingDate: string
  amountAbs: number
  memo?: string
  storeName?: string
  postedBy?: string
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  return postJournalEntry({
    accountingDate: params.accountingDate,
    sourceType: params.sourceType,
    sourceId: params.sourceId || null,
    storeName: params.storeName || null,
    memo: params.memo || '미지급금 지급 자동분개',
    postedBy: params.postedBy || null,
    lines: [
      { accountCode: '2110', accountName: '매입채무', side: 'debit', amount },
      { accountCode: '1010', accountName: '현금및예금', side: 'credit', amount },
    ],
  })
}

export async function postPosOrderJournal(params: {
  posOrderId?: number
  salesDate: string
  total: number
  storeName?: string
  memo?: string
}) {
  const amount = Math.abs(Number(params.total) || 0)
  if (amount <= 0) return null
  return postJournalEntry({
    accountingDate: params.salesDate,
    sourceType: 'pos_order',
    sourceId: params.posOrderId || null,
    storeName: params.storeName || null,
    memo: params.memo || 'POS 매출 자동분개',
    lines: [
      { accountCode: '1010', accountName: '현금및예금', side: 'debit', amount },
      { accountCode: '4110', accountName: '매출', side: 'credit', amount },
    ],
  })
}

export async function postStorePurchaseJournal(params: {
  orderId: number
  transDate: string
  amount: number
  storeName?: string
  memo?: string
}) {
  const amt = Math.abs(Number(params.amount) || 0)
  if (amt <= 0) return null
  return postJournalEntry({
    accountingDate: params.transDate,
    sourceType: 'store_purchase',
    sourceId: params.orderId,
    storeName: params.storeName || null,
    memo: params.memo || '매장 매입 자동분개',
    lines: [
      { accountCode: '1460', accountName: '재고자산', side: 'debit', amount: amt },
      { accountCode: '2110', accountName: '매입채무', side: 'credit', amount: amt },
    ],
  })
}

export async function postDepreciationJournal(params: {
  depreciationEntryId?: number
  accountingDate: string
  amount: number
  assetName?: string
  storeName?: string
  memo?: string
}) {
  const amount = Math.abs(Number(params.amount) || 0)
  if (amount <= 0) return null
  return postJournalEntry({
    accountingDate: params.accountingDate,
    sourceType: 'depreciation',
    sourceId: params.depreciationEntryId || null,
    storeName: params.storeName || null,
    memo: params.memo || `감가상각 ${params.assetName || ''}`.trim(),
    lines: [
      { accountCode: '5500', accountName: '감가상각비', side: 'debit', amount },
      { accountCode: '1470', accountName: '감가상각누계액', side: 'credit', amount },
    ],
  })
}

export async function hasJournalForSource(sourceType: string, sourceId: number): Promise<boolean> {
  const rows = (await supabaseSelectFilter(
    'journal_entries',
    `source_type=eq.${encodeURIComponent(sourceType)}&source_id=eq.${sourceId}`,
    { select: 'id', limit: 1 }
  )) as { id?: number }[] | null
  return !!rows?.length
}

/** 출금 관리 유형별 분개 */
export type WithdrawalCategory =
  | 'purchase_payment'
  | 'purchase_advance'
  | 'expense'
  | 'expense_advance'
  | 'fixed_asset'
  | 'transfer'
  | 'transfer_external'
  | 'transfer_to_petty'
  | 'transfer_to_card'
  | 'transfer_from_petty'
  | 'loan_repayment'
  | 'loan_given'
  | 'tax_vat'
  | 'tax_withholding'
  | 'tax_corporate'
  | 'correction'
  | 'dividend'

export async function postWithdrawalJournal(params: {
  sourceType: 'bank_transaction' | 'petty_cash'
  sourceId?: number | null
  category: WithdrawalCategory
  accountingDate: string
  amountAbs: number
  memo?: string
  storeName?: string
  postedBy?: string
  /** 경비/경비선급 시 계정과목 */
  expenseAccountCode?: string
  expenseAccountName?: string
  /** 이체 시 입금 계좌(통장→통장) */
  transferToAccountId?: number | null
  /** 이체 시 패티캐쉬 대상 매장(통장→패티) */
  transferToPettyStore?: string | null
  /** 이체 시 입금 계좌(패티→통장) */
  transferFromPettyToAccountId?: number | null
  /** 외부 이체 시 받는 사람 (통장→외부) */
  transferExternalRecipientName?: string | null
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  const cash = { accountCode: '1010', accountName: '현금및예금' }
  const payable = { accountCode: '2110', accountName: '매입채무' }
  const prepayment = { accountCode: '1160', accountName: '선급금' }
  const loanPayable = { accountCode: '2150', accountName: '차입금' }
  const loanReceivable = { accountCode: '1150', accountName: '대여금' }
  const fixedAsset = {
    accountCode: params.expenseAccountCode || '1490',
    accountName: params.expenseAccountName || '기타유형자산',
  }
  const retainedEarnings = { accountCode: '3120', accountName: '이익잉여금' }
  const vatPayable = { accountCode: '2180', accountName: '부가세예수금' }
  const withholdingTaxPayable = { accountCode: '2190', accountName: '원천세예수금' }
  const expense = {
    accountCode: params.expenseAccountCode || '5520',
    accountName: params.expenseAccountName || '기타경비',
  }

  let lines: JournalLineInput[] = []

  switch (params.category) {
    case 'purchase_payment':
      lines = [
        { ...payable, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'purchase_advance':
      lines = [
        { ...prepayment, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'expense':
      lines = [
        { ...expense, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'expense_advance':
      lines = [
        { ...prepayment, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'fixed_asset':
      lines = [
        { ...fixedAsset, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'transfer':
      if (params.transferToAccountId) {
        lines = [
          { ...cash, side: 'debit', amount, memo: `이체입금(계좌${params.transferToAccountId})` },
          { ...cash, side: 'credit', amount, memo: '이체출금' },
        ]
      } else {
        return null
      }
      break
    case 'transfer_external':
      lines = [
        { ...prepayment, side: 'debit', amount, memo: params.transferExternalRecipientName ? `외부이체(${params.transferExternalRecipientName})` : '외부이체' },
        { ...cash, side: 'credit', amount, memo: '이체출금' },
      ]
      break
    case 'transfer_to_petty':
      lines = [
        { ...cash, side: 'debit', amount, memo: params.transferToPettyStore ? `패티보충(${params.transferToPettyStore})` : '패티캐쉬이체' },
        { ...cash, side: 'credit', amount, memo: '통장이체' },
      ]
      break
    case 'transfer_to_card':
      lines = [
        { ...cash, side: 'debit', amount, memo: params.transferToCardAccountId ? `카드충전(계좌${params.transferToCardAccountId})` : '카드충전' },
        { ...cash, side: 'credit', amount, memo: '통장이체' },
      ]
      break
    case 'transfer_from_petty':
      if (params.transferFromPettyToAccountId) {
        lines = [
          { ...cash, side: 'debit', amount, memo: `이체입금(계좌${params.transferFromPettyToAccountId})` },
          { ...cash, side: 'credit', amount, memo: '패티캐쉬이체' },
        ]
      } else {
        return null
      }
      break
    case 'tax_vat':
      lines = [
        { ...vatPayable, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'tax_withholding':
      lines = [
        { ...withholdingTaxPayable, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'tax_corporate': {
      const corporateTaxPayable = { accountCode: '2170', accountName: '법인세납부예정금' }
      lines = [
        { ...corporateTaxPayable, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    }
    case 'loan_repayment':
      lines = [
        { ...loanPayable, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'loan_given':
      lines = [
        { ...loanReceivable, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'dividend':
      lines = [
        { ...retainedEarnings, side: 'debit', amount },
        { ...cash, side: 'credit', amount },
      ]
      break
    case 'correction':
      return null
    default:
      return null
  }

  if (lines.length < 2) return null

  return postJournalEntry({
    accountingDate: params.accountingDate,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    storeName: params.storeName || null,
    memo: params.memo || '출금 관리 자동분개',
    postedBy: params.postedBy || null,
    lines,
  })
}

