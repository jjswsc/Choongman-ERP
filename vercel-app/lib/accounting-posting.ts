import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseInsertMany,
  supabaseSelectFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'
import {
  accountLine,
  GL,
  linesForBankDeposit,
  linesForBankWithdraw,
  type BankWithdrawExpenseOverride,
} from '@/lib/chart-of-accounts-mapping'
import { isAccountingPeriodClosed } from '@/lib/accounting-period-server'
import { resolveAccountSubjectIdsByCodes } from '@/lib/journal-account-subject-resolve'

type JournalLineInput = {
  accountCode: string
  accountName: string
  side: 'debit' | 'credit'
  amount: number
  memo?: string
  /** 있으면 코드 조회보다 우선 (이미 알고 있는 account_subjects.id) */
  accountSubjectId?: number | null
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

export async function assertAccountingDateOpen(dateYmd: string, storeName?: string | null) {
  const ymd = String(dateYmd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return
  if (await isAccountingPeriodClosed(monthOf(ymd), storeName)) {
    throw new Error('ACCOUNTING_PERIOD_CLOSED')
  }
}

type DeleteBySourceOptions = {
  memoIncludes?: string[]
}

export async function deleteJournalEntriesBySource(
  sourceType: string,
  sourceId: number,
  options: DeleteBySourceOptions = {}
): Promise<number> {
  const sid = Number(sourceId || 0)
  if (!sid) return 0
  const sourceTypeKey = encodeURIComponent(String(sourceType || '').trim())
  const rows = (await supabaseSelectFilter(
    'journal_entries',
    `source_type=eq.${sourceTypeKey}&source_id=eq.${sid}`,
    {
      select: 'id,memo',
      limit: 200,
      order: 'id.asc',
    }
  )) as { id?: number; memo?: string | null }[] | null
  const memoIncludes = (options.memoIncludes || [])
    .map((m) => String(m || '').trim())
    .filter(Boolean)
  const targetIds = (rows || [])
    .filter((row) => {
      if (!memoIncludes.length) return true
      const memo = String(row.memo || '')
      return memoIncludes.some((needle) => memo.includes(needle))
    })
    .map((row) => Number(row.id || 0))
    .filter((id) => id > 0)
  if (!targetIds.length) return 0
  const idList = targetIds.join(',')
  await supabaseDeleteByFilter('journal_lines', `journal_entry_id=in.(${idList})`)
  await supabaseDeleteByFilter('journal_entries', `id=in.(${idList})`)
  return targetIds.length
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

  if (await isAccountingPeriodClosed(monthOf(accountingDate), params.storeName)) {
    throw new Error('ACCOUNTING_PERIOD_CLOSED')
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

  const codesForLookup = lines
    .filter((l) => l.accountSubjectId == null || Number(l.accountSubjectId) <= 0)
    .map((l) => l.accountCode)
  const codeToSubjectId = await resolveAccountSubjectIdsByCodes(codesForLookup)

  await supabaseInsertMany(
    'journal_lines',
    lines.map((line, i) => {
      const codeKey = String(line.accountCode || '').trim().toUpperCase()
      const explicit = line.accountSubjectId != null ? Number(line.accountSubjectId) : NaN
      const resolved =
        Number.isFinite(explicit) && explicit > 0 ? explicit : codeKey ? (codeToSubjectId.get(codeKey) ?? null) : null
      return {
        journal_entry_id: entryId,
        line_no: i + 1,
        account_code: line.accountCode,
        account_name: line.accountName,
        side: line.side,
        amount: Math.abs(Number(line.amount) || 0),
        memo: line.memo || null,
        account_subject_id: resolved,
      }
    })
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
  /** 출금·경비/고정비 등 비용 차변에 쓸 계정과목 (통장 거래와 동일) */
  accountSubjectId?: number | null
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  const cat = String(params.category || '').toLowerCase()

  let expenseOverride: BankWithdrawExpenseOverride | null = null
  if (params.transType === 'withdraw') {
    const sid = params.accountSubjectId != null ? Number(params.accountSubjectId) : NaN
    if (Number.isFinite(sid) && sid > 0) {
      try {
        const rows = (await supabaseSelectFilter('account_subjects', `id=eq.${sid}`, {
          limit: 1,
          select: 'id,code,name',
        })) as { id?: number; code?: string; name?: string }[] | null
        const r = rows?.[0]
        if (r?.code) {
          expenseOverride = {
            accountCode: String(r.code).trim(),
            accountName: String(r.name || r.code).trim(),
            accountSubjectId: sid,
          }
        }
      } catch (e) {
        console.error('postBankTransactionJournal account_subjects lookup:', e)
      }
    }
  }

  let lines: JournalLineInput[] = []
  if (params.transType === 'deposit') {
    lines = linesForBankDeposit(cat, amount) as JournalLineInput[]
  } else {
    const w = linesForBankWithdraw(cat, amount, expenseOverride)
    if (w.length === 0) return null
    lines = w as JournalLineInput[]
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
  accountSubjectId?: number | null
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0 || String(params.transType).toLowerCase() !== 'expense') return null

  let expenseLine: JournalLineInput = { ...GL.miscExpense(), side: 'debit', amount }
  const sid = params.accountSubjectId != null ? Number(params.accountSubjectId) : NaN
  if (Number.isFinite(sid) && sid > 0) {
    try {
      const rows = (await supabaseSelectFilter('account_subjects', `id=eq.${sid}`, {
        limit: 1,
        select: 'id,code,name',
      })) as { id?: number; code?: string; name?: string }[] | null
      const r = rows?.[0]
      if (r?.code) {
        expenseLine = {
          ...accountLine(String(r.code).trim(), { nameKo: String(r.name || r.code).trim() }),
          side: 'debit',
          amount,
          accountSubjectId: sid,
        }
      }
    } catch (e) {
      console.error('postPettyCashJournal account_subjects lookup:', e)
    }
  }

  return postJournalEntry({
    accountingDate: params.transDate,
    sourceType: 'petty_cash',
    sourceId: params.pettyCashId || null,
    storeName: params.storeName || null,
    memo: params.memo || '시재 지출 자동분개',
    postedBy: params.postedBy || null,
    lines: [expenseLine, { ...GL.cash(), side: 'credit', amount }],
  })
}

export async function postCardTransactionJournal(params: {
  cardTransactionId?: number
  transDate: string
  transType: 'charge' | 'expense'
  amountAbs: number
  memo?: string
  postedBy?: string
  accountSubjectId?: number | null
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  const cardAsset = accountLine('1160')
  if (params.transType === 'charge') {
    return postJournalEntry({
      accountingDate: params.transDate,
      sourceType: 'card_transaction',
      sourceId: params.cardTransactionId || null,
      memo: params.memo || '카드 충전 자동분개',
      postedBy: params.postedBy || null,
      lines: [
        { ...cardAsset, side: 'debit', amount },
        { ...GL.cash(), side: 'credit', amount },
      ],
    })
  }

  let expenseLine: JournalLineInput = { ...GL.miscExpense(), side: 'debit', amount }
  const sid = params.accountSubjectId != null ? Number(params.accountSubjectId) : NaN
  if (Number.isFinite(sid) && sid > 0) {
    try {
      const rows = (await supabaseSelectFilter('account_subjects', `id=eq.${sid}`, {
        limit: 1,
        select: 'id,code,name',
      })) as { id?: number; code?: string; name?: string }[] | null
      const r = rows?.[0]
      if (r?.code) {
        expenseLine = {
          ...accountLine(String(r.code).trim(), { nameKo: String(r.name || r.code).trim() }),
          side: 'debit',
          amount,
          accountSubjectId: sid,
        }
      }
    } catch (e) {
      console.error('postCardTransactionJournal account_subjects lookup:', e)
    }
  }

  return postJournalEntry({
    accountingDate: params.transDate,
    sourceType: 'card_transaction',
    sourceId: params.cardTransactionId || null,
    memo: params.memo || '카드 지출 자동분개',
    postedBy: params.postedBy || null,
    lines: [
      expenseLine,
      { ...cardAsset, side: 'credit', amount },
    ],
  })
}

export async function postExpenseAccrualJournal(params: {
  expenseAccrualId?: number
  accountingDate: string
  amountAbs: number
  expenseAccountCode?: string
  expenseAccountName?: string
  expenseAccountSubjectId?: number | null
  memo?: string
  storeName?: string
  postedBy?: string
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  const sid =
    params.expenseAccountSubjectId != null && Number(params.expenseAccountSubjectId) > 0
      ? Number(params.expenseAccountSubjectId)
      : undefined

  return postJournalEntry({
    accountingDate: params.accountingDate,
    sourceType: 'expense_accrual',
    sourceId: params.expenseAccrualId || null,
    storeName: params.storeName || null,
    memo: params.memo || '지출 발생(미지급) 자동분개',
    postedBy: params.postedBy || null,
    lines: [
      {
        ...accountLine(params.expenseAccountCode || '5520', {
          nameKo: params.expenseAccountName || accountLine('5520').accountName,
        }),
        side: 'debit',
        amount,
        ...(sid != null ? { accountSubjectId: sid } : {}),
      },
      { ...GL.payables(), side: 'credit', amount },
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
      { ...GL.payables(), side: 'debit', amount },
      { ...GL.cash(), side: 'credit', amount },
    ],
  })
}

export async function postPosOrderJournal(params: {
  posOrderId?: number
  salesDate: string
  total: number
  vatAmount?: number
  /** 할인과 분리한 서비스처리 금액(무료제공/서비스 비용) */
  serviceAmount?: number
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentOther?: number
  paymentDeliveryApp?: number
  storeName?: string
  memo?: string
}) {
  const amount = Math.abs(Number(params.total) || 0)
  if (amount <= 0) return null
  const vatAmountRaw = Math.abs(Number(params.vatAmount) || 0)
  const vatAmount = Math.min(vatAmountRaw, amount)
  const netRevenueAmount = Math.max(0, amount - vatAmount)
  const serviceAmountRaw = Math.max(0, Number(params.serviceAmount) || 0)
  const serviceAmount = Math.min(serviceAmountRaw, netRevenueAmount)
  const revenueAmount = netRevenueAmount + serviceAmount
  const paymentCash = Math.max(0, Number(params.paymentCash) || 0)
  const paymentCard = Math.max(0, Number(params.paymentCard) || 0)
  const paymentQr = Math.max(0, Number(params.paymentQr) || 0)
  const paymentOther = Math.max(0, Number(params.paymentOther) || 0)
  const paymentDeliveryApp = Math.max(0, Number(params.paymentDeliveryApp) || 0)
  const paymentKnownTotal = paymentCash + paymentCard + paymentQr + paymentOther + paymentDeliveryApp
  const receivableLike = accountLine('1130', { nameKo: '결제대기자산' })
  const lines: JournalLineInput[] = []

  if (paymentKnownTotal > 0) {
    const denom = paymentKnownTotal || 1
    const cardLikeRaw = paymentCard + paymentQr + paymentOther + paymentDeliveryApp
    const cardLike = Math.round((amount * cardLikeRaw * 100) / denom) / 100
    const cashAmt = Math.max(0, Math.round((amount - cardLike) * 100) / 100)
    if (cashAmt > 0) {
      lines.push({ ...GL.cash(), side: 'debit', amount: cashAmt })
    }
    if (cardLike > 0) {
      lines.push({
        ...receivableLike,
        side: 'debit',
        amount: cardLike,
        memo: '카드/QR/배달앱 정산 예정',
      })
    }
  } else {
    lines.push({ ...GL.cash(), side: 'debit', amount })
  }

  if (revenueAmount > 0) {
    lines.push({ ...GL.revenue(), side: 'credit', amount: revenueAmount })
  }
  if (serviceAmount > 0) {
    lines.push({
      ...accountLine('5520', { nameKo: '서비스처리비' }),
      side: 'debit',
      amount: serviceAmount,
      memo: '서비스처리(무료 제공) 비용',
    })
  }
  if (vatAmount > 0) {
    lines.push({ ...accountLine('2180'), side: 'credit', amount: vatAmount })
  }

  return postJournalEntry({
    accountingDate: params.salesDate,
    sourceType: 'pos_order',
    sourceId: params.posOrderId || null,
    storeName: params.storeName || null,
    memo: params.memo || 'POS 매출 자동분개',
    lines,
  })
}

export async function postPosDayClearingJournal(params: {
  storeCode: string
  businessDate: string
  systemTotal: number
  settlementTotal: number
  diffTotal: number
}) {
  const diff = Number(params.diffTotal || 0)
  if (Math.abs(diff) <= 0.5) return null
  const amount = Math.abs(diff)
  const lines: JournalLineInput[] =
    diff > 0
      ? [
          { ...accountLine('5590', { nameKo: 'POS 마감 차이손실' }), side: 'debit', amount },
          { ...accountLine('1130', { nameKo: '결제대기자산' }), side: 'credit', amount },
        ]
      : [
          { ...accountLine('1130', { nameKo: '결제대기자산' }), side: 'debit', amount },
          { ...accountLine('4190', { nameKo: 'POS 마감 차이이익' }), side: 'credit', amount },
        ]

  return postJournalEntry({
    accountingDate: String(params.businessDate || '').slice(0, 10),
    sourceType: 'pos_day_close',
    sourceId: null,
    storeName: params.storeCode || null,
    memo: `POS 일마감 조정분개 (system=${params.systemTotal}, settlement=${params.settlementTotal})`,
    lines,
  })
}

export async function postPosOrderReversalJournal(params: {
  posOrderId: number
  salesDate: string
  storeName?: string
  memo?: string
}) {
  const orderId = Math.floor(Number(params.posOrderId) || 0)
  if (orderId <= 0) return null
  const sourceRows = (await supabaseSelectFilter(
    'journal_entries',
    `source_type=eq.${encodeURIComponent('pos_order')}&source_id=eq.${orderId}`,
    {
      select: 'id',
      limit: 1,
      order: 'id.desc',
    }
  )) as { id?: number }[] | null
  const sourceEntryId = Math.floor(Number(sourceRows?.[0]?.id) || 0)
  if (sourceEntryId <= 0) return null

  const srcLines = (await supabaseSelectFilter(
    'journal_lines',
    `journal_entry_id=eq.${sourceEntryId}`,
    {
      select: 'account_code,account_name,side,amount,account_subject_id',
      limit: 200,
      order: 'line_no.asc',
    }
  )) as {
    account_code?: string
    account_name?: string
    side?: 'debit' | 'credit'
    amount?: number
    account_subject_id?: number | null
  }[] | null

  const reverseLines = (srcLines || [])
    .map((line) => {
      const code = String(line.account_code ?? '').trim()
      const name = String(line.account_name ?? code).trim() || code
      const amount = Math.abs(Number(line.amount) || 0)
      const sideRaw = String(line.side || '').toLowerCase()
      if (!code || amount <= 0 || (sideRaw !== 'debit' && sideRaw !== 'credit')) return null
      const reversedSide: 'debit' | 'credit' = sideRaw === 'debit' ? 'credit' : 'debit'
      const sid = line.account_subject_id != null ? Number(line.account_subject_id) : NaN
      return {
        accountCode: code,
        accountName: name,
        side: reversedSide,
        amount,
        ...(Number.isFinite(sid) && sid > 0 ? { accountSubjectId: sid } : {}),
      }
    })
    .filter((line) => line != null) as JournalLineInput[]

  if (reverseLines.length < 2) return null
  return postJournalEntry({
    accountingDate: params.salesDate,
    sourceType: 'pos_order_reversal',
    sourceId: orderId,
    storeName: params.storeName || null,
    memo: params.memo || 'POS 주문 취소/환불 역분개',
    lines: reverseLines,
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
      { ...GL.inventory(), side: 'debit', amount: amt },
      { ...GL.payables(), side: 'credit', amount: amt },
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
  depreciationExpenseAccountCode?: string | null
  accumulatedDepreciationAccountCode?: string | null
}) {
  const amount = Math.abs(Number(params.amount) || 0)
  if (amount <= 0) return null
  const depExpense = accountLine(
    String(params.depreciationExpenseAccountCode || '')
      .trim()
      .toUpperCase() || '5500'
  )
  const accumDep = accountLine(
    String(params.accumulatedDepreciationAccountCode || '')
      .trim()
      .toUpperCase() || '1470'
  )
  return postJournalEntry({
    accountingDate: params.accountingDate,
    sourceType: 'depreciation',
    sourceId: params.depreciationEntryId || null,
    storeName: params.storeName || null,
    memo: params.memo || `감가상각 ${params.assetName || ''}`.trim(),
    lines: [
      { ...depExpense, side: 'debit', amount },
      { ...accumDep, side: 'credit', amount },
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
  /** 경비·고정자산 취득 등 사용자 선택 account_subjects.id (분개 라인에 그대로 연결) */
  expenseAccountSubjectId?: number | null
  /** 이체 시 입금 계좌(통장→통장) */
  transferToAccountId?: number | null
  /** 이체 시 패티캐쉬 대상 매장(통장→패티) */
  transferToPettyStore?: string | null
  /** 이체 시 카드 계정(통장→카드충전) */
  transferToCardAccountId?: number | null
  /** 이체 시 입금 계좌(패티→통장) */
  transferFromPettyToAccountId?: number | null
  /** 외부 이체 시 받는 사람 (통장→외부) */
  transferExternalRecipientName?: string | null
}) {
  const amount = Math.abs(Number(params.amountAbs) || 0)
  if (amount <= 0) return null

  const cash = GL.cash()
  const payable = GL.payables()
  const prepayment = accountLine('1160')
  const loanPayable = accountLine('2150')
  const loanReceivable = accountLine('1150')
  const expenseSubjectId =
    params.expenseAccountSubjectId != null && Number(params.expenseAccountSubjectId) > 0
      ? Number(params.expenseAccountSubjectId)
      : undefined

  const fixedAsset = accountLine(params.expenseAccountCode || '1490', {
    nameKo: params.expenseAccountName || accountLine('1490').accountName,
  })
  const retainedEarnings = accountLine('3120')
  const vatPayable = accountLine('2180')
  const withholdingTaxPayable = accountLine('2190')
  const expense = accountLine(params.expenseAccountCode || '5520', {
    nameKo: params.expenseAccountName || accountLine('5520').accountName,
  })

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
        {
          ...expense,
          side: 'debit',
          amount,
          ...(expenseSubjectId != null ? { accountSubjectId: expenseSubjectId } : {}),
        },
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
        {
          ...fixedAsset,
          side: 'debit',
          amount,
          ...(expenseSubjectId != null ? { accountSubjectId: expenseSubjectId } : {}),
        },
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
      const corporateTaxPayable = accountLine('2170')
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

