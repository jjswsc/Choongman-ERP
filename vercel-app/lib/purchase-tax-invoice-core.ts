/** ใบกำกับภาษีซื้อ 등록함 — 순수 헬퍼 (DB 없음) */

import { roundMoney2 } from '@/lib/invoice-vat-total'

export const PURCHASE_TAX_INVOICE_SOURCES = ['manual', 'inbound_batch', 'pdf'] as const
export type PurchaseTaxInvoiceSource = (typeof PURCHASE_TAX_INVOICE_SOURCES)[number]

export const PURCHASE_TAX_INVOICE_EXCEL_HEADERS = [
  'ลำดับที่',
  'วันที่ใบกำกับภาษี',
  'เลขที่ใบกำกับภาษี',
  'ชื่อผู้จำหน่าย',
  'เลขผู้เสียภาษี',
  'สำนักงานใหญ่/สาขา',
  'มูลค่า',
  'ภาษีมูลค่าเพิ่ม',
] as const

export const SELLER_BRANCH_HQ = 'สำนักงานใหญ่'

export const PURCHASE_TAX_INV_LEDGER_MEMO_PREFIX = '[AUTO:PURCHASE_TAX_INV:'

export type PurchaseTaxInvoiceInput = {
  storeName: string
  buyerTaxId: string
  docDate: string
  invoiceNo: string
  sellerName: string
  sellerTaxId: string
  sellerBranch?: string
  netAmount: number
  vatAmount: number
  totalAmount?: number
  source?: PurchaseTaxInvoiceSource
  inboundBatchId?: number | null
  attachmentUrls?: string[]
  memo?: string
}

export type PurchaseTaxInvoiceRow = {
  id: number
  storeName: string
  buyerTaxId: string
  taxMonth: string
  docDate: string
  invoiceNo: string
  sellerName: string
  sellerTaxId: string
  sellerBranch: string
  netAmount: number
  vatAmount: number
  totalAmount: number
  source: PurchaseTaxInvoiceSource
  inboundBatchId: number | null
  attachmentUrls: string[]
  memo: string
}

export function digitsTin13(raw: unknown): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .trim()
    .slice(0, 13)
}

export function isTin13(raw: unknown): boolean {
  return digitsTin13(raw).length === 13
}

export function taxMonthFromDocDate(docDate: string): string {
  const ymd = String(docDate || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.slice(0, 7) : ''
}

export function formatSellerBranch(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!s) return SELLER_BRANCH_HQ
  if (/สำนักงานใหญ่|head\s*office|\bhq\b|본사/i.test(s)) return SELLER_BRANCH_HQ
  const digits = s.replace(/\D/g, '')
  if (digits) {
    const padded = digits.padStart(5, '0').slice(-5)
    if (padded === '00000') return SELLER_BRANCH_HQ
    return `สาขา ${padded}`
  }
  return s.slice(0, 80)
}

export function purchaseTaxInvoiceDedupeKey(
  buyerTaxId: string,
  invoiceNo: string,
  sellerTaxId: string
): string {
  const inv = String(invoiceNo || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
  return `${digitsTin13(buyerTaxId)}|${inv}|${digitsTin13(sellerTaxId)}`
}

export function normalizeInvoiceNo(raw: unknown): string {
  return String(raw || '').trim().slice(0, 128)
}

export function parsePurchaseTaxInvIdFromMemo(memo: string): number {
  const m = String(memo || '').match(/\[AUTO:PURCHASE_TAX_INV:(\d+)\]/)
  if (!m) return 0
  return Math.floor(Number(m[1]) || 0)
}

export function purchaseTaxInvLedgerMemoTag(id: number): string {
  return `${PURCHASE_TAX_INV_LEDGER_MEMO_PREFIX}${Math.floor(id)}]`
}

export function formatPp30Amount2(n: number | null | undefined): string {
  const v = roundMoney2(Number(n) || 0)
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function gregorianYmdToBuddhistHint(ymd: string): string {
  const y = Number(String(ymd || '').slice(0, 4))
  if (!Number.isFinite(y) || y < 1900) return ''
  return `ค.ศ. ${y} = พ.ศ. ${y + 543}`
}

export function normalizePurchaseTaxInvoiceSource(raw: unknown): PurchaseTaxInvoiceSource {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'inbound_batch' || v === 'pdf') return v
  return 'manual'
}

export function parseAttachmentUrlsJson(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20)
  }
  const s = String(raw || '').trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20)
    }
  } catch {
    /* plain url */
  }
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return [s.slice(0, 200000)]
  return []
}

export function serializeAttachmentUrls(urls: string[]): string | null {
  const cleaned = (urls || []).map((u) => String(u || '').trim()).filter(Boolean).slice(0, 20)
  return cleaned.length ? JSON.stringify(cleaned) : null
}

export function roundPurchaseTaxAmounts(net: number, vat: number, total?: number): {
  netAmount: number
  vatAmount: number
  totalAmount: number
} {
  const netAmount = roundMoney2(Math.max(0, Number(net) || 0))
  const vatAmount = roundMoney2(Math.max(0, Number(vat) || 0))
  const totalAmount =
    total != null && Number.isFinite(Number(total))
      ? roundMoney2(Math.max(0, Number(total) || 0))
      : roundMoney2(netAmount + vatAmount)
  return { netAmount, vatAmount, totalAmount }
}

export type PurchaseTaxInvoiceValidationError =
  | 'doc_date'
  | 'invoice_no'
  | 'seller_name'
  | 'seller_tax_id'
  | 'buyer_tax_id'
  | 'store_name'
  | 'amounts'

export function validatePurchaseTaxInvoiceInput(
  input: PurchaseTaxInvoiceInput
): PurchaseTaxInvoiceValidationError | null {
  if (!String(input.storeName || '').trim()) return 'store_name'
  if (!isTin13(input.buyerTaxId)) return 'buyer_tax_id'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.docDate || '').slice(0, 10))) return 'doc_date'
  if (!normalizeInvoiceNo(input.invoiceNo)) return 'invoice_no'
  if (!String(input.sellerName || '').trim()) return 'seller_name'
  if (!isTin13(input.sellerTaxId)) return 'seller_tax_id'
  const { netAmount, vatAmount } = roundPurchaseTaxAmounts(input.netAmount, input.vatAmount, input.totalAmount)
  if (netAmount <= 0 && vatAmount <= 0) return 'amounts'
  return null
}

export type ExtractedPurchaseTaxInvoiceFields = {
  docDate?: string
  invoiceNo?: string
  sellerName?: string
  sellerTaxId?: string
  sellerBranch?: string
  netAmount?: number
  vatAmount?: number
  totalAmount?: number
  isCopy?: boolean
}

export function isLikelyTaxInvoiceCopy(raw: unknown): boolean {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return false
  return /สำเนา|สำเนาเอกสาร|copy\b|duplicate|true copy|สำเนาใบ/.test(s)
}
