/**
 * S&J 청구 매출.
 * วางบิล(인보이스 발행) → SV  차 매출채권 / 대 매출 / 대 매출부가세
 * 수금 → RV  차 은행 / 대 매출채권
 * 전표번호(SV/RV)와 발행 문서번호(IV/IVF)는 따로 두고, 참조는 발행 문서번호.
 */
import { postJournalEntry, deleteJournalEntriesBySource, hasJournalForSource } from '@/lib/accounting-posting'
import { journalCreditForBankAccount } from '@/lib/paid-bank-credit-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { thaiInvoiceTotalsFromVatInclusiveGrand } from '@/lib/invoice-vat-total'
import {
  INVOICE_SALES_STORE,
  taxInvoiceCollectionJournalLines,
  taxInvoiceSalesJournalLines,
} from '@/lib/tax-book'

type ReceivableRow = {
  id?: number
  amount?: number
  ref_type?: string
  trans_date?: string
  invoice_no?: string | null
  memo?: string | null
}

export function outboundBillKey(invoiceNo: string): { sourceType: 'outbound_bill' | 'outbound_bill_force'; sourceId: number; date: string } | null {
  const m = /^(IVF?)(\d{4})(\d{2})(\d{2})-(\d+)$/i.exec(String(invoiceNo || '').trim())
  if (!m) return null
  const id = Math.floor(Number(m[5]) || 0)
  if (id <= 0) return null
  return {
    sourceType: m[1].toUpperCase() === 'IVF' ? 'outbound_bill_force' : 'outbound_bill',
    sourceId: id,
    date: `${m[2]}-${m[3]}-${m[4]}`,
  }
}

async function receivableGrossForInvoice(invoiceNo: string): Promise<{ gross: number; date: string } | null> {
  const key = String(invoiceNo || '').trim()
  if (!key) return null
  const rows = (await supabaseSelectFilter(
    'receivable_transactions',
    `invoice_no=eq.${encodeURIComponent(key)}&ref_type=in.(Order,ForceOutbound)`,
    { select: 'id,amount,ref_type,trans_date,invoice_no', limit: 200 }
  )) as ReceivableRow[] | null
  let gross = 0
  let date = ''
  for (const row of rows || []) {
    const amount = Number(row.amount || 0)
    if (amount <= 0) continue
    gross += amount
    const d = String(row.trans_date || '').slice(0, 10)
    if (d && (!date || d < date)) date = d
  }
  gross = Math.round(gross * 100) / 100
  if (gross <= 0) return null
  return { gross, date }
}

export async function postOutboundBillSalesJournal(invoiceNo: string): Promise<void> {
  const key = outboundBillKey(invoiceNo)
  if (!key) return
  if (await hasJournalForSource(key.sourceType, key.sourceId)) return
  const found = await receivableGrossForInvoice(invoiceNo)
  if (!found) return
  const totals = thaiInvoiceTotalsFromVatInclusiveGrand(found.gross)
  const lines = taxInvoiceSalesJournalLines({
    gross: totals.grandTotal,
    vatAmount: totals.vatRounded,
  })
  if (lines.length < 2) return
  await postJournalEntry({
    accountingDate: found.date || key.date,
    sourceType: key.sourceType,
    sourceId: key.sourceId,
    storeName: INVOICE_SALES_STORE,
    memo: `วางบิล ${invoiceNo}`,
    voucherKind: 'sales',
    entryNo: invoiceNo,
    lines,
  })
}

export async function postOutboundBillSalesJournals(invoiceNos: string[]): Promise<void> {
  for (const invoiceNo of invoiceNos) {
    try {
      await postOutboundBillSalesJournal(invoiceNo)
    } catch (e) {
      console.error('outbound bill sales journal:', invoiceNo, e)
    }
  }
}

export async function postOutboundCollectionJournal(params: {
  accrualId: number
  invoiceNo: string
  amount: number
  accountingDate: string
  bankAccountId?: number | null
}): Promise<void> {
  const accrualId = Math.floor(Number(params.accrualId) || 0)
  const amount = Math.round(Math.max(0, Number(params.amount) || 0) * 100) / 100
  const date = String(params.accountingDate || '').slice(0, 10)
  if (accrualId <= 0 || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
  const bank = await journalCreditForBankAccount(Number(params.bankAccountId) || 0)
  const invoiceNo = String(params.invoiceNo || '').trim()
  const lines = taxInvoiceCollectionJournalLines({
    amount,
    bankCode: bank.accountCode,
    bankName: bank.accountName,
  })
  if (lines.length < 2) return
  try {
    await deleteJournalEntriesBySource('outbound_collection', accrualId)
  } catch (e) {
    console.warn('outbound collection replace:', accrualId, e)
    return
  }
  await postJournalEntry({
    accountingDate: date,
    sourceType: 'outbound_collection',
    sourceId: accrualId,
    storeName: INVOICE_SALES_STORE,
    memo: invoiceNo ? `수금 ${invoiceNo}` : '수금',
    voucherKind: 'receipt',
    entryNo: invoiceNo || null,
    lines,
  })
}

export async function deleteOutboundCollectionJournal(accrualId: number): Promise<void> {
  const id = Math.floor(Number(accrualId) || 0)
  if (id <= 0) return
  try {
    await deleteJournalEntriesBySource('outbound_collection', id)
  } catch (e) {
    console.warn('outbound collection delete:', id, e)
  }
}
