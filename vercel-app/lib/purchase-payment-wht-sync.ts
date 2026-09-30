import 'server-only'

import { syncPurchasePaymentWhtJournal } from '@/lib/accounting-posting'
import { syncPayableWithholdingFromBankPayment } from '@/lib/receivable-payable'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { syncTaxWithholdingLedgerForBankTransaction } from '@/lib/tax-ledger-auto-sync'

type BankWhtRow = {
  id?: number
  trans_type?: string | null
  trans_date?: string | null
  category?: string | null
  vendor_code?: string | null
  memo?: string | null
  store?: string | null
  store_name?: string | null
  user_name?: string | null
  withholding_tax_amount?: number | null
  withholding_tax_rate?: number | null
}

/**
 * 통장 매입 지급에 저장된 원천세를 거래처 잔액·원천세 원장·2190 분개에 맞춘다.
 * 매입 대금이 아니면 상계 행과 분개만 지우고, 통장 원천세 칸은 건드리지 않는다.
 */
export async function applyBankPurchasePaymentWht(bankTransactionId: number): Promise<void> {
  const bankId = Math.floor(Number(bankTransactionId) || 0)
  if (bankId <= 0) return

  let rows: BankWhtRow[] = []
  try {
    rows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankId}`, {
      limit: 1,
      select:
        'id,trans_type,trans_date,category,vendor_code,memo,store,store_name,user_name,withholding_tax_amount,withholding_tax_rate',
    })) as BankWhtRow[]
  } catch (e) {
    const msg = String(e || '').toLowerCase()
    if (msg.includes('withholding_tax_amount') || msg.includes('withholding_tax_rate')) return
    throw e
  }

  const bt = rows?.[0]
  if (!bt?.id) return
  const transType = String(bt.trans_type || '').toLowerCase()
  if (transType !== 'withdraw') return

  const isPurchase = String(bt.category || '').toLowerCase() === 'purchase_payment'
  const wht = isPurchase ? Math.max(0, Number(bt.withholding_tax_amount) || 0) : 0
  const transDate = String(bt.trans_date || '').slice(0, 10)
  let vendorCode = String(bt.vendor_code || '').trim()
  if (!vendorCode) {
    const payRows = (await supabaseSelectFilter(
      'payable_transactions',
      `bank_transaction_id=eq.${bankId}&ref_type=eq.Payment`,
      { limit: 1, select: 'vendor_code' }
    )) as { vendor_code?: string | null }[] | null
    vendorCode = String(payRows?.[0]?.vendor_code || '').trim()
  }

  const rate = Number(bt.withholding_tax_rate)
  await syncPayableWithholdingFromBankPayment({
    bankTransactionId: bankId,
    vendorCode,
    whtAmount: wht,
    whtRate: Number.isFinite(rate) && rate > 0 ? rate : null,
    transDate,
    memo: null,
  })

  try {
    await syncTaxWithholdingLedgerForBankTransaction(bankId)
  } catch (e) {
    console.warn('applyBankPurchasePaymentWht ledger:', e)
  }

  await syncPurchasePaymentWhtJournal({
    bankTransactionId: bankId,
    transDate,
    whtAmount: wht,
    storeName: String(bt.store || bt.store_name || '').trim() || null,
    postedBy: String(bt.user_name || '').trim() || null,
  })
}
