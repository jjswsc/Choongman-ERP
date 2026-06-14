import type { PosTaxInvoiceRecipientRow } from '@/lib/api-client'
import type { PosTaxInvoiceData } from '@/lib/pos-tax-invoice'

export function taxInvoiceFromRecipientRow(row: PosTaxInvoiceRecipientRow): PosTaxInvoiceData {
  return {
    memberNo: String(row.member_no || '').trim(),
    customerType: row.customer_type === 'company' ? 'company' : 'person',
    name: String(row.name || '').trim(),
    taxId: String(row.tax_id || '').replace(/\D/g, '').slice(0, 13),
    branchNo: String(row.branch_no || '').replace(/\D/g, '').slice(0, 5),
    phone: String(row.phone || '').trim(),
    email: String(row.email || '').trim(),
    address: String(row.address || '').trim(),
    member: Boolean(row.member_no),
  }
}
