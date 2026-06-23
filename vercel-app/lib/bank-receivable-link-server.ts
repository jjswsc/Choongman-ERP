import {
  computeReceivableOpenAmount,
  isReceivableAccrualRefType,
  receivableStoreMatchesBank,
  roundReceivableMoney,
} from '@/lib/bank-receivable-link'
import { isPosChannelSettlementMemo } from '@/lib/bank-import-deposit-category'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'

type ReceivableAccrualRow = {
  id?: number
  store_name?: string
  amount?: number
  ref_type?: string
  ref_id?: number
  trans_date?: string
  memo?: string
  invoice_no?: string
  receive_checked?: boolean
}

type BankTxRow = {
  id?: number
  trans_type?: string
  category?: string
  amount?: number
  trans_date?: string
  memo?: string
  store_name?: string | null
  store?: string | null
}

export type OpenReceivableForBankItem = {
  id: number
  refType: string
  refId?: number
  storeName: string
  transDate: string
  invoiceNo?: string
  memo?: string
  accrualAmount: number
  remainingAmount: number
  receiveChecked: boolean
}

export async function loadOpenReceivablesForBankTx(bankRow: BankTxRow): Promise<OpenReceivableForBankItem[]> {
  const bankId = Number(bankRow.id || 0)
  const bankStore = String(bankRow.store_name || bankRow.store || '').trim()
  if (!bankId || !bankStore) return []
  if (String(bankRow.trans_type || '').toLowerCase() !== 'deposit') return []
  if (String(bankRow.category || '').toLowerCase() !== 'receivable_receive') return []

  if (isPosChannelSettlementMemo(bankRow.memo)) return []

  const channelLinked = (await supabaseSelectFilter(
    'pos_channel_settlements',
    `bank_transaction_id=eq.${bankId}`,
    { select: 'id', limit: 1 }
  )) as { id?: number }[] | null
  if (channelLinked?.length) return []

  const accrualRows = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=in.(Order,ForceOutbound,AccountingPO)&amount=gt.0`,
    {
      select: 'id,store_name,amount,ref_type,ref_id,trans_date,memo,invoice_no,receive_checked',
      order: 'trans_date.desc,id.desc',
      limit: 5000,
    }
  )) as ReceivableAccrualRow[] | null

  const scoped = (accrualRows || []).filter((r) =>
    receivableStoreMatchesBank(String(r.store_name || ''), bankStore)
  )
  if (scoped.length === 0) return []

  const accrualIds = scoped.map((r) => Number(r.id || 0)).filter((id) => id > 0)
  const offsetsByAccrual = new Map<number, { amount?: number }[]>()
  for (let i = 0; i < accrualIds.length; i += 80) {
    const chunk = accrualIds.slice(i, i + 80)
    const offsetRows = (await supabaseSelectFilter(
      'receivable_transactions',
      `ref_type=eq.Receive&ref_id=in.(${chunk.join(',')})`,
      { select: 'ref_id,amount', limit: Math.max(chunk.length * 3, 100) }
    )) as { ref_id?: number; amount?: number }[] | null
    for (const row of offsetRows || []) {
      const aid = Number(row.ref_id || 0)
      if (!aid) continue
      const list = offsetsByAccrual.get(aid) || []
      list.push(row)
      offsetsByAccrual.set(aid, list)
    }
  }

  const bankAmt = Math.abs(Number(bankRow.amount || 0))
  const out: OpenReceivableForBankItem[] = []
  for (const r of scoped) {
    const id = Number(r.id || 0)
    if (!id) continue
    const accrualAmount = Math.max(0, Number(r.amount || 0))
    const remainingAmount = computeReceivableOpenAmount(accrualAmount, offsetsByAccrual.get(id) || [])
    if (remainingAmount <= 0.009) continue
    out.push({
      id,
      refType: String(r.ref_type || ''),
      refId: r.ref_id != null ? Number(r.ref_id) : undefined,
      storeName: String(r.store_name || ''),
      transDate: String(r.trans_date || '').slice(0, 10),
      invoiceNo: r.invoice_no ? String(r.invoice_no) : undefined,
      memo: r.memo ? String(r.memo) : undefined,
      accrualAmount,
      remainingAmount,
      receiveChecked: Boolean(r.receive_checked),
    })
  }

  out.sort((a, b) => {
    const aExact = Math.abs(a.remainingAmount - bankAmt) <= 0.01 ? 0 : 1
    const bExact = Math.abs(b.remainingAmount - bankAmt) <= 0.01 ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    return b.transDate.localeCompare(a.transDate) || b.id - a.id
  })
  return out
}

export async function linkReceivableAccrualFromBankTransaction(params: {
  bankTransactionId: number
  receivableAccrualId: number
}): Promise<{ ok: true } | { ok: false; message: string; status?: number }> {
  const bankTransactionId = Number(params.bankTransactionId || 0)
  const receivableAccrualId = Number(params.receivableAccrualId || 0)
  if (!bankTransactionId || !receivableAccrualId) {
    return { ok: false, message: '통장 거래 ID와 미수금 ID가 필요합니다.', status: 400 }
  }

  const bankRows = (await supabaseSelectFilter('bank_transactions', `id=eq.${bankTransactionId}`, {
    limit: 1,
    select: 'id,trans_type,category,amount,trans_date,memo,store_name,store',
  })) as BankTxRow[] | null
  const bankRow = bankRows?.[0]
  if (!bankRow?.id) {
    return { ok: false, message: '통장 거래를 찾을 수 없습니다.', status: 404 }
  }
  if (String(bankRow.trans_type || '').toLowerCase() !== 'deposit') {
    return { ok: false, message: '입금 거래만 연결할 수 있습니다.', status: 400 }
  }
  if (String(bankRow.category || '').toLowerCase() !== 'receivable_receive') {
    return { ok: false, message: '매출 수령(receivable_receive) 입금만 미수금과 연결할 수 있습니다.', status: 400 }
  }

  const bankStore = String(bankRow.store_name || bankRow.store || '').trim()
  if (!bankStore) {
    return { ok: false, message: '통장 입금에 매장이 지정되어 있어야 합니다.', status: 400 }
  }

  const channelLinked = (await supabaseSelectFilter(
    'pos_channel_settlements',
    `bank_transaction_id=eq.${bankTransactionId}`,
    { select: 'id', limit: 1 }
  )) as { id?: number }[] | null
  if (channelLinked?.length) {
    return {
      ok: false,
      message: '채널 정산에 연결된 통장 입금은 미수금(출고) 연결 대상이 아닙니다.',
      status: 409,
    }
  }

  const accrualRows = (await supabaseSelectFilter(
    'receivable_transactions',
    `id=eq.${receivableAccrualId}`,
    {
      limit: 1,
      select: 'id,store_name,amount,ref_type,ref_id,trans_date,memo,invoice_no,receive_checked',
    }
  )) as ReceivableAccrualRow[] | null
  const accrual = accrualRows?.[0]
  if (!accrual?.id || !isReceivableAccrualRefType(accrual.ref_type)) {
    return { ok: false, message: '연결할 미수금(출고·주문) 행을 찾을 수 없습니다.', status: 404 }
  }

  if (!receivableStoreMatchesBank(String(accrual.store_name || ''), bankStore)) {
    return { ok: false, message: '통장 입금 매장과 미수금 매장이 일치하지 않습니다.', status: 400 }
  }

  const bankAmt = Math.abs(Number(bankRow.amount || 0))
  const offsetRows = (await supabaseSelectFilter(
    'receivable_transactions',
    `ref_type=eq.Receive&ref_id=eq.${receivableAccrualId}`,
    { select: 'amount', limit: 20 }
  )) as { amount?: number }[] | null
  const remaining = computeReceivableOpenAmount(Number(accrual.amount || 0), offsetRows || [])
  if (remaining <= 0.009) {
    return { ok: false, message: '이미 수금 완료된 미수금입니다.', status: 400 }
  }
  if (Math.abs(bankAmt - remaining) > 0.01) {
    return {
      ok: false,
      message: `통장 금액(฿${bankAmt.toLocaleString()})과 미수 잔액(฿${remaining.toLocaleString()})이 일치해야 합니다.`,
      status: 400,
    }
  }

  const alreadyLinked = (await supabaseSelectFilter(
    'receivable_transactions',
    `bank_transaction_id=eq.${bankTransactionId}&ref_type=eq.Receive&ref_id=eq.${receivableAccrualId}`,
    { select: 'id', limit: 1 }
  )) as { id?: number }[] | null
  if (alreadyLinked?.length) {
    await supabaseUpdate('receivable_transactions', receivableAccrualId, { receive_checked: true })
    return { ok: true }
  }

  const otherBankLink = (await supabaseSelectFilter(
    'receivable_transactions',
    `bank_transaction_id=eq.${bankTransactionId}&ref_type=eq.Receive`,
    { select: 'id,ref_id', limit: 5 }
  )) as { id?: number; ref_id?: number }[] | null
  const linkedElsewhere = (otherBankLink || []).some(
    (r) => Number(r.ref_id || 0) > 0 && Number(r.ref_id) !== receivableAccrualId
  )
  if (linkedElsewhere) {
    return { ok: false, message: '이미 다른 미수금과 연결된 통장 거래입니다.', status: 409 }
  }

  await supabaseDeleteByFilter(
    'receivable_transactions',
    `bank_transaction_id=eq.${bankTransactionId}&ref_type=eq.Receive`
  )

  const transDate = String(bankRow.trans_date || '').slice(0, 10)
  const label = String(accrual.invoice_no || accrual.memo || '').trim()
  const memo = label ? `통장 수금 ${label}`.slice(0, 240) : '통장 수금'

  await supabaseInsert('receivable_transactions', {
    store_name: String(accrual.store_name || bankStore),
    amount: -roundReceivableMoney(bankAmt),
    ref_type: 'Receive',
    ref_id: receivableAccrualId,
    trans_date: transDate,
    memo,
    receive_checked: false,
    bank_transaction_id: bankTransactionId,
  })

  await supabaseUpdate('receivable_transactions', receivableAccrualId, { receive_checked: true })

  return { ok: true }
}

export async function bankTransactionHasReceivableOrderLink(bankTransactionId: number): Promise<boolean> {
  const id = Number(bankTransactionId || 0)
  if (!id) return false
  const rows = (await supabaseSelectFilter(
    'receivable_transactions',
    `bank_transaction_id=eq.${id}&ref_type=eq.Receive&ref_id=not.is.null`,
    { select: 'id', limit: 1 }
  )) as { id?: number }[] | null
  return Boolean(rows?.length)
}
