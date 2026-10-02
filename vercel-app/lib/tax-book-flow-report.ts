/**
 * 플로우 어카운트 리포트와 비슷한 시산·손익·재무상태 HTML (화면·엑셀·인쇄 공용).
 */

import type { TaxBookStatements } from '@/lib/tax-book'
import type { TrialBalanceRow } from '@/lib/trial-balance-report'
import { erpExcelRichTableCss } from '@/lib/erp-excel-export'

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export type TaxBookFlowReportMeta = {
  companyName: string
  asOfLabel: string
  periodLabel?: string
  unitLabel?: string
}

/** 화면·인쇄용 CSS (플로우 리포트 느낌: 회사명·제목·표) */
export function taxBookFlowReportScreenCss(): string {
  return `
.tb-flow { font-family: Calibri, "Malgun Gothic", "Noto Sans Thai", Arial, sans-serif; color: #0f172a; }
.tb-flow-company { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
.tb-flow-title { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
.tb-flow-meta { font-size: 12px; color: #475569; margin: 0 0 12px; }
.tb-flow table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tb-flow th, .tb-flow td { border: 1px solid #94a3b8; padding: 6px 8px; vertical-align: middle; }
.tb-flow th { background: #e2e8f0; font-weight: 700; text-align: center; }
.tb-flow td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tb-flow td.code { width: 5.5rem; white-space: nowrap; }
.tb-flow tr.section td { background: #f1f5f9; font-weight: 700; border-left: 3px solid #0f2744; }
.tb-flow tr.total td { background: #e8f4ff; font-weight: 700; border-top: 2px solid #0f2744; }
.tb-flow-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
@media print {
  .tb-flow-toolbar, .no-print { display: none !important; }
  .tb-flow { color: #000; }
  .tb-flow th, .tb-flow td { border-color: #333; }
}
`
}

function headerBlock(meta: TaxBookFlowReportMeta, title: string): string {
  const unit = meta.unitLabel || 'หน่วย:บาท / Unit: THB'
  return `<div class="tb-flow-company">${esc(meta.companyName)}</div>
<div class="tb-flow-title">${esc(title)}</div>
<div class="tb-flow-meta">${esc(meta.asOfLabel)}${meta.periodLabel ? ` · ${esc(meta.periodLabel)}` : ''}<br/>${esc(unit)}</div>`
}

export function buildFlowTrialBalanceHtml(
  meta: TaxBookFlowReportMeta,
  rows: TrialBalanceRow[],
  totals: { debit: number; credit: number }
): string {
  const body = rows
    .map(
      (r) =>
        `<tr><td class="code">${esc(r.accountCode)}</td><td>${esc(r.accountName || '')}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td></tr>`
    )
    .join('')
  return `<div class="tb-flow">
${headerBlock(meta, 'งบทดลอง / Trial Balance')}
<table>
<thead><tr><th>รหัสบัญชี<br/>Account</th><th>ชื่อบัญชี<br/>Account name</th><th>เดบิต<br/>Debit</th><th>เครดิต<br/>Credit</th></tr></thead>
<tbody>${body}
<tr class="total"><td colspan="2">รวม / Total</td><td class="num">${money(totals.debit)}</td><td class="num">${money(totals.credit)}</td></tr>
</tbody></table></div>`
}

export function buildFlowIncomeStatementHtml(meta: TaxBookFlowReportMeta, st: TaxBookStatements): string {
  const revRows = st.incomeLines
    .filter((l) => l.section === 'revenue')
    .map(
      (l) =>
        `<tr><td class="code">${esc(l.accountCode)}</td><td>${esc(l.accountName || '')}</td><td class="num">${money(l.amount)}</td></tr>`
    )
    .join('')
  const expRows = st.incomeLines
    .filter((l) => l.section === 'expense')
    .map(
      (l) =>
        `<tr><td class="code">${esc(l.accountCode)}</td><td>${esc(l.accountName || '')}</td><td class="num">${money(l.amount)}</td></tr>`
    )
    .join('')
  return `<div class="tb-flow">
${headerBlock(meta, 'งบกำไรขาดทุน / Income Statement')}
<table>
<thead><tr><th>รหัสบัญชี</th><th>รายการ</th><th>จำนวนเงิน</th></tr></thead>
<tbody>
<tr class="section"><td colspan="3">รายได้ / Revenue</td></tr>
${revRows || `<tr><td colspan="3">—</td></tr>`}
<tr class="total"><td colspan="2">รวมรายได้</td><td class="num">${money(st.revenue)}</td></tr>
<tr class="section"><td colspan="3">ค่าใช้จ่าย / Expenses</td></tr>
${expRows || `<tr><td colspan="3">—</td></tr>`}
<tr class="total"><td colspan="2">รวมค่าใช้จ่าย</td><td class="num">${money(st.expense)}</td></tr>
<tr class="total"><td colspan="2">กำไร(ขาดทุน)สุทธิ / Net income</td><td class="num">${money(st.netIncome)}</td></tr>
</tbody></table></div>`
}

export function buildFlowBalanceSheetHtml(meta: TaxBookFlowReportMeta, st: TaxBookStatements): string {
  const block = (section: 'asset' | 'liability' | 'equity', title: string) => {
    const rows = st.balanceLines
      .filter((l) => l.section === section)
      .map(
        (l) =>
          `<tr><td class="code">${esc(l.accountCode)}</td><td>${esc(l.accountName || '')}</td><td class="num">${money(l.amount)}</td></tr>`
      )
      .join('')
    const total =
      section === 'asset' ? st.assets : section === 'liability' ? st.liabilities : st.equity
    return `<tr class="section"><td colspan="3">${esc(title)}</td></tr>
${rows || `<tr><td colspan="3">—</td></tr>`}
<tr class="total"><td colspan="2">รวม</td><td class="num">${money(total)}</td></tr>`
  }
  const equityPlusProfit = st.equity + (Math.abs(st.unclosedProfit) > 0.01 ? st.unclosedProfit : 0)
  return `<div class="tb-flow">
${headerBlock(meta, 'งบฐานะการเงิน / Balance Sheet')}
<table>
<thead><tr><th>รหัสบัญชี</th><th>รายการ</th><th>จำนวนเงิน</th></tr></thead>
<tbody>
${block('asset', 'สินทรัพย์ / Assets')}
${block('liability', 'หนี้สิน / Liabilities')}
${block('equity', 'ส่วนของเจ้าของ / Equity')}
${
  Math.abs(st.unclosedProfit) > 0.01
    ? `<tr><td></td><td>กำไร(ขาดทุน)สุทธิที่ยังไม่ปิด</td><td class="num">${money(st.unclosedProfit)}</td></tr>
<tr class="total"><td colspan="2">รวมส่วนของเจ้าของ+กำไร</td><td class="num">${money(equityPlusProfit)}</td></tr>`
    : ''
}
<tr class="total"><td colspan="2">หนี้สิน+ทุน / L+E${Math.abs(st.unclosedProfit) > 0.01 ? '+NI' : ''}</td><td class="num">${money(st.liabilities + equityPlusProfit)}</td></tr>
</tbody></table>
<p class="tb-flow-meta">${st.balanced ? 'งบดุลลงตัว / Balanced' : 'งบดุลยังไม่ลงตัว / Unbalanced'}</p>
</div>`
}

/** 엑셀 HTML용 — 리치 CSS + 플로우 본문 */
export function wrapFlowReportForExcel(innerHtml: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>${erpExcelRichTableCss()}
.tb-flow-company{font-size:16pt;font-weight:700}
.tb-flow-title{font-size:14pt;font-weight:700}
.tb-flow-meta{font-size:10pt;color:#475569;margin-bottom:8px}
.tb-flow table{border-collapse:collapse;width:100%;font-family:Calibri,"Malgun Gothic","Noto Sans Thai",Arial,sans-serif;font-size:10pt}
.tb-flow th,.tb-flow td{border:1px solid #94a3b8;padding:6px 8px}
.tb-flow th{background:#1e293b;color:#fff}
.tb-flow td.num{text-align:right;mso-number-format:"\\#\\,\\#\\#0\\.00"}
.tb-flow tr.section td{background:#e2e8f0;font-weight:700}
.tb-flow tr.total td{background:#f1f5f9;font-weight:700}
</style></head><body>${innerHtml}</body></html>`
}

export function printFlowReportHtml(innerHtml: string): void {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Tax book</title>
<style>${taxBookFlowReportScreenCss()} body{padding:16px} @page{margin:12mm}</style>
</head><body>${innerHtml}<script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>`)
  w.document.close()
}
