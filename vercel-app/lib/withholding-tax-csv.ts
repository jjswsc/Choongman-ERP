export type WithholdingTaxLedgerRow = {
  id?: number
  payment_date?: string
  tax_month?: string
  payee_name?: string | null
  payee_tax_id?: string | null
  income_type?: string | null
  gross_amount?: number | string | null
  wht_rate?: number | string | null
  wht_amount?: number | string | null
  form_hint?: string | null
  certificate_no?: string | null
  memo?: string | null
}

function escCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function withholdingTaxLedgerToCsv(rows: WithholdingTaxLedgerRow[]): string {
  const header = [
    'id',
    'payment_date',
    'tax_month',
    'payee_name',
    'payee_tax_id',
    'income_type',
    'gross_amount',
    'wht_rate',
    'wht_amount',
    'form_hint',
    'certificate_no',
    'memo',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        String(r.id ?? ''),
        escCell(String(r.payment_date ?? '')),
        escCell(String(r.tax_month ?? '')),
        escCell(String(r.payee_name ?? '')),
        escCell(String(r.payee_tax_id ?? '')),
        escCell(String(r.income_type ?? '')),
        String(r.gross_amount ?? ''),
        String(r.wht_rate ?? ''),
        String(r.wht_amount ?? ''),
        escCell(String(r.form_hint ?? '')),
        escCell(String(r.certificate_no ?? '')),
        escCell(String(r.memo ?? '')),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}

