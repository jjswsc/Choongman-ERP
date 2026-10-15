import type { PosTaxInvoiceData } from '@/lib/pos-tax-invoice'

export type PosTaxInvoiceDraftFields = Pick<
  PosTaxInvoiceData,
  'customerType' | 'memberNo' | 'name' | 'taxId' | 'branchNo' | 'phone' | 'email' | 'address'
>

type DraftEntry = { fields: PosTaxInvoiceDraftFields; savedAt: number }

const KEY = 'cm_pos_tax_invoice_drafts_v1'
const TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 30

function draftKey(storeCode: string, orderId: string | number): string {
  return `${String(storeCode || '').trim().toUpperCase()}:${String(orderId || '').trim()}`
}

function readAll(now = Date.now()): Record<string, DraftEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, DraftEntry>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, DraftEntry> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.fields && typeof v.savedAt === 'number' && now - v.savedAt < TTL_MS) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(entries: Record<string, DraftEntry>): void {
  if (typeof window === 'undefined') return
  try {
    const sorted = Object.entries(entries)
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_ENTRIES)
    if (sorted.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(sorted)))
  } catch {
    /* ignore */
  }
}

export function isPosTaxInvoiceDraftEmpty(fields: PosTaxInvoiceDraftFields): boolean {
  return ![fields.memberNo, fields.name, fields.taxId, fields.branchNo, fields.phone, fields.email, fields.address].some(
    (v) => String(v || '').trim()
  )
}

export function readPosTaxInvoiceDraft(
  storeCode: string,
  orderId: string | number
): PosTaxInvoiceDraftFields | null {
  return readAll()[draftKey(storeCode, orderId)]?.fields ?? null
}

/** 빈 입력이면 해당 주문 임시 저장분을 지운다. */
export function savePosTaxInvoiceDraft(
  storeCode: string,
  orderId: string | number,
  fields: PosTaxInvoiceDraftFields
): void {
  const all = readAll()
  const k = draftKey(storeCode, orderId)
  if (isPosTaxInvoiceDraftEmpty(fields)) {
    if (!(k in all)) return
    delete all[k]
  } else {
    all[k] = { fields, savedAt: Date.now() }
  }
  writeAll(all)
}

export function clearPosTaxInvoiceDraft(storeCode: string, orderId: string | number): void {
  const all = readAll()
  const k = draftKey(storeCode, orderId)
  if (!(k in all)) return
  delete all[k]
  writeAll(all)
}
