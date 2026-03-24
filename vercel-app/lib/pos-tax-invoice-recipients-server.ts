/**
 * 세금계산서 수취인 마스터 — 서버(API) 전용
 */
import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { parsePosOrderMemo, type PosTaxInvoiceData } from '@/lib/pos-tax-invoice'
import { isOfficeRole } from '@/lib/permissions'

export type TaxInvoiceRecipientRow = {
  id: string
  store_code: string
  member_id: number | null
  member_no: string | null
  customer_type: 'person' | 'company'
  name: string
  tax_id: string
  branch_no: string
  phone: string
  phone_normalized: string
  email: string
  address: string
  is_active: boolean
  notes: string | null
  source: string | null
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export function normalizePhoneDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

export function assertStoreAccess(userRole: string, userStore: string, targetStore: string): boolean {
  const t = String(targetStore || '').trim()
  if (!t) return false
  if (isOfficeRole(userRole)) return true
  return String(userStore || '').trim() === t
}

export type UpsertTaxRecipientInput = {
  storeCode: string
  memberId?: number | null
  memberNo?: string | null
  customerType: 'person' | 'company'
  name: string
  taxId: string
  branchNo: string
  phone: string
  email: string
  address: string
  source?: string | null
}

function rowFromParsed(t: PosTaxInvoiceData, storeCode: string, source: string): UpsertTaxRecipientInput {
  return {
    storeCode: String(storeCode || '').trim(),
    memberNo: t.memberNo?.trim() || null,
    memberId: null,
    customerType: t.customerType === 'company' ? 'company' : 'person',
    name: String(t.name || '').trim(),
    taxId: String(t.taxId || '').replace(/\D/g, ''),
    branchNo: String(t.branchNo || '').replace(/\D/g, '').slice(0, 5),
    phone: String(t.phone || '').trim(),
    email: String(t.email || '').trim(),
    address: String(t.address || '').trim(),
    source,
  }
}

/** pos_orders.memo에서 세금계산서 블록이 있으면 마스터 upsert */
export async function upsertTaxRecipientFromOrderMemo(
  storeCode: string,
  memo: string | null | undefined,
  source = 'pos_order_memo'
): Promise<TaxInvoiceRecipientRow | null> {
  const parsed = parsePosOrderMemo(memo || '')
  if (!parsed.taxInvoice) return null
  const input = rowFromParsed(parsed.taxInvoice, storeCode, source)
  if (!input.taxId || input.taxId.length !== 13) return null
  return upsertTaxInvoiceRecipient(input)
}

export async function upsertTaxInvoiceRecipient(
  input: UpsertTaxRecipientInput
): Promise<TaxInvoiceRecipientRow> {
  const store_code = String(input.storeCode || '').trim()
  if (!store_code) throw new Error('storeCode required')

  const tax_id = String(input.taxId || '').replace(/\D/g, '')
  const branch_no = String(input.branchNo || '').replace(/\D/g, '').slice(0, 5)
  const phone_normalized = normalizePhoneDigits(input.phone)
  const member_no = input.memberNo?.trim() || null
  const member_id = input.memberId != null && input.memberId > 0 ? Math.trunc(input.memberId) : null

  const now = new Date().toISOString()
  const base = {
    store_code,
    member_id,
    member_no,
    customer_type: input.customerType,
    name: String(input.name || '').trim(),
    tax_id,
    branch_no,
    phone: String(input.phone || '').trim(),
    phone_normalized,
    email: String(input.email || '').trim(),
    address: String(input.address || '').trim(),
    is_active: true,
    updated_at: now,
    last_used_at: now,
    source: input.source ?? 'pos_payment',
  }

  const existing = (await supabaseSelectFilter(
    'pos_tax_invoice_recipients',
    `store_code=eq.${encodeURIComponent(store_code)}&tax_id=eq.${encodeURIComponent(tax_id)}&branch_no=eq.${encodeURIComponent(branch_no)}&is_active=eq.true`,
    { limit: 2, select: 'id' }
  )) as { id: string }[]

  if (Array.isArray(existing) && existing.length > 0) {
    const id = existing[0].id
    await supabaseUpdateByFilter('pos_tax_invoice_recipients', `id=eq.${encodeURIComponent(id)}`, {
      ...base,
      member_id,
      member_no,
    })
    const rows = (await supabaseSelectFilter(
      'pos_tax_invoice_recipients',
      `id=eq.${encodeURIComponent(id)}`,
      { limit: 1 }
    )) as TaxInvoiceRecipientRow[]
    return rows[0]
  }

  const inserted = (await supabaseInsert('pos_tax_invoice_recipients', {
    ...base,
    created_at: now,
  })) as TaxInvoiceRecipientRow[] | TaxInvoiceRecipientRow
  const row = Array.isArray(inserted) ? inserted[0] : inserted
  return row
}

export type SearchBy = 'phone' | 'taxId' | 'name' | 'memberNo'

export async function searchTaxInvoiceRecipients(params: {
  storeCode: string | null
  officeWide: boolean
  q: string
  by: SearchBy
  limit: number
}): Promise<TaxInvoiceRecipientRow[]> {
  const lim = Math.min(200, Math.max(1, params.limit))
  const q = String(params.q || '').trim()
  if (!q) {
    if (params.officeWide && !params.storeCode) {
      const rows = (await supabaseSelectFilter(
        'pos_tax_invoice_recipients',
        'is_active=eq.true',
        { limit: lim, order: 'last_used_at.desc.nullslast', select: '*' }
      )) as TaxInvoiceRecipientRow[]
      return Array.isArray(rows) ? rows : []
    }
    if (!params.storeCode) return []
    const rows = (await supabaseSelectFilter(
      'pos_tax_invoice_recipients',
      `store_code=eq.${encodeURIComponent(params.storeCode)}&is_active=eq.true`,
      { limit: lim, order: 'last_used_at.desc.nullslast', select: '*' }
    )) as TaxInvoiceRecipientRow[]
    return Array.isArray(rows) ? rows : []
  }

  if (params.by === 'taxId') {
    const digits = q.replace(/\D/g, '')
    if (digits.length < 5) return []
    const sc = params.storeCode
    if (!sc && !params.officeWide) return []
    const filter = params.officeWide && !sc
      ? `tax_id=eq.${encodeURIComponent(digits)}&is_active=eq.true`
      : `store_code=eq.${encodeURIComponent(sc!)}&tax_id=eq.${encodeURIComponent(digits)}&is_active=eq.true`
    const rows = (await supabaseSelectFilter('pos_tax_invoice_recipients', filter, {
      limit: lim,
      select: '*',
    })) as TaxInvoiceRecipientRow[]
    return Array.isArray(rows) ? rows : []
  }

  if (params.by === 'memberNo') {
    const sc = params.storeCode
    if (!sc) return []
    const rows = (await supabaseSelectFilter(
      'pos_tax_invoice_recipients',
      `store_code=eq.${encodeURIComponent(sc)}&member_no=eq.${encodeURIComponent(q)}&is_active=eq.true`,
      { limit: lim, select: '*' }
    )) as TaxInvoiceRecipientRow[]
    return Array.isArray(rows) ? rows : []
  }

  const sc = params.storeCode
  if (!sc && !params.officeWide) return []

  const baseFilter = params.officeWide && !sc ? 'is_active=eq.true' : `store_code=eq.${encodeURIComponent(sc!)}&is_active=eq.true`
  const rows = (await supabaseSelectFilter('pos_tax_invoice_recipients', baseFilter, {
    limit: 500,
    order: 'last_used_at.desc.nullslast',
    select: '*',
  })) as TaxInvoiceRecipientRow[]

  const list = Array.isArray(rows) ? rows : []
  const qLower = q.toLowerCase()
  const qPhone = normalizePhoneDigits(q)

  if (params.by === 'phone') {
    return list
      .filter((r) => r.phone_normalized && qPhone && r.phone_normalized.includes(qPhone))
      .slice(0, lim)
  }

  return list.filter((r) => String(r.name || '').toLowerCase().includes(qLower)).slice(0, lim)
}
