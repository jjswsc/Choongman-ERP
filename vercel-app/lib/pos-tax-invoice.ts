export type PosTaxInvoiceCustomerType = 'person' | 'company'

export interface PosTaxInvoiceData {
  memberNo: string
  customerType: PosTaxInvoiceCustomerType
  name: string
  taxId: string
  branchNo: string
  phone: string
  email: string
  address: string
  member: boolean
}

export interface ParsedPosOrderMemo {
  plainMemo: string
  taxInvoice: PosTaxInvoiceData | null
}

const TAX_INVOICE_MARKER = '[TAX_INVOICE]'

export function parsePosOrderMemo(memo: string | undefined | null): ParsedPosOrderMemo {
  const raw = String(memo || '')
  if (!raw.trim()) return { plainMemo: '', taxInvoice: null }

  const markerIndex = raw.indexOf(TAX_INVOICE_MARKER)
  if (markerIndex < 0) return { plainMemo: raw.trim(), taxInvoice: null }

  const plainMemo = raw.slice(0, markerIndex).trim()
  const payloadRaw = raw.slice(markerIndex + TAX_INVOICE_MARKER.length).trim()
  const parsed: Record<string, string> = {}

  for (const token of payloadRaw.split('|')) {
    const part = token.trim()
    if (!part) continue
    const eqIndex = part.indexOf('=')
    if (eqIndex < 0) continue
    const key = part.slice(0, eqIndex).trim()
    const value = part.slice(eqIndex + 1).trim()
    if (!key) continue
    parsed[key] = value
  }

  const customerType: PosTaxInvoiceCustomerType =
    parsed.customerType === 'company' ? 'company' : 'person'
  const taxInvoice: PosTaxInvoiceData = {
    memberNo: parsed.memberNo || '',
    customerType,
    name: parsed.name || '',
    taxId: parsed.taxId || '',
    branchNo: parsed.branchNo || '',
    phone: parsed.phone || '',
    email: parsed.email || '',
    address: parsed.address || '',
    member: parsed.member === 'Y',
  }

  const hasMeaningfulData = Boolean(
    taxInvoice.name ||
    taxInvoice.taxId ||
    taxInvoice.branchNo ||
    taxInvoice.phone ||
    taxInvoice.email ||
    taxInvoice.address ||
    taxInvoice.memberNo
  )
  return { plainMemo, taxInvoice: hasMeaningfulData ? taxInvoice : null }
}
