import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { postBankTransactionJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import {
  upsertPayableFromBankPurchasePayment,
  upsertReceivableFromBankReceive,
} from '@/lib/receivable-payable'
import {
  assertPosRevenueDepositCategorySafe,
  BankSettlementGuardError,
} from '@/lib/bank-settlement-guards'

function isMissingIdentityColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return msg.includes('user_employee_id') || msg.includes('user_employee_code')
}

function stripIdentityColumns<T extends Record<string, unknown>>(row: T): T {
  const next = { ...row }
  delete next.user_employee_id
  delete next.user_employee_code
  return next
}

const EXISTING_FETCH_LIMIT = 25000

function normMemoForDedup(memo: string): string {
  return String(memo || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

function normNoteForDedup(note: string | null | undefined): string {
  return String(note ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 500)
}

/** 동일 날짜·유형·금액에서 CSV 재업로드 시 적요만 오거나 "적요 | 상세"만 오는 경우까지 잡기 */
function isSameBankMemoLoose(existingMemo: string, incomingMemo: string): boolean {
  const a = normMemoForDedup(existingMemo)
  const b = normMemoForDedup(incomingMemo)
  if (!a && !b) return true
  if (a === b) return true
  const aHasDetail = a.includes(' | ')
  const bHasDetail = b.includes(' | ')
  if (!bHasDetail && aHasDetail && a.startsWith(`${b} |`)) return true
  if (bHasDetail && !aHasDetail && b.startsWith(`${a} |`)) return true
  return false
}

type DbDedupEntry = { memo: string; note: string }

function findDuplicateDbEntryIndex(
  pool: DbDedupEntry[],
  incomingMemo: string,
  incomingNote: string
): number {
  const inNote = normNoteForDedup(incomingNote)
  return pool.findIndex(
    (e) => normNoteForDedup(e.note) === inNote && isSameBankMemoLoose(e.memo, incomingMemo)
  )
}

function bucketKey(transDate: string, transType: string, amount: number): string {
  return `${transDate}|${transType}|${Math.abs(amount)}`
}

/** 통장 거래 일괄 등록 (중복 거래는 자동 제외) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Content-Type', 'application/json')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const accountId = Number(body.accountId || body.account_id)
    const userRole = String(auth.role || '').trim()
    const userStore = String(auth.store || '').trim()
    const allowedStores = Array.from(
      new Set(
        [...(Array.isArray(auth.allowedStores) ? auth.allowedStores : []), userStore]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    )
    const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
    if (isScopedRole && allowedStores.length === 0) {
      return NextResponse.json({ success: false, message: '접근 가능한 매장 정보가 없습니다.' }, { status: 403, headers })
    }
    const requestedStore = String(body.store || '').trim()
    const store = requestedStore || userStore
    if (
      isScopedRole &&
      store &&
      !allowedStores.some((s) => storesMatchForGradeLookup(s, store))
    ) {
      return NextResponse.json({ success: false, message: '허용되지 않은 매장입니다.' }, { status: 403, headers })
    }
    const userName = String(auth.name || body.userName || body.user_name || '').trim()
    const userEmployeeId =
      auth.employeeId != null && Number.isFinite(Number(auth.employeeId))
        ? Math.floor(Number(auth.employeeId))
        : null
    const userEmployeeCode = String(auth.employeeCode || '').trim() || null
    type BulkItem = { transDate?: string; trans_date?: string; transType?: string; trans_type?: string; amount?: number; memo?: string; note?: string; category?: string; accountSubjectId?: number; account_subject_id?: number; salesDate?: string; sales_date?: string; expenseDate?: string; expense_date?: string; vendorCode?: string; vendor_code?: string; storeName?: string; store_name?: string }
    const items = (Array.isArray(body.items) ? body.items : []) as BulkItem[]

    if (!accountId || isNaN(accountId)) {
      return NextResponse.json({ success: false, message: '계좌를 선택하세요.' }, { status: 400, headers })
    }
    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '등록할 거래가 없습니다.' }, { status: 400, headers })
    }

    const dates = items.map((i) => String(i.transDate || i.trans_date || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const minDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : ''
    const maxDate = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : ''

    /** 이미 DB에 있는 줄만 소비형으로 매칭: 같은 요청 안에서 동일 적요·메모인 여러 줄은 각각 등록, CSV 재업로드는 DB 건수만큼만 제외 */
    const dbDedupPoolByBucket = new Map<string, DbDedupEntry[]>()
    if (minDate && maxDate) {
      const filter = `account_id=eq.${accountId}&trans_date=gte.${minDate}&trans_date=lte.${maxDate}`
      const existing = (await supabaseSelectFilter('bank_transactions', filter, {
        select: 'trans_date,trans_type,amount,memo,note',
        limit: EXISTING_FETCH_LIMIT,
      })) as {
        trans_date?: string
        trans_type?: string
        amount?: number
        memo?: string
        note?: string
      }[]
      for (const r of existing || []) {
        const d = String(r.trans_date || '').slice(0, 10)
        const t = String(r.trans_type || 'withdraw').toLowerCase()
        const a = Math.abs(Number(r.amount) || 0)
        const m = String(r.memo || '')
        const n = String(r.note || '')
        const bk = bucketKey(d, t, a)
        if (!dbDedupPoolByBucket.has(bk)) dbDedupPoolByBucket.set(bk, [])
        dbDedupPoolByBucket.get(bk)!.push({ memo: m, note: n })
      }
    }

    let inserted = 0
    let skipped = 0
    for (const item of items) {
      const transDate = String(item.transDate || item.trans_date || '').slice(0, 10)
      const transType = String(item.transType || item.trans_type || 'deposit').toLowerCase()
      const amount = Number(item.amount) || 0
      const memo = String(item.memo || '').trim()
      const note = String(item.note || '').trim()
      const category = String(item.category || 'expense').toLowerCase()
      const accountSubjectId = item.accountSubjectId ?? item.account_subject_id
      const salesDate = item.salesDate ?? item.sales_date
      const expenseDate = item.expenseDate ?? item.expense_date
      const vendorCode = String(item.vendorCode || item.vendor_code || '').trim()
      const storeNameForReceivable = String(item.storeName || item.store_name || '').trim()
      if (
        isScopedRole &&
        transType === 'deposit' &&
        category === 'receivable_receive' &&
        storeNameForReceivable &&
        !allowedStores.some((s) => storesMatchForGradeLookup(s, storeNameForReceivable))
      ) {
        return NextResponse.json(
          { success: false, message: `허용되지 않은 미수금 매장입니다: ${storeNameForReceivable}` },
          { status: 403, headers }
        )
      }

      if (!transDate || amount <= 0) continue
      if (!['deposit', 'withdraw'].includes(transType)) continue

      const bk = bucketKey(transDate, transType, amount)
      const pool = dbDedupPoolByBucket.get(bk) || []
      const dupIdx = findDuplicateDbEntryIndex(pool, memo, note)
      if (dupIdx >= 0) {
        pool.splice(dupIdx, 1)
        skipped++
        continue
      }

      const amt = transType === 'withdraw' ? -Math.abs(amount) : Math.abs(amount)
      const depositCategories = ['revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash', 'receivable_receive', 'correction', 'loan', 'advance', 'unclassified']
      const withdrawCategories = ['transfer', 'expense', 'fixed', 'purchase_payment', 'correction', 'loan', 'advance', 'unclassified']
      let validCategory = transType === 'deposit'
        ? (depositCategories.includes(category) ? category : 'revenue_delivery')
        : (withdrawCategories.includes(category) ? category : 'unclassified')
      if (transType === 'withdraw' && validCategory === 'fixed') validCategory = 'expense'

      if (transType === 'deposit' && validCategory !== 'receivable_receive') {
        try {
          const posStore = storeNameForReceivable || store || userStore
          await assertPosRevenueDepositCategorySafe({ storeName: posStore, category: validCategory })
        } catch (e) {
          if (e instanceof BankSettlementGuardError) {
            skipped++
            continue
          }
          throw e
        }
      }

      const persistDepositSubject =
        transType === 'deposit' &&
        !['correction', 'loan', 'advance', 'unclassified', 'receivable_receive'].includes(validCategory)
      const persistWithdrawSubject =
        transType === 'withdraw' && ['transfer', 'expense'].includes(validCategory)

      const row: Record<string, unknown> = {
        account_id: accountId,
        trans_date: transDate,
        trans_type: transType,
        amount: amt,
        memo: memo || null,
        note: note || null,
        store: store || null,
        user_name: userName || null,
        user_employee_id: userEmployeeId,
        user_employee_code: userEmployeeCode,
        category: validCategory,
      }
      if ((persistDepositSubject || persistWithdrawSubject) && accountSubjectId != null) {
        const asid = Number(accountSubjectId)
        if (!isNaN(asid)) {
          const hdr = await assertAccountSubjectNotHeader(asid)
          if (!hdr.ok) {
            return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
          }
          row.account_subject_id = asid
        }
      }
      if (transType === 'deposit' && salesDate) {
        const sd = String(salesDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) row.sales_date = sd
      }
      if (transType === 'withdraw' && expenseDate) {
        const ed = String(expenseDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) row.expense_date = ed
      }
      if (transType === 'deposit' && validCategory === 'receivable_receive' && storeNameForReceivable) row.store_name = storeNameForReceivable
      if (transType === 'withdraw' && validCategory === 'purchase_payment' && vendorCode) row.vendor_code = vendorCode

      let btInserted: { id?: number }[] = []
      try {
        btInserted = (await supabaseInsert('bank_transactions', row)) as { id?: number }[]
      } catch (e) {
        if (!isMissingIdentityColumnError(e)) throw e
        btInserted = (await supabaseInsert('bank_transactions', stripIdentityColumns(row))) as { id?: number }[]
      }
      const bankId = Array.isArray(btInserted) && btInserted[0] ? btInserted[0].id : undefined

      if (bankId && transType === 'withdraw' && validCategory === 'purchase_payment' && vendorCode) {
        await upsertPayableFromBankPurchasePayment({
          bankTransactionId: bankId,
          vendorCode,
          amountAbs: Math.abs(amount),
          transDate,
          memo: memo ? `통장 지급: ${memo.slice(0, 200)}` : '통장 지급',
        })
      }

      if (bankId && transType === 'deposit' && validCategory === 'receivable_receive' && storeNameForReceivable) {
        await upsertReceivableFromBankReceive({
          bankTransactionId: bankId,
          storeName: storeNameForReceivable,
          amountAbs: Math.abs(amount),
          transDate,
          memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
        })
      }

      try {
        if (transType === 'deposit') {
          await postBankTransactionJournal({
            bankTransactionId: bankId,
            transDate,
            transType: 'deposit',
            amountAbs: Math.abs(amount),
            category: validCategory,
            memo,
            storeName: store || undefined,
            postedBy: userName || undefined,
          })
        } else {
          const journalSubjectId =
            validCategory === 'expense'
              ? (accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null)
              : null
          await postBankTransactionJournal({
            bankTransactionId: bankId,
            transDate,
            transType: 'withdraw',
            amountAbs: Math.abs(amount),
            category: validCategory,
            memo,
            storeName: store || undefined,
            postedBy: userName || undefined,
            accountSubjectId: journalSubjectId,
          })
        }
      } catch (postingErr) {
        console.error('addBankTransactionsBulk posting:', postingErr)
      }
      inserted++
    }

    const msg = skipped > 0
      ? `${inserted}건 등록, ${skipped}건 중복 제외`
      : `${inserted}건 등록되었습니다.`
    return NextResponse.json({ success: true, inserted, skipped, message: msg }, { headers })
  } catch (e) {
    console.error('addBankTransactionsBulk:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
