export type VatLedgerRow = {
  id?: number
  doc_date?: string
  tax_month?: string
  direction?: string
  counterparty_name?: string | null
  counterparty_tax_id?: string | null
  invoice_number?: string | null
  net_amount?: number | string | null
  vat_amount?: number | string | null
  total_amount?: number | string | null
  vat_status?: string | null
  memo?: string | null
  store_name?: string | null
}

function escCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function vatLedgerToCsv(rows: VatLedgerRow[]): string {
  const header = [
    'id',
    'doc_date',
    'tax_month',
    'direction',
    'counterparty_name',
    'counterparty_tax_id',
    'invoice_number',
    'net_amount',
    'vat_amount',
    'total_amount',
    'vat_status',
    'memo',
    'store_name',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        String(r.id ?? ''),
        escCell(String(r.doc_date ?? '')),
        escCell(String(r.tax_month ?? '')),
        escCell(String(r.direction ?? '')),
        escCell(String(r.counterparty_name ?? '')),
        escCell(String(r.counterparty_tax_id ?? '')),
        escCell(String(r.invoice_number ?? '')),
        String(r.net_amount ?? ''),
        String(r.vat_amount ?? ''),
        String(r.total_amount ?? ''),
        escCell(String(r.vat_status ?? '')),
        escCell(String(r.memo ?? '')),
        escCell(String(r.store_name ?? '')),
      ].join(',')
    )
  }
  return lines.join('\r\n')
}
