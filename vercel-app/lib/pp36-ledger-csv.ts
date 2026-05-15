export type Pp36LedgerRow = {
  id?: number
  doc_date?: string
  tax_month?: string
  supplier_name?: string | null
  supplier_country?: string | null
  supplier_tax_id?: string | null
  service_desc?: string | null
  taxable_amount?: number | string | null
  vat_rate?: number | string | null
  vat_amount?: number | string | null
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

export function pp36LedgerToCsv(rows: Pp36LedgerRow[]): string {
  const header = [
    'id',
    'doc_date',
    'tax_month',
    'store_name',
    'supplier_name',
    'supplier_country',
    'supplier_tax_id',
    'service_desc',
    'taxable_amount',
    'vat_rate',
    'vat_amount',
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
        escCell(String(r.doc_date ?? '')),
        escCell(String(r.tax_month ?? '')),
        escCell(String(r.store_name ?? '')),
        escCell(String(r.supplier_name ?? '')),
        escCell(String(r.supplier_country ?? '')),
        escCell(String(r.supplier_tax_id ?? '')),
        escCell(String(r.service_desc ?? '')),
        String(r.taxable_amount ?? ''),
        String(r.vat_rate ?? ''),
        String(r.vat_amount ?? ''),
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
