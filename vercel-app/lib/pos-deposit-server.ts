import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import {
  accountLine,
  GL,
} from '@/lib/chart-of-accounts-mapping'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { postJournalEntry, hasJournalForSource } from '@/lib/accounting-posting'
import { memberPhoneLookupVariants, canonicalMemberPhoneForStorage } from '@/lib/member-phone-lookup'
import {
  POS_DEPOSIT_FORFEIT_INCOME_ACCOUNT,
  POS_DEPOSIT_LIABILITY_ACCOUNT,
  coercePosDepositLedgerKind,
  coercePosDepositTender,
  posDepositBalanceFromLedger,
  type PosDepositLedgerKind,
  type PosDepositTender,
} from '@/lib/pos-deposit-domain'
import { resolvePosBusinessAccountingDateForStore } from '@/lib/pos-order-policy-server'

type LedgerInsert = {
  tenantId?: string | null
  storeCode: string
  posOrderId?: number | null
  memberId?: number | null
  guestPhone?: string | null
  guestName?: string | null
  kind: PosDepositLedgerKind
  amount: number
  tender?: PosDepositTender | string | null
  memo?: string | null
  createdBy?: string | null
}

export type PosDepositLedgerRow = {
  kind?: string
  amount?: number
  tender?: string
  guest_phone?: string
  guest_name?: string
  member_id?: number | null
}

function round2(n: number): number {
  return Math.round(Math.max(0, Number(n) || 0) * 100) / 100
}

function isMissingDepositLedgerError(e: unknown): boolean {
  const msg = String(e ?? '').toLowerCase()
  return (
    msg.includes('pos_deposit_ledger') ||
    msg.includes('42p01') ||
    msg.includes('pgrst205') ||
    msg.includes('schema cache')
  )
}

function holderPhoneFilter(phoneRaw: string): string | null {
  const canonical = canonicalMemberPhoneForStorage(phoneRaw)
  const variants = memberPhoneLookupVariants(phoneRaw)
  const phones = Array.from(new Set([canonical, ...variants].filter(Boolean)))
  if (phones.length === 0) return null
  if (phones.length === 1) return `guest_phone=eq.${encodeURIComponent(phones[0]!)}`
  const or = phones.map((p) => `guest_phone.eq.${encodeURIComponent(p)}`).join(',')
  return `or=(${or})`
}

export async function insertPosDepositLedgerRow(input: LedgerInsert): Promise<number> {
  const amount = round2(input.amount)
  if (amount <= 0.005) return 0
  const kind = coercePosDepositLedgerKind(input.kind)
  if (!kind) return 0
  const orderId = Math.trunc(Number(input.posOrderId) || 0)
  try {
    const inserted = (await supabaseInsert('pos_deposit_ledger', {
      tenant_id: String(input.tenantId ?? '').trim() || null,
      store_code: String(input.storeCode ?? '').trim(),
      pos_order_id: orderId > 0 ? orderId : null,
      member_id: input.memberId != null && Number(input.memberId) > 0 ? Math.trunc(Number(input.memberId)) : null,
      guest_phone: String(input.guestPhone ?? '').trim() || null,
      guest_name: String(input.guestName ?? '').trim() || null,
      kind,
      amount,
      tender: input.tender ? coercePosDepositTender(input.tender) : null,
      memo: String(input.memo ?? '').trim() || null,
      created_by: String(input.createdBy ?? '').trim() || null,
    })) as { id?: number }[]
    return Math.trunc(Number(inserted?.[0]?.id) || 0)
  } catch (e) {
    if (isMissingDepositLedgerError(e)) {
      console.warn('pos_deposit_ledger missing — run sql/pos_deposit_ledger.sql')
      return 0
    }
    throw e
  }
}

export async function loadPosDepositLedgerForHolder(params: {
  storeCode: string
  memberId?: number | null
  guestPhone?: string | null
}): Promise<PosDepositLedgerRow[]> {
  const storeCode = String(params.storeCode ?? '').trim()
  if (!storeCode) return []
  const memberId = Math.trunc(Number(params.memberId) || 0)
  const parts = [`store_code=ilike.${encodeURIComponent(storeCode)}`]
  if (memberId > 0) {
    parts.push(`member_id=eq.${memberId}`)
  } else {
    const phoneFilter = holderPhoneFilter(String(params.guestPhone ?? ''))
    if (!phoneFilter) return []
    parts.push(phoneFilter)
  }
  try {
    const rows = (await supabaseSelectFilter('pos_deposit_ledger', parts.join('&'), {
      select: 'kind,amount,tender,guest_phone,guest_name,member_id',
      limit: 500,
      order: 'id.asc',
    })) as PosDepositLedgerRow[] | null
    return rows || []
  } catch (e) {
    if (isMissingDepositLedgerError(e)) return []
    throw e
  }
}

export async function loadPosDepositHeldAmount(params: {
  storeCode: string
  memberId?: number | null
  guestPhone?: string | null
}): Promise<number> {
  return posDepositBalanceFromLedger(await loadPosDepositLedgerForHolder(params))
}

function depositAssetLine(tender: PosDepositTender | string | null | undefined) {
  const t = coercePosDepositTender(tender)
  if (t === 'cash') return { ...GL.cash(), side: 'debit' as const }
  return { ...accountLine('1130', { nameKo: '결제대기자산' }), side: 'debit' as const }
}

export async function postPosDepositReceiveJournal(params: {
  ledgerId: number
  storeCode: string
  amount: number
  tender: PosDepositTender | string
  createdAtIso?: string
}): Promise<void> {
  const amount = round2(params.amount)
  const ledgerId = Math.trunc(Number(params.ledgerId) || 0)
  if (amount <= 0.005 || ledgerId <= 0) return
  const already = await hasJournalForSource('pos_deposit_receive', ledgerId)
  if (already) return
  const salesDate = params.createdAtIso
    ? await resolvePosBusinessAccountingDateForStore(params.createdAtIso, params.storeCode)
    : getBangkokTodayDateString()
  await postJournalEntry({
    accountingDate: salesDate,
    sourceType: 'pos_deposit_receive',
    sourceId: ledgerId,
    storeName: params.storeCode || null,
    memo: 'POS 손님 예약금 수령',
    lines: [
      { ...depositAssetLine(params.tender), amount },
      { ...accountLine(POS_DEPOSIT_LIABILITY_ACCOUNT, { nameKo: '선수금부채' }), side: 'credit', amount },
    ],
  })
}

export async function postPosDepositRefundJournal(params: {
  ledgerId: number
  storeCode: string
  amount: number
  tender: PosDepositTender | string
  createdAtIso?: string
}): Promise<void> {
  const amount = round2(params.amount)
  const ledgerId = Math.trunc(Number(params.ledgerId) || 0)
  if (amount <= 0.005 || ledgerId <= 0) return
  const already = await hasJournalForSource('pos_deposit_refund', ledgerId)
  if (already) return
  const salesDate = params.createdAtIso
    ? await resolvePosBusinessAccountingDateForStore(params.createdAtIso, params.storeCode)
    : getBangkokTodayDateString()
  await postJournalEntry({
    accountingDate: salesDate,
    sourceType: 'pos_deposit_refund',
    sourceId: ledgerId,
    storeName: params.storeCode || null,
    memo: 'POS 손님 예약금 환불',
    lines: [
      { ...accountLine(POS_DEPOSIT_LIABILITY_ACCOUNT, { nameKo: '선수금부채' }), side: 'debit', amount },
      { ...depositAssetLine(params.tender), side: 'credit', amount },
    ],
  })
}

export async function postPosDepositForfeitJournal(params: {
  ledgerId: number
  storeCode: string
  amount: number
  createdAtIso?: string
}): Promise<void> {
  const amount = round2(params.amount)
  const ledgerId = Math.trunc(Number(params.ledgerId) || 0)
  if (amount <= 0.005 || ledgerId <= 0) return
  const already = await hasJournalForSource('pos_deposit_forfeit', ledgerId)
  if (already) return
  const salesDate = params.createdAtIso
    ? await resolvePosBusinessAccountingDateForStore(params.createdAtIso, params.storeCode)
    : getBangkokTodayDateString()
  await postJournalEntry({
    accountingDate: salesDate,
    sourceType: 'pos_deposit_forfeit',
    sourceId: ledgerId,
    storeName: params.storeCode || null,
    memo: 'POS 손님 예약금 몰수',
    lines: [
      { ...accountLine(POS_DEPOSIT_LIABILITY_ACCOUNT, { nameKo: '선수금부채' }), side: 'debit', amount },
      {
        ...accountLine(POS_DEPOSIT_FORFEIT_INCOME_ACCOUNT, { nameKo: '기타수익' }),
        side: 'credit',
        amount,
      },
    ],
  })
}

/** 방문 결제 시 회원/전화 보유액을 주문에 적용. amount가 있으면 그 한도까지. */
export async function applyPosDepositOnSettle(params: {
  posOrderId: number
  storeCode: string
  memberId?: number | null
  guestPhone?: string | null
  amount?: number | null
  maxAmount?: number | null
  createdBy?: string | null
  tenantId?: string | null
}): Promise<number> {
  const orderId = Math.trunc(Number(params.posOrderId) || 0)
  if (orderId > 0) {
    const existingApply = (await supabaseSelectFilter(
      'pos_deposit_ledger',
      `pos_order_id=eq.${orderId}&kind=eq.apply`,
      { select: 'amount', limit: 20 }
    )) as { amount?: number }[] | null
    const already = posDepositBalanceFromLedger(
      (existingApply || []).map((r) => ({ kind: 'receive', amount: r.amount }))
    )
    if (already > 0.005) return already
  }
  const held = await loadPosDepositHeldAmount({
    storeCode: params.storeCode,
    memberId: params.memberId,
    guestPhone: params.guestPhone,
  })
  if (held <= 0.005) return 0
  const requested = params.amount != null && params.amount > 0.005 ? round2(params.amount) : held
  const cap = params.maxAmount != null && params.maxAmount > 0.005 ? round2(params.maxAmount) : held
  const applyAmt = round2(Math.min(held, requested, cap))
  if (applyAmt <= 0.005) return 0
  await insertPosDepositLedgerRow({
    tenantId: params.tenantId,
    storeCode: params.storeCode,
    posOrderId: params.posOrderId,
    memberId: params.memberId,
    guestPhone: params.guestPhone,
    kind: 'apply',
    amount: applyAmt,
    memo: 'visit_apply',
    createdBy: params.createdBy,
  })
  return applyAmt
}
