import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { deleteJournalEntriesBySource, postCardTransactionJournal } from '@/lib/accounting-posting'
import { assertAccountSubjectNotHeader } from '@/lib/account-subject-header-guard'
import { CARD_BILL_HEADER_NOTE } from '@/lib/card-bill-allocation'
import {
  deleteCardTransactionInputVatLedger,
  syncCardTransactionInputVatLedger,
} from '@/lib/card-input-vat-ledger'

type ParentRow = {
  id?: number
  card_account_id?: number
  trans_date?: string
  amount?: number
  memo?: string | null
  bank_transaction_id?: number | null
  is_bill_header?: boolean | null
  note?: string | null
}

type ChildRow = {
  id?: number
  amount?: number
  account_subject_id?: number | null
  memo?: string | null
  vat_amount?: number | null
  invoice_received?: boolean | null
  invoice_no?: string | null
}

export type CardBillAllocationLine = {
  id?: number
  accountSubjectId: number
  amount: number
  memo?: string | null
  vatAmount?: number
  invoiceReceived?: boolean
  invoiceNo?: string | null
}

export async function getCardBillAllocation(parentId: number): Promise<
  | {
      ok: true
      header: {
        id: number
        cardAccountId: number
        transDate: string
        totalAmount: number
        memo: string | null
        bankTransactionId: number | null
        allocatedAmount: number
        remainingAmount: number
      }
      lines: {
        id: number
        accountSubjectId: number
        amount: number
        memo: string | null
        vatAmount?: number
        invoiceReceived?: boolean
        invoiceNo?: string | null
      }[]
    }
  | { ok: false; message: string; status?: number }
> {
  const pid = Number(parentId || 0)
  if (!pid) return { ok: false, message: '카드 대금 ID가 필요합니다.', status: 400 }

  const parents = (await supabaseSelectFilter('card_transactions', `id=eq.${pid}`, {
    limit: 1,
    select: 'id,card_account_id,trans_date,amount,memo,bank_transaction_id,is_bill_header,note',
  })) as ParentRow[] | null
  const parent = parents?.[0]
  if (!parent?.id) return { ok: false, message: '카드 대금을 찾을 수 없습니다.', status: 404 }

  const isHeader =
    Boolean(parent.is_bill_header) || String(parent.note || '').trim() === CARD_BILL_HEADER_NOTE
  if (!isHeader) {
    return { ok: false, message: '통장 연동 카드 대금(총액) 건만 배분할 수 있습니다.', status: 400 }
  }

  const children = (await supabaseSelectFilter('card_transactions', `parent_id=eq.${pid}`, {
    order: 'id.asc',
    limit: 500,
    select: 'id,amount,account_subject_id,memo,vat_amount,invoice_received,invoice_no',
  })) as ChildRow[] | null

  const totalAmount = Math.abs(Number(parent.amount) || 0)
  const lines = (children || []).map((c) => ({
    id: Number(c.id || 0),
    accountSubjectId: Number(c.account_subject_id || 0),
    amount: Math.abs(Number(c.amount) || 0),
    memo: c.memo ? String(c.memo).trim() : null,
    vatAmount: Math.max(0, Number(c.vat_amount) || 0) || undefined,
    invoiceReceived: Boolean(c.invoice_received),
    invoiceNo: c.invoice_no ? String(c.invoice_no).trim() : null,
  }))
  const allocatedAmount = lines.reduce((s, l) => s + l.amount, 0)

  return {
    ok: true,
    header: {
      id: Number(parent.id),
      cardAccountId: Number(parent.card_account_id || 0),
      transDate: String(parent.trans_date || '').slice(0, 10),
      totalAmount,
      memo: parent.memo ? String(parent.memo).trim() : null,
      bankTransactionId: parent.bank_transaction_id != null ? Number(parent.bank_transaction_id) : null,
      allocatedAmount,
      remainingAmount: Math.max(0, totalAmount - allocatedAmount),
    },
    lines,
  }
}

export async function saveCardBillAllocation(params: {
  parentId: number
  lines: CardBillAllocationLine[]
  postedBy?: string | null
}): Promise<{ ok: true } | { ok: false; message: string; status?: number }> {
  const parentId = Number(params.parentId || 0)
  if (!parentId) return { ok: false, message: '카드 대금 ID가 필요합니다.', status: 400 }

  const loaded = await getCardBillAllocation(parentId)
  if (!loaded.ok) return loaded

  const { header } = loaded
  const normalized = (params.lines || [])
    .map((l) => ({
      id: l.id != null && Number(l.id) > 0 ? Number(l.id) : undefined,
      accountSubjectId: Number(l.accountSubjectId || 0),
      amount: Math.abs(Number(l.amount) || 0),
      memo: l.memo != null ? String(l.memo || '').trim() || null : null,
      vatAmount: Math.max(0, Number(l.vatAmount ?? 0) || 0),
      invoiceReceived: Boolean(l.invoiceReceived),
      invoiceNo: l.invoiceNo != null ? String(l.invoiceNo || '').trim() || null : null,
    }))
    .filter((l) => l.accountSubjectId > 0 && l.amount > 0)

  if (normalized.length === 0) {
    return { ok: false, message: '계정과목·금액을 1건 이상 입력해 주세요.', status: 400 }
  }

  const sum = normalized.reduce((s, l) => s + l.amount, 0)
  if (Math.abs(sum - header.totalAmount) > 0.01) {
    return {
      ok: false,
      message: `배분 합계(฿${sum.toLocaleString()})가 카드 대금 총액(฿${header.totalAmount.toLocaleString()})과 일치해야 합니다.`,
      status: 400,
    }
  }

  for (const line of normalized) {
    const hdr = await assertAccountSubjectNotHeader(line.accountSubjectId)
    if (!hdr.ok) return { ok: false, message: hdr.message, status: hdr.status }
  }

  const existingIds = new Set(loaded.lines.map((l) => l.id))
  const keepIds = new Set(normalized.filter((l) => l.id).map((l) => l.id!))

  for (const oldId of existingIds) {
    if (!keepIds.has(oldId)) {
      await deleteCardTransactionInputVatLedger(oldId)
      await deleteJournalEntriesBySource('card_transaction', oldId)
      await supabaseDeleteByFilter('card_transactions', `id=eq.${oldId}`)
    }
  }

  const syncedVatIds: number[] = []

  for (const line of normalized) {
    const vatAmount = Math.max(0, line.vatAmount || 0)
    if (vatAmount > line.amount + 0.01) {
      return { ok: false, message: '부가세는 해당 행 금액(세금 포함)을 초과할 수 없습니다.', status: 400 }
    }
    const invoiceReceived = Boolean(line.invoiceReceived)
    const invoiceNo = invoiceReceived && line.invoiceNo ? line.invoiceNo : null
    const row = {
      card_account_id: header.cardAccountId,
      trans_date: header.transDate,
      trans_type: 'expense',
      amount: line.amount,
      memo: line.memo || header.memo,
      parent_id: parentId,
      bank_transaction_id: null,
      account_subject_id: line.accountSubjectId,
      is_bill_header: false,
      note: null,
      vat_amount: vatAmount > 0 ? vatAmount : null,
      invoice_received: invoiceReceived,
      invoice_no: invoiceNo,
      updated_at: new Date().toISOString(),
    }

    if (line.id && existingIds.has(line.id)) {
      await supabaseUpdate('card_transactions', line.id, row)
      await deleteJournalEntriesBySource('card_transaction', line.id)
      await postCardTransactionJournal({
        cardTransactionId: line.id,
        transDate: header.transDate,
        transType: 'expense',
        amountAbs: line.amount,
        memo: line.memo || header.memo || undefined,
        accountSubjectId: line.accountSubjectId,
        postedBy: params.postedBy || undefined,
      })
      syncedVatIds.push(line.id)
    } else {
      const inserted = (await supabaseInsert('card_transactions', {
        ...row,
        created_at: new Date().toISOString(),
      })) as { id?: number }[]
      const newId = Number(inserted?.[0]?.id || 0)
      if (newId) {
        await postCardTransactionJournal({
          cardTransactionId: newId,
          transDate: header.transDate,
          transType: 'expense',
          amountAbs: line.amount,
          memo: line.memo || header.memo || undefined,
          accountSubjectId: line.accountSubjectId,
          postedBy: params.postedBy || undefined,
        })
        syncedVatIds.push(newId)
      }
    }
  }

  for (const cardTxId of syncedVatIds) {
    try {
      await syncCardTransactionInputVatLedger(cardTxId, { createdBy: params.postedBy || undefined })
    } catch (e) {
      console.warn('syncCardTransactionInputVatLedger:', cardTxId, e)
    }
  }

  await supabaseUpdate('card_transactions', parentId, {
    updated_at: new Date().toISOString(),
  })

  return { ok: true }
}
