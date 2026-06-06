import type { VatLedgerRow } from '@/lib/vat-ledger-csv'

/** POS 주문 완료 시 자동 생성된 매출 부가세 장부 행 식별 */
export function isPosAutoVatOutputRow(row: {
  memo?: string | null
  vat_status?: string | null
  counterparty_name?: string | null
  direction?: string | null
}): boolean {
  if (String(row.direction || '').toLowerCase() !== 'output') return false
  if (/\[AUTO:POS_ORDER:/i.test(String(row.memo || ''))) return true
  const cp = String(row.counterparty_name || '').trim().toUpperCase()
  return cp === 'POS SALES' && String(row.vat_status || '') === 'draft_auto'
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalizeFilingStatus(rows: VatLedgerRow[]): string {
  const set = new Set(rows.map((r) => String(r.filing_status || '').toLowerCase()))
  if (set.has('submitted') && !set.has('draft')) return 'submitted'
  return 'draft'
}

/** 세무 신고용: 동일 과세월 POS 자동 매출 행을 1줄로 합산 (매장·주문 건별 숨김) */
export function consolidatePosOutputRowsForTaxExport(rows: VatLedgerRow[]): VatLedgerRow[] {
  const rest: VatLedgerRow[] = []
  const posOutput: VatLedgerRow[] = []
  for (const r of rows) {
    if (String(r.direction || '').toLowerCase() === 'output' && isPosAutoVatOutputRow(r)) posOutput.push(r)
    else rest.push(r)
  }
  if (!posOutput.length) return rows

  const byMonth = new Map<string, VatLedgerRow[]>()
  for (const r of posOutput) {
    const m = String(r.tax_month || '').slice(0, 7)
    const list = byMonth.get(m) || []
    list.push(r)
    byMonth.set(m, list)
  }

  const merged: VatLedgerRow[] = []
  for (const [taxMonth, list] of byMonth) {
    let net = 0
    let vat = 0
    let total = 0
    let maxDoc = ''
    for (const r of list) {
      net += num(r.net_amount)
      vat += num(r.vat_amount)
      total += num(r.total_amount)
      const d = String(r.doc_date || '')
      if (d && d > maxDoc) maxDoc = d
    }
    const filing = normalizeFilingStatus(list)
    merged.push({
      id: undefined,
      doc_date: maxDoc || String(list[0]?.doc_date || '').slice(0, 10),
      tax_month: taxMonth,
      direction: 'output',
      counterparty_name: 'POS 매출 합계',
      counterparty_tax_id: '',
      invoice_number: `POS-AGG-${taxMonth}`,
      net_amount: Math.round(net * 100) / 100,
      vat_amount: Math.round(vat * 100) / 100,
      total_amount: Math.round(total * 100) / 100,
      vat_status: 'summary_pos',
      filing_status: filing,
      submitted_at: undefined,
      submitted_by: undefined,
      memo: null,
      store_name: null,
    })
  }

  merged.sort((a, b) => String(a.tax_month).localeCompare(String(b.tax_month)))
  return [...merged, ...rest]
}
