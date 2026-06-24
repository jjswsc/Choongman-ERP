import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { deleteJournalEntriesBySource, postCardTransactionJournal } from '@/lib/accounting-posting'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'

/** 카드 거래 생성/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const cardAccountId = Number(body.cardAccountId ?? body.card_account_id)
    const transDate = String(body.transDate || body.trans_date || '').slice(0, 10)
    const transType = String(body.transType || body.trans_type || 'expense').toLowerCase()
    const amount = Number(body.amount) || 0
    const memo = (body.memo || '').toString().trim() || null

    if (!cardAccountId || isNaN(cardAccountId)) {
      return NextResponse.json({ success: false, message: '카드를 선택해 주세요.' }, { status: 400, headers })
    }
    if (!transDate || !/^\d{4}-\d{2}-\d{2}$/.test(transDate)) {
      return NextResponse.json({ success: false, message: '날짜를 입력해 주세요.' }, { status: 400, headers })
    }
    if (amount <= 0) {
      return NextResponse.json({ success: false, message: '금액을 입력해 주세요.' }, { status: 400, headers })
    }
    if (!['charge', 'expense'].includes(transType)) {
      return NextResponse.json({ success: false, message: '유형을 선택해 주세요.' }, { status: 400, headers })
    }

    const isUpdate = id != null && !isNaN(id)
    let existingAccountSubjectId: number | null = null

    if (isUpdate) {
      const existingRows = (await supabaseSelectFilter('card_transactions', `id=eq.${id}`, {
        limit: 1,
        select: 'id,is_bill_header,note,parent_id,account_subject_id',
      })) as {
        id?: number
        is_bill_header?: boolean
        note?: string | null
        parent_id?: number | null
        account_subject_id?: number | null
      }[] | null
      const existing = existingRows?.[0]
      if (!existing?.id) {
        return NextResponse.json({ success: false, message: '거래를 찾을 수 없습니다.' }, { status: 404, headers })
      }
      const isBillHeader =
        Boolean(existing.is_bill_header) || String(existing.note || '').trim() === CARD_BILL_HEADER_NOTE
      if (isBillHeader || Number(existing.parent_id || 0) > 0) {
        return NextResponse.json(
          { success: false, message: '통장 카드대금·배분 건은 이 화면에서 수정할 수 없습니다. 계정별 배분을 이용하세요.' },
          { status: 400, headers }
        )
      }
      existingAccountSubjectId =
        existing.account_subject_id != null && !isNaN(Number(existing.account_subject_id))
          ? Number(existing.account_subject_id)
          : null
    }

    const hasBankTxField = body.bankTransactionId !== undefined || body.bank_transaction_id !== undefined
    const bankTransactionIdRaw = body.bankTransactionId ?? body.bank_transaction_id
    const bankTransactionId =
      bankTransactionIdRaw != null && !isNaN(Number(bankTransactionIdRaw)) ? Number(bankTransactionIdRaw) : null

    const hasVendorField = body.vendorCode !== undefined
    const vendorCode =
      transType === 'expense' && hasVendorField ? String(body.vendorCode || '').trim() || null : undefined

    const hasSubjectField = body.accountSubjectId !== undefined || body.account_subject_id !== undefined
    const accountSubjectId =
      transType === 'expense' && hasSubjectField && body.accountSubjectId != null
        ? Number(body.accountSubjectId)
        : transType === 'expense' && hasSubjectField && body.account_subject_id != null
          ? Number(body.account_subject_id)
          : undefined

    const hasNoteField = body.note !== undefined
    const note =
      transType === 'expense' && hasNoteField ? String(body.note || '').trim() || null : undefined

    const journalSubjectId =
      transType === 'expense'
        ? accountSubjectId !== undefined
          ? accountSubjectId
          : existingAccountSubjectId
        : null

    if (transType === 'expense' && journalSubjectId != null && !isNaN(journalSubjectId)) {
      const hdr = await assertAccountSubjectNotHeader(journalSubjectId)
      if (!hdr.ok) {
        return NextResponse.json({ success: false, message: hdr.message }, { status: hdr.status, headers })
      }
    }

    const row: Record<string, unknown> = {
      card_account_id: cardAccountId,
      trans_date: transDate,
      trans_type: transType,
      amount,
      memo,
      updated_at: new Date().toISOString(),
    }

    if (!isUpdate || hasBankTxField) {
      row.bank_transaction_id = bankTransactionId
    }
    if (transType === 'expense') {
      if (!isUpdate || hasVendorField) row.vendor_code = vendorCode ?? null
      if (!isUpdate || hasSubjectField) row.account_subject_id = accountSubjectId ?? null
      if (!isUpdate || hasNoteField) row.note = note ?? null
    } else if (!isUpdate) {
      row.vendor_code = null
      row.account_subject_id = null
      row.note = null
    }

    if (isUpdate) {
      await supabaseUpdate('card_transactions', id!, row)
      try {
        await deleteJournalEntriesBySource('card_transaction', id!)
        await postCardTransactionJournal({
          cardTransactionId: id!,
          transDate,
          transType: transType === 'charge' ? 'charge' : 'expense',
          amountAbs: Math.abs(amount),
          memo: memo || undefined,
          accountSubjectId:
            transType === 'expense' && journalSubjectId != null && !isNaN(Number(journalSubjectId))
              ? Number(journalSubjectId)
              : null,
        })
      } catch (postingErr) {
        console.error('saveCardTransaction update posting:', postingErr)
      }
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = (await supabaseInsert('card_transactions', {
      ...row,
      bank_transaction_id: bankTransactionId,
      vendor_code: transType === 'expense' ? (vendorCode ?? null) : null,
      account_subject_id: transType === 'expense' ? (accountSubjectId ?? null) : null,
      note: transType === 'expense' ? (note ?? null) : null,
      created_at: new Date().toISOString(),
    })) as { id?: number }[]
    const newId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined
    if (newId) {
      try {
        await postCardTransactionJournal({
          cardTransactionId: newId,
          transDate,
          transType: transType === 'charge' ? 'charge' : 'expense',
          amountAbs: Math.abs(amount),
          memo: memo || undefined,
          accountSubjectId:
            transType === 'expense' && journalSubjectId != null && !isNaN(Number(journalSubjectId))
              ? Number(journalSubjectId)
              : null,
        })
      } catch (postingErr) {
        console.error('saveCardTransaction create posting:', postingErr)
      }
    }
    return NextResponse.json({ success: true, id: newId, message: '추가되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveCardTransaction:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
