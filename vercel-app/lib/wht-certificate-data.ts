/** 원천징수 증명서(หนังสือรับรอง) 인쇄용 당사자·금액 */

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
