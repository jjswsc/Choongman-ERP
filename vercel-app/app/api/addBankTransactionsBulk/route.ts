import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { postBankTransactionJournal } from '@/lib/accounting-posting'
import { bankNoteUserDisplayText } from '@/lib/bank-transaction-note-meta'
import {
  composeMergedTaxBankFields,
  findTaxStatementMergeIndex,
  type TaxMergeCandidate,
} from '@/lib/bank-statement-tax-match'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import { upsertReceivableFromBankReceive } from '@/lib/receivable-payable'
import { syncBorrowingFromBankDeposit } from '@/lib/borrowing-ledger'
import { bankDepositSavedCategories, isBankDepositWithoutChannelGl } from '@/lib/bank-import-deposit-category'
import {
  assertPosRevenueDepositCategorySafe,
  isBankSettlementGuardError,
} from '@/lib/bank-settlement-guards'
import { maybeAutoPostChannelFeeAfterBankDeposit } from '@/lib/auto-channel-fee-from-bank'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'

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
  return bankNoteUserDisplayText(String(note ?? ''))
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

type DbDedupEntry = TaxMergeCandidate

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
    const tenantScope = await resolveSaasTenantScope({ auth })
    const tenantError =
      assertSaasTenantWritable(tenantScope, {
        tableHint: 'bank_transactions',
        label: '통장 거래',
      }) ||
      assertSaasTenantWritable(tenantScope, {
        tableHint: 'bank_accounts',
        label: '통장 계좌',
      })
    if (tenantError) {
      return NextResponse.json({ success: false, message: tenantError }, { status: 400, headers })
    }
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
    const accountRows = (await supabaseSelectFilter(
      'bank_accounts',
      appendSaasTenantFilter(`id=eq.${accountId}`, tenantScope, 'bank_accounts'),
      { select: 'id', limit: 1 }
    )) as { id?: number }[]
    if (!accountRows[0]?.id) {
      return NextResponse.json({ success: false, message: '해당 계좌가 없습니다.' }, { status: 404, headers })
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
      const filter = appendSaasTenantFilter(
        `account_id=eq.${accountId}&trans_date=gte.${minDate}&trans_date=lte.${maxDate}`,
        tenantScope,
        'bank_transactions'
      )
      const existing = (await supabaseSelectFilter('bank_transactions', filter, {
        select: 'id,trans_date,trans_type,amount,memo,note,category',
        limit: EXISTING_FETCH_LIMIT,
      })) as {
        id?: number
        trans_date?: string
        trans_type?: string
        amount?: number
        memo?: string
        note?: string
        category?: string
      }[]
      for (const r of existing || []) {
        const d = String(r.trans_date || '').slice(0, 10)
        const t = String(r.trans_type || 'withdraw').toLowerCase()
        const a = Math.abs(Number(r.amount) || 0)
        const m = String(r.memo || '')
        const n = String(r.note || '')
        const bk = bucketKey(d, t, a)
        if (!dbDedupPoolByBucket.has(bk)) dbDedupPoolByBucket.set(bk, [])
        dbDedupPoolByBucket.get(bk)!.push({
          id: Number(r.id || 0) || 0,
          memo: m,
          note: n,
          category: String(r.category || ''),
        })
      }
    }

    let inserted = 0
    let skipped = 0
    let duplicateSkipped = 0
    let taxMerged = 0
    let policySkipped = 0
    let policyAdjusted = 0
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
        duplicateSkipped++
        skipped++
        continue
      }

      if (transType === 'withdraw') {
        const taxIdx = findTaxStatementMergeIndex(pool, memo, note)
        if (taxIdx >= 0) {
          const existingTax = pool[taxIdx]
          if (existingTax.id > 0) {
            const merged = composeMergedTaxBankFields(existingTax, { memo, note })
            await supabaseUpdate('bank_transactions', existingTax.id, {
              memo: merged.memo,
              note: merged.note,
              category: merged.category,
            })
            pool.splice(taxIdx, 1)
            taxMerged++
            skipped++
            continue
          }
        }
      }

      const amt = transType === 'withdraw' ? -Math.abs(amount) : Math.abs(amount)
      const depositCategories = bankDepositSavedCategories()
      const withdrawCategories = ['transfer', 'expense', 'fixed', 'purchase_payment', 'correction', 'loan', 'advance', 'unclassified']
      let validCategory = transType === 'deposit'
        ? (depositCategories.includes(category) ? category : 'receivable_receive')
        : (withdrawCategories.includes(category) ? category : 'unclassified')
      if (transType === 'withdraw' && validCategory === 'fixed') validCategory = 'expense'

      let effectiveStoreNameForReceivable = storeNameForReceivable
      if (transType === 'deposit' && validCategory !== 'receivable_receive') {
        try {
          const posStore = effectiveStoreNameForReceivable || store || userStore
          await assertPosRevenueDepositCategorySafe({
            storeName: posStore,
            category: validCategory,
            memo,
          })
        } catch (e) {
          if (isBankSettlementGuardError(e)) {
            if (e.code === 'POS_REVENUE_DEPOSIT_DOUBLE_RISK') {
              validCategory = 'receivable_receive'
              effectiveStoreNameForReceivable = isScopedRole
                ? (store || userStore)
                : (effectiveStoreNameForReceivable || store || userStore)
              policyAdjusted++
            } else {
              policySkipped++
              skipped++
              continue
            }
          } else {
            throw e
          }
        }
      }

      if (transType === 'deposit' && validCategory === 'receivable_receive') {
        effectiveStoreNameForReceivable =
          effectiveStoreNameForReceivable || store || userStore
        if (!effectiveStoreNameForReceivable) {
          policySkipped++
          skipped++
          continue
        }
      }

      const persistDepositSubject =
        transType === 'deposit' && !isBankDepositWithoutChannelGl(validCategory)
      const persistWithdrawSubject =
        transType === 'withdraw' && ['transfer', 'expense'].includes(validCategory)
      const persistAdvance = validCategory === 'advance'

      const row = stampSaasTenantId<Record<string, unknown>>({
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
      }, tenantScope, 'bank_transactions')
      if ((persistDepositSubject || persistWithdrawSubject || persistAdvance) && accountSubjectId != null) {
        const asid = Number(accountSubjectId)
        if (!isNaN(asid)) {
          const hdr = await assertAccountSubjectNotHeader(asid)
          if (!hdr.ok) {
            return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
          }
          row.account_subject_id = asid
        }
      }
      if (transType === 'deposit' && validCategory !== 'receivable_receive' && salesDate) {
        const sd = String(salesDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) row.sales_date = sd
      }
      if (transType === 'withdraw' && expenseDate) {
        const ed = String(expenseDate).slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(ed)) row.expense_date = ed
      }
      if (transType === 'deposit' && validCategory === 'receivable_receive' && effectiveStoreNameForReceivable) {
        row.store_name = effectiveStoreNameForReceivable
      }
      if (transType === 'withdraw' && validCategory === 'purchase_payment' && vendorCode) {
        row.vendor_code = vendorCode
      }
      if (transType === 'deposit' && (validCategory === 'loan' || validCategory === 'loan_borrow') && vendorCode) {
        row.vendor_code = vendorCode
      }
      if (persistAdvance) {
        if (storeNameForReceivable) row.store_name = storeNameForReceivable
        if (vendorCode) row.vendor_code = vendorCode
      }

      let btInserted: { id?: number }[] = []
      try {
        btInserted = (await supabaseInsert('bank_transactions', row)) as { id?: number }[]
      } catch (e) {
        if (!isMissingIdentityColumnError(e)) throw e
        btInserted = (await supabaseInsert('bank_transactions', stripIdentityColumns(row))) as { id?: number }[]
      }
      const bankId = Array.isArray(btInserted) && btInserted[0] ? btInserted[0].id : undefined

      if (bankId && transType === 'deposit' && validCategory === 'receivable_receive' && effectiveStoreNameForReceivable) {
        await upsertReceivableFromBankReceive({
          bankTransactionId: bankId,
          storeName: effectiveStoreNameForReceivable,
          amountAbs: Math.abs(amount),
          transDate,
          memo: memo ? `통장 수령: ${memo.slice(0, 200)}` : '통장 수령',
          note,
        })
      }
      if (bankId && transType === 'deposit') {
        await syncBorrowingFromBankDeposit({
          bankTransactionId: bankId,
          category: validCategory,
          vendorCode,
          amountAbs: Math.abs(amount),
          transDate,
          memo: memo || null,
          storeName: store || null,
        })
      }
      // purchase_payment: 분류만 저장. 미지급 Payment는 지출관리 연결 시에만 생성.

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
      if (bankId && transType === 'deposit') {
        try {
          await maybeAutoPostChannelFeeAfterBankDeposit({
            bankTransactionId: bankId,
            storeCode: effectiveStoreNameForReceivable || store,
            transDate,
            salesDate,
            netAmount: Math.abs(amount),
            category: validCategory,
            memo,
            note,
            postedBy: userName || null,
          })
        } catch (feeErr) {
          console.warn('addBankTransactionsBulk auto channel fee:', feeErr)
        }
      }
      inserted++
    }

    let msg = `${inserted}건 등록되었습니다.`
    if (duplicateSkipped > 0 || taxMerged > 0 || policySkipped > 0 || policyAdjusted > 0) {
      const parts = [`${inserted}건 등록`]
      if (duplicateSkipped > 0) parts.push(`중복 ${duplicateSkipped}건 제외`)
      if (taxMerged > 0) parts.push(`세금 납부 ${taxMerged}건 Statement와 합침`)
      if (policyAdjusted > 0) parts.push(`정책 ${policyAdjusted}건 자동전환`)
      if (policySkipped > 0) parts.push(`정책 ${policySkipped}건 제외`)
      msg = `${parts.join(', ')}.`
      if (policyAdjusted > 0) {
        msg += ' POS 자동분개 매장의 Grab·카드·QR 입금은 매출 수령(receivable_receive)으로 자동 저장했습니다.'
      }
      if (policySkipped > 0) {
        msg += ' POS 자동분개 매장은 Grab·카드·QR 입금을 revenue_*로 저장하지 않습니다. 매출 수령(receivable_receive) 또는 채널 정산을 사용하세요.'
      }
    }
    return NextResponse.json(
      { success: true, inserted, skipped, duplicateSkipped, taxMerged, policySkipped, policyAdjusted, message: msg },
      { headers }
    )
  } catch (e) {
    console.error('addBankTransactionsBulk:', e)
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('bank_transactions')
      markSaasTenantColumnMissing('bank_accounts')
      return NextResponse.json(
        { success: false, message: '통장 거래 tenant_id 스키마가 없습니다. Omni DB 마이그레이션 SQL을 실행해 주세요.' },
        { status: 400, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
