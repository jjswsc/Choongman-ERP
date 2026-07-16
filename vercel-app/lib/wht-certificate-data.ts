/** 원천징수 증명서(หนังสือรับรอง) 인쇄용 당사자·금액 */

import { purchaseOrderMetaOrderDate } from '@/lib/purchase-order-cart'

export type WhtCertificateParty = {
  name: string
  taxId: string
  address?: string
}

export type WhtCertificateData = {
  certificateNo: string
  formHint: string
  paymentDate: string
  taxMonth: string
  incomeType: string
  grossAmount: number
  whtRate: number | null
  whtAmount: number
  direction: 'inbound' | 'outbound'
  withholdingAgent: WhtCertificateParty
  incomeRecipient: WhtCertificateParty
  memo?: string
  storeName?: string
}

export type HeadOfficeCompany = {
  companyName: string
  taxId: string
  address: string
  phone?: string
}

export function resolveWhtCertificateParties(params: {
  direction: 'inbound' | 'outbound'
  payeeName: string
  payeeTaxId: string
  headOffice: HeadOfficeCompany
}): { withholdingAgent: WhtCertificateParty; incomeRecipient: WhtCertificateParty } {
  const hqParty: WhtCertificateParty = {
    name: params.headOffice.companyName || '—',
    taxId: params.headOffice.taxId || '—',
    address: params.headOffice.address || undefined,
  }
  const counterparty: WhtCertificateParty = {
    name: String(params.payeeName || '').trim() || '—',
    taxId: String(params.payeeTaxId || '').trim() || '—',
  }
  if (params.direction === 'inbound') {
    return { withholdingAgent: counterparty, incomeRecipient: hqParty }
  }
  return { withholdingAgent: hqParty, incomeRecipient: counterparty }
}

export function whtCertificateFromPurchaseOrder(
  po: {
    po_no?: string | null
    vendor_name?: string | null
    vendor_code?: string | null
    total?: number | null
    vat?: number | null
    withholding_tax_amount?: number | null
    withholding_tax_rate?: number | null
    cart_json?: unknown
    created_at?: string | null
  },
  headOffice: HeadOfficeCompany,
  vendorTaxId?: string
): WhtCertificateData | null {
  const wht = Math.max(0, Number(po.withholding_tax_amount) || 0)
  if (wht <= 0) return null
  const total = Math.max(0, Number(po.total) || 0)
  const vat = Math.max(0, Number(po.vat) || 0)
  const gross = Math.round((total - vat) * 100) / 100
  const rateRaw = Number(po.withholding_tax_rate)
  const metaDate = purchaseOrderMetaOrderDate(po.cart_json)
  const docDate =
    metaDate && /^\d{4}-\d{2}-\d{2}$/.test(metaDate)
      ? metaDate
      : po.created_at && !isNaN(Date.parse(String(po.created_at)))
        ? new Date(po.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        : ''
  if (!docDate) return null
  return whtCertificateFromLedgerRow(
    {
      payment_date: docDate,
      tax_month: docDate.slice(0, 7),
      payee_name: String(po.vendor_name || po.vendor_code || ''),
      payee_tax_id: vendorTaxId || '',
      income_type: '로열티·용역 수입',
      gross_amount: gross > 0 ? gross : total,
      wht_rate: rateRaw,
      wht_amount: wht,
      form_hint: 'PND3',
      certificate_no: po.po_no ? `PO-${po.po_no}` : undefined,
      direction: 'inbound',
    },
    headOffice
  )
}

/** 지출 등록 직후 50 ทวิ형 증명서 — outbound(당사 원천징수) */
export function whtCertificateFromExpenseRegister(
  params: {
    certificateNo: string
    paymentDate: string
    payeeName: string
    payeeTaxId?: string
    grossInclVat: number
    vatAmount: number
    whtRate: number | null
    whtAmount: number
    memo?: string
    storeName?: string
    incomeType?: string
  },
  headOffice: HeadOfficeCompany
): WhtCertificateData | null {
  const wht = Math.max(0, Number(params.whtAmount) || 0)
  if (wht <= 0) return null
  const paymentDate = String(params.paymentDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return null
  const grossIncl = Math.max(0, Number(params.grossInclVat) || 0)
  const vat = Math.max(0, Number(params.vatAmount) || 0)
  const grossExVat = Math.round(Math.max(0, grossIncl - vat) * 100) / 100
  return whtCertificateFromLedgerRow(
    {
      payment_date: paymentDate,
      tax_month: paymentDate.slice(0, 7),
      payee_name: String(params.payeeName || '').trim(),
      payee_tax_id: String(params.payeeTaxId || '').trim(),
      income_type: String(params.incomeType || '').trim() || '서비스',
      gross_amount: grossExVat > 0 ? grossExVat : grossIncl,
      wht_rate: params.whtRate,
      wht_amount: wht,
      form_hint: '50 ทวิ',
      certificate_no: String(params.certificateNo || '').trim() || undefined,
      memo: params.memo,
      store_name: params.storeName,
      direction: 'outbound',
    },
    headOffice
  )
}

export function whtCertificateFromLedgerRow(
  row: {
    payment_date?: string
    tax_month?: string
    payee_name?: string
    payee_tax_id?: string
    income_type?: string
    gross_amount?: string | number | null
    wht_rate?: string | number | null
    wht_amount?: string | number | null
    form_hint?: string
    certificate_no?: string
    memo?: string
    store_name?: string
    direction?: string
  },
  headOffice: HeadOfficeCompany
): WhtCertificateData {
  const direction = String(row.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound'
  const gross = Math.max(0, Number(row.gross_amount) || 0)
  const wht = Math.max(0, Number(row.wht_amount) || 0)
  const rateRaw = Number(row.wht_rate)
  const whtRate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : gross > 0 && wht > 0 ? (wht / gross) * 100 : null
  const parties = resolveWhtCertificateParties({
    direction,
    payeeName: String(row.payee_name || ''),
    payeeTaxId: String(row.payee_tax_id || ''),
    headOffice,
  })
  return {
    certificateNo: String(row.certificate_no || '').trim() || '—',
    formHint: String(row.form_hint || '').trim() || (direction === 'inbound' ? 'PND3' : 'PND3'),
    paymentDate: String(row.payment_date || '').slice(0, 10),
    taxMonth: String(row.tax_month || '').slice(0, 7),
    incomeType: String(row.income_type || '').trim() || '—',
    grossAmount: gross,
    whtRate: whtRate != null ? Math.round(whtRate * 100) / 100 : null,
    whtAmount: wht,
    direction,
    ...parties,
    memo: String(row.memo || '').trim() || undefined,
    storeName: String(row.store_name || '').trim() || undefined,
  }
}
