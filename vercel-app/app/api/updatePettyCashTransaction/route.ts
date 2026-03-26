import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import {
  assertAccountingDateOpen,
  deleteJournalEntriesBySource,
  postPettyCashJournal,
} from '@/lib/accounting-posting'

/** 패티캐시 거래 수정 - 월별 현황에서 조회 후 수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = Number(body.id)
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'expense').toLowerCase()
    const amount = Number(body.amount) || 0
    const memo = String(body.memo || '').trim()
    const receiptUrl = body.receiptUrl !== undefined
      ? (body.receiptUrl || body.receipt_url ? String(body.receiptUrl || body.receipt_url).trim() : null)
      : undefined
    const accountSubjectId = body.accountSubjectId ?? body.account_subject_id
    const userStore = String(body.userStore || body.user_store || '').trim()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()

    if (!id || id <= 0) {
      return NextResponse.json({ success: false, message: '거래 ID가 필요합니다.' }, { status: 400, headers })
    }
    if (!transDate) {
      return NextResponse.json({ success: false, message: '날짜를 선택하세요.' }, { status: 400, headers })
    }
    if (amount === 0) {
      return NextResponse.json({ success: false, message: '금액을 입력하세요.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter(
      'petty_cash_transactions',
      `id=eq.${id}`,
      { limit: 1 }
    )) as {
      id: number
      store?: string
      trans_date?: string
      trans_type?: string
      amount?: number
      memo?: string
      user_name?: string
      account_subject_id?: number | null
    }[]

    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, message: '해당 거래를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    await assertAccountingDateOpen(String(row.trans_date || '').slice(0, 10))
    await assertAccountingDateOpen(transDate)

    const store = String(row.store || '').trim()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice && userStore && store !== userStore) {
      return NextResponse.json({ success: false, message: '해당 매장만 수정할 수 있습니다.' }, { status: 403, headers })
    }

    let amt = amount
    if (transType === 'expense') amt = -Math.abs(amt)

    const patch: Record<string, unknown> = {
      trans_date: transDate,
      trans_type: transType,
      amount: amt,
      memo,
    }
    if (receiptUrl !== undefined) patch.receipt_url = receiptUrl || null
    if (accountSubjectId !== undefined) {
      const asid = accountSubjectId != null && !isNaN(Number(accountSubjectId)) ? Number(accountSubjectId) : null
      if (asid) {
        const hdr = await assertAccountSubjectNotHeader(asid)
        if (!hdr.ok) {
          return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
        }
      }
      patch.account_subject_id = asid
    }

    await supabaseUpdate('petty_cash_transactions', id, patch)

    const finalAccountSubjectId =
      patch.account_subject_id !== undefined
        ? (patch.account_subject_id as number | null)
        : (row.account_subject_id ?? null)
    try {
      await deleteJournalEntriesBySource('petty_cash', id, { memoIncludes: ['시재 지출 자동분개'] })
      if (transType === 'expense') {
        await postPettyCashJournal({
          pettyCashId: id,
          transDate,
          transType,
          amountAbs: Math.abs(amt),
          memo: memo || String(row.memo || ''),
          storeName: store,
          postedBy: String(row.user_name || '').trim() || undefined,
          accountSubjectId: finalAccountSubjectId,
        })
      }
    } catch (postingErr) {
      console.error('updatePettyCashTransaction reposting:', postingErr)
      return NextResponse.json(
        { success: false, message: postingErr instanceof Error ? postingErr.message : '분개 재처리 실패' },
        { status: 500, headers }
      )
    }

    return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('updatePettyCashTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
