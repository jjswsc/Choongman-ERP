import type { Pnd91AnnualSummary } from '@/lib/pnd91-annual-summary'

function escCell(v: string): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function pnd91AnnualToCsv(
  summary: Pnd91AnnualSummary,
  checklistByEmployeeKey: Record<string, { status: string; note?: string }>
): string {
  const header = [
    'year',
    'store',
    'employee_name',
    'employee_id',
    'tax_id',
    'month_count',
    'annual_gross',
    'annual_wht_payroll',
    'annual_wht_ledger',
    'annual_sso',
    'annual_net_pay',
    'wht_mismatch',
    'checklist_status',
    'checklist_note',
    'filing_due_date',
  ]
  const lines = [header.join(',')]
  for (const e of summary.employees) {
    const chk = checklistByEmployeeKey[e.employeeKey]
    lines.push(
      [
        String(summary.year),
        escCell(e.store),
        escCell(e.name),
        e.employeeId != null ? String(e.employeeId) : '',
        escCell(e.taxId || ''),
        String(e.monthCount),
        String(e.annualGross),
        String(e.annualWhtPayroll),
        String(e.annualWhtLedger),
        String(e.annualSso),
        String(e.annualNetPay),
        e.whtLedgerMismatch ? 'Y' : 'N',
        escCell(chk?.status || 'pending'),
        escCell(chk?.note || ''),
        summary.filingDueDate,
      ].join(',')
    )
  }
  return lines.join('\r\n')
}
