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

export type PndFormHint = 'PND3' | 'PND53' | 'ALL'

export function normalizePndFormHint(v: unknown): PndFormHint {
  const raw = String(v || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!raw || raw === 'ALL') return 'ALL'
  if (raw.includes('3')) return 'PND3'
  return 'PND53'
}

export function withholdingTaxLedgerToCsv(rows: WithholdingTaxLedgerRow[]): string {
  const header = [
    'id',
    'payment_date',
    'tax_month',
    'store_name',
    'payee_name',
    'payee_tax_id',
    'income_type',
    'gross_amount',
    'wht_rate',
    'wht_amount',
    'form_hint',
    'certificate_no',
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
        escCell(String(r.payee_tax_id ?? '')),
        escCell(String(r.income_type ?? '')),
        String(r.gross_amount ?? ''),
        String(r.wht_rate ?? ''),
        String(r.wht_amount ?? ''),
        escCell(String(r.form_hint ?? '')),
        escCell(String(r.certificate_no ?? '')),
        escCell(String(r.filing_status ?? '')),
        escCell(String(r.submitted_at ?? '')),
        escCell(String(r.submitted_by ?? '')),
        escCell(String(r.memo ?? '')),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}

export function withholdingTaxSubmissionCsv(rows: WithholdingTaxLedgerRow[], formHint: PndFormHint): string {
  const header = [
    'seq_no',
    'form_hint',
    'payment_date',
    'payee_name',
    'payee_tax_id',
    'income_type',
    'gross_amount',
    'wht_rate',
    'wht_amount',
    'certificate_no',
    'store_name',
    'memo',
  ]
  const lines = [header.join(',')]
  const filtered = rows.filter((r) => {
    if (formHint === 'ALL') return true
    return normalizePndFormHint(r.form_hint) === formHint
  })
  for (let i = 0; i < filtered.length; i += 1) {
    const r = filtered[i]
    lines.push(
      [
        String(i + 1),
        escCell(formHint === 'ALL' ? normalizePndFormHint(r.form_hint) : formHint),
        escCell(String(r.payment_date ?? '')),
        escCell(String(r.payee_name ?? '')),
        escCell(String(r.payee_tax_id ?? '')),
        escCell(String(r.income_type ?? '')),
        String(r.gross_amount ?? ''),
        String(r.wht_rate ?? ''),
        String(r.wht_amount ?? ''),
        escCell(String(r.certificate_no ?? '')),
        escCell(String(r.store_name ?? '')),
        escCell(String(r.memo ?? '')),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}

