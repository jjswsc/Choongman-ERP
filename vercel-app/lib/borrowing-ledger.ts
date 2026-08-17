import { isLoanBorrowDepositCategory } from '@/lib/bank-loan-categories'
import { buildStoreFieldOrIlikeFragment } from '@/lib/accounting-store-match'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
} from '@/lib/supabase-server'

export type BorrowingRefType = 'Borrow' | 'Repay' | 'Opening'

export type BorrowingTransactionRow = {
  id?: number
  party_code?: string
  amount?: number
  trans_date?: string
  memo?: string | null
  ref_type?: string
  bank_transaction_id?: number | null
  petty_cash_transaction_id?: number | null
  store_name?: string | null
}

const ACCOUNTING_FALLBACK_MAX_ROWS = 2_000_000

export function isMissingBorrowingTableError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('borrowing_transactions') ||
    msg.includes('42p01') ||
    msg.includes('pgrst205') ||
    /relation .* does not exist/.test(msg)
  )
}

async function tenantFilter(base: string): Promise<string> {
  try {
    const scope = await resolveSaasTenantScope({})
    return appendSaasTenantFilter(base, scope, 'borrowing_transactions')
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('borrowing_transactions')
      return base
    }
    throw e
  }
}

async function stampRow(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const scope = await resolveSaasTenantScope({})
    return stampSaasTenantId(row, scope, 'borrowing_transactions')
  } catch {
    return row
  }
}

export async function upsertBorrowingTransaction(params: {
  partyCode: string
  amountSigned: number
  transDate: string
  memo?: string | null
  refType: BorrowingRefType
  bankTransactionId?: number | null
  pettyCashTransactionId?: number | null
  storeName?: string | null
}): Promise<boolean> {
  const partyCode = String(params.partyCode || '').trim()
  const amount = Number(params.amountSigned) || 0
  const transDate = String(params.transDate || '').slice(0, 10)
  if (!partyCode || !amount || !/^\d{4}-\d{2}-\d{2}$/.test(transDate)) return false

  const bankId = Number(params.bankTransactionId || 0)
  const pettyId = Number(params.pettyCashTransactionId || 0)

  const row = await stampRow({
    party_code: partyCode,
    amount,
    trans_date: transDate,
    memo: params.memo ? String(params.memo).slice(0, 240) : null,
    ref_type: params.refType,
    bank_transaction_id: bankId > 0 ? bankId : null,
    petty_cash_transaction_id: pettyId > 0 ? pettyId : null,
    store_name: String(params.storeName || '').trim() || null,
  })

  try {
    let existing: { id?: number }[] = []
    if (bankId > 0) {
      const filter = await tenantFilter(`bank_transaction_id=eq.${bankId}`)
      existing = (await supabaseSelectFilter('borrowing_transactions', filter, {
        select: 'id',
        limit: 10,
        order: 'id.asc',
      })) as { id?: number }[]
    } else if (pettyId > 0) {
      const filter = await tenantFilter(`petty_cash_transaction_id=eq.${pettyId}`)
      existing = (await supabaseSelectFilter('borrowing_transactions', filter, {
        select: 'id',
        limit: 10,
        order: 'id.asc',
      })) as { id?: number }[]
    }

    const keepId = existing?.[0]?.id
    if (keepId) {
      await supabaseUpdate('borrowing_transactions', keepId, row)
      for (const extra of existing.slice(1)) {
        if (extra.id) await supabaseDeleteByFilter('borrowing_transactions', `id=eq.${extra.id}`)
      }
      return true
    }

    await supabaseInsert('borrowing_transactions', row)
    return true
  } catch (e) {
    if (isMissingBorrowingTableError(e) || isMissingSaasTenantColumnError(e)) {
      if (isMissingSaasTenantColumnError(e)) markSaasTenantColumnMissing('borrowing_transactions')
      console.warn('borrowing_transactions unavailable:', e)
      return false
    }
    throw e
  }
}

export async function deleteBorrowingFromBankTransaction(bankTransactionId: number): Promise<void> {
  const bankId = Number(bankTransactionId || 0)
  if (!bankId) return
  try {
    await supabaseDeleteByFilter('borrowing_transactions', `bank_transaction_id=eq.${bankId}`)
  } catch (e) {
    if (isMissingBorrowingTableError(e)) return
    throw e
  }
}

export async function deleteBorrowingFromPettyCashTransaction(pettyCashTransactionId: number): Promise<void> {
  const pettyId = Number(pettyCashTransactionId || 0)
  if (!pettyId) return
  try {
    await supabaseDeleteByFilter('borrowing_transactions', `petty_cash_transaction_id=eq.${pettyId}`)
  } catch (e) {
    if (isMissingBorrowingTableError(e)) return
    throw e
  }
}

export async function syncBorrowingFromBankDeposit(params: {
  bankTransactionId: number
  category: string
  vendorCode?: string | null
  amountAbs: number
  transDate: string
  memo?: string | null
  storeName?: string | null
}): Promise<void> {
  const cat = String(params.category || '')
  if (!isLoanBorrowDepositCategory(cat)) {
    await deleteBorrowingFromBankTransaction(params.bankTransactionId)
    return
  }
  const vendorCode = String(params.vendorCode || '').trim()
  if (!vendorCode) {
    await deleteBorrowingFromBankTransaction(params.bankTransactionId)
    return
  }
  await upsertBorrowingTransaction({
    partyCode: vendorCode,
    amountSigned: Math.abs(Number(params.amountAbs) || 0),
    transDate: params.transDate,
    memo: params.memo,
    refType: 'Borrow',
    bankTransactionId: params.bankTransactionId,
    storeName: params.storeName,
  })
}

export async function sumBorrowingsBalance(params: {
  endStr: string
  storeFilter: string
  isHQ: boolean
}): Promise<{ total: number; source: 'select' }> {
  const { endStr, storeFilter, isHQ } = params
  try {
    let filter = endStr ? `trans_date=lte.${endStr}` : 'id=gt.0'
    if (!isHQ && storeFilter !== 'All') {
      const storeFrag = buildStoreFieldOrIlikeFragment('store_name', storeFilter)
      if (storeFrag) filter += `&${storeFrag}`
    }
    filter = await tenantFilter(filter)
    const rows = (await supabaseSelectFilterAllPages('borrowing_transactions', filter, {
      select: 'amount,store_name',
      pageSize: 5000,
      maxRows: ACCOUNTING_FALLBACK_MAX_ROWS,
    })) as { amount?: number; store_name?: string | null }[]
    const total = (rows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    return { total, source: 'select' }
  } catch (e) {
    if (isMissingBorrowingTableError(e) || isMissingSaasTenantColumnError(e)) {
      return { total: 0, source: 'select' }
    }
    throw e
  }
}

export type BorrowingPartyBalance = {
  partyCode: string
  partyName: string
  balance: number
}

export type BorrowingLedgerLine = {
  id: number
  transDate: string
  refType: string
  amount: number
  memo: string | null
  partyCode: string
  bankTransactionId: number | null
  storeName: string | null
}

export async function loadBorrowingLedger(params: {
  endStr: string
  startStr?: string
  partyCode?: string
}): Promise<{ lines: BorrowingLedgerLine[]; byParty: BorrowingPartyBalance[] }> {
  const endStr = String(params.endStr || '').slice(0, 10)
  try {
    let filter = endStr ? `trans_date=lte.${endStr}` : 'id=gt.0'
    const party = String(params.partyCode || '').trim()
    if (party) filter += `&party_code=eq.${encodeURIComponent(party)}`
    filter = await tenantFilter(filter)
    const rows = (await supabaseSelectFilterAllPages('borrowing_transactions', filter, {
      select: 'id,party_code,amount,trans_date,memo,ref_type,bank_transaction_id,store_name',
      order: 'trans_date.asc',
      pageSize: 3000,
      maxRows: 100000,
    })) as BorrowingTransactionRow[]

    const startStr = String(params.startStr || '').slice(0, 10)
    const all = (rows || []).map((r) => ({
      id: Number(r.id || 0),
      transDate: String(r.trans_date || '').slice(0, 10),
      refType: String(r.ref_type || ''),
      amount: Number(r.amount) || 0,
      memo: r.memo != null ? String(r.memo) : null,
      partyCode: String(r.party_code || ''),
      bankTransactionId: r.bank_transaction_id != null ? Number(r.bank_transaction_id) : null,
      storeName: r.store_name != null ? String(r.store_name) : null,
    }))

    const byPartyMap = new Map<string, number>()
    for (const line of all) {
      if (!line.partyCode) continue
      byPartyMap.set(line.partyCode, (byPartyMap.get(line.partyCode) || 0) + line.amount)
    }

    const codes = [...byPartyMap.keys()]
    const nameByCode = new Map<string, string>()
    if (codes.length > 0) {
      const or = codes.map((c) => `code.eq.${encodeURIComponent(c)}`).join(',')
      const vendors = (await supabaseSelectFilter('vendors', `or=(${or})`, {
        select: 'code,name',
        limit: 5000,
      })) as { code?: string; name?: string }[] | null
      for (const v of vendors || []) {
        if (v.code) nameByCode.set(String(v.code), String(v.name || v.code))
      }
    }

    const byParty: BorrowingPartyBalance[] = [...byPartyMap.entries()]
      .map(([partyCode, balance]) => ({
        partyCode,
        partyName: nameByCode.get(partyCode) || partyCode,
        balance,
      }))
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))

    const lines = startStr
      ? all.filter((l) => l.transDate >= startStr && l.transDate <= endStr)
      : all

    return { lines: lines.sort((a, b) => b.transDate.localeCompare(a.transDate) || b.id - a.id), byParty }
  } catch (e) {
    if (isMissingBorrowingTableError(e) || isMissingSaasTenantColumnError(e)) {
      return { lines: [], byParty: [] }
    }
    throw e
  }
}
