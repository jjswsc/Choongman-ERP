export type Pnd54LedgerRow = {
  id?: number
  payment_date?: string
  tax_month?: string
  payee_name?: string | null
  payee_country?: string | null
  payee_tax_id?: string | null
  income_type?: string | null
  gross_amount?: number | string | null
  wht_rate?: number | string | null
  wht_amount?: number | string | null
  treaty_relief_note?: string | null
  filing_status?: string | null
  submitted_at?: string | null
  submitted_by?: string | null
  memo?: string | null
  store_name?: string | null
}

function escCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function pnd54LedgerToCsv(rows: Pnd54LedgerRow[]): string {
  const header = [
    'id',
    'payment_date',
    'tax_month',
    'store_name',
    'payee_name',
    'payee_country',
    'payee_tax_id',
    'income_type',
    'gross_amount',
    'wht_rate',
    'wht_amount',
    'treaty_relief_note',
    'filing_status',
    'submitted_at',
    'submitted_by',
    'memo',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        String(r.id ?? ''),
        escCell(String(r.payment_date ?? '')),
        escCell(String(r.tax_month ?? '')),
        escCell(String(r.store_name ?? '')),
        escCell(String(r.payee_name ?? '')),
        escCell(String(r.payee_country ?? '')),
        escCell(String(r.payee_tax_id ?? '')),
        escCell(String(r.income_type ?? '')),
        String(r.gross_amount ?? ''),
        String(r.wht_rate ?? ''),
        String(r.wht_amount ?? ''),
        escCell(String(r.treaty_relief_note ?? '')),
        escCell(String(r.filing_status ?? '')),
        escCell(String(r.submitted_at ?? '')),
        escCell(String(r.submitted_by ?? '')),
        escCell(String(r.memo ?? '')),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}
