/**
 * 플로우 어카운트 리포트와 비슷한 시산·손익·재무상태 HTML (화면·엑셀·인쇄 공용).
 */

import type { TaxBookLedgerAccountSection, TaxBookStatements } from '@/lib/tax-book'
import { formatTaxBookLedgerDate } from '@/lib/tax-book-display'
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
  /** UI 언어 — 리포트 제목·헤더 로케일 */
  lang?: string
}

function flowCopy(lang: string | undefined) {
  const l = lang || 'en'
  if (l === 'ko') {
    return {
      unit: '단위: 바트',
      trial: '시산표',
      income: '세무 손익계산서',
      balance: '세무 재무상태표',
      code: '계정코드',
      name: '계정명',
      item: '항목',
      debit: '차변',
      credit: '대변',
      amount: '금액',
      total: '합계',
      revenue: '수익',
      expenses: '비용',
      revenueTotal: '수익 합계',
      expenseTotal: '비용 합계',
      netIncome: '순이익(손실)',
      assets: '자산',
      liabilities: '부채',
      equity: '자본',
      unclosed: '미마감 순이익(손실)',
      equityPlusNi: '자본+순이익 합계',
      le: '부채+자본',
      balanced: '재무상태표 차대가 맞습니다',
      unbalanced: '재무상태표 차대가 맞지 않습니다',
    }
  }
  if (l === 'th') {
    return {
      unit: 'หน่วย: บาท',
      trial: 'งบทดลอง',
      income: 'งบกำไรขาดทุน (ภาษี)',
      balance: 'งบฐานะการเงิน (ภาษี)',
      code: 'รหัสบัญชี',
      name: 'ชื่อบัญชี',
      item: 'รายการ',
      debit: 'เดบิต',
      credit: 'เครดิต',
      amount: 'จำนวนเงิน',
      total: 'รวม',
      revenue: 'รายได้',
      expenses: 'ค่าใช้จ่าย',
      revenueTotal: 'รวมรายได้',
      expenseTotal: 'รวมค่าใช้จ่าย',
      netIncome: 'กำไร(ขาดทุน)สุทธิ',
      assets: 'สินทรัพย์',
      liabilities: 'หนี้สิน',
      equity: 'ส่วนของเจ้าของ',
      unclosed: 'กำไร(ขาดทุน)สุทธิที่ยังไม่ปิด',
      equityPlusNi: 'รวมส่วนของเจ้าของ+กำไร',
      le: 'หนี้สิน+ทุน',
      balanced: 'งบดุลลงตัว',
      unbalanced: 'งบดุลยังไม่ลงตัว',
    }
  }
  return {
    unit: 'Unit: THB',
    trial: 'Trial Balance',
    income: 'Tax Income Statement',
    balance: 'Tax Balance Sheet',
    code: 'Account',
    name: 'Account name',
    item: 'Item',
    debit: 'Debit',
    credit: 'Credit',
    amount: 'Amount',
    total: 'Total',
    revenue: 'Revenue',
    expenses: 'Expenses',
    revenueTotal: 'Total revenue',
    expenseTotal: 'Total expenses',
    netIncome: 'Net income (loss)',
    assets: 'Assets',
    liabilities: 'Liabilities',
    equity: 'Equity',
    unclosed: 'Unclosed net income (loss)',
    equityPlusNi: 'Equity + net income',
    le: 'Liabilities + equity',
    balanced: 'Balanced',
    unbalanced: 'Unbalanced',
  }
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
.tb-flow tr.gap td { border: none; height: 10px; padding: 0; background: transparent; }
.tb-flow-toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
@media print {
  .tb-flow-toolbar, .no-print { display: none !important; }
  .tb-flow { color: #000; }
  .tb-flow th, .tb-flow td { border-color: #333; }
}
`
}

function headerBlock(meta: TaxBookFlowReportMeta, title: string): string {
  const copy = flowCopy(meta.lang)
  const unit = meta.unitLabel || copy.unit
  return `<div class="tb-flow-company">${esc(meta.companyName)}</div>
<div class="tb-flow-title">${esc(title)}</div>
<div class="tb-flow-meta">${esc(meta.asOfLabel)}${meta.periodLabel ? ` · ${esc(meta.periodLabel)}` : ''}<br/>${esc(unit)}</div>`
}

export function buildFlowTrialBalanceHtml(
  meta: TaxBookFlowReportMeta,
  rows: TrialBalanceRow[],
  totals: { debit: number; credit: number }
): string {
  const copy = flowCopy(meta.lang)
  const body = rows
    .map(
      (r) =>
        `<tr><td class="code">${esc(r.accountCode)}</td><td>${esc(r.accountName || '')}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td></tr>`
    )
    .join('')
  return `<div class="tb-flow">
${headerBlock(meta, copy.trial)}
<table>
<thead><tr><th>${esc(copy.code)}</th><th>${esc(copy.name)}</th><th>${esc(copy.debit)}</th><th>${esc(copy.credit)}</th></tr></thead>
<tbody>${body}
<tr class="total"><td colspan="2">${esc(copy.total)}</td><td class="num">${money(totals.debit)}</td><td class="num">${money(totals.credit)}</td></tr>
</tbody></table></div>`
}

export function buildFlowIncomeStatementHtml(meta: TaxBookFlowReportMeta, st: TaxBookStatements): string {
  const copy = flowCopy(meta.lang)
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
${headerBlock(meta, copy.income)}
<table>
<thead><tr><th>${esc(copy.code)}</th><th>${esc(copy.item)}</th><th>${esc(copy.amount)}</th></tr></thead>
<tbody>
<tr class="section"><td colspan="3">${esc(copy.revenue)}</td></tr>
${revRows || `<tr><td colspan="3">—</td></tr>`}
<tr class="total"><td colspan="2">${esc(copy.revenueTotal)}</td><td class="num">${money(st.revenue)}</td></tr>
<tr class="section"><td colspan="3">${esc(copy.expenses)}</td></tr>
${expRows || `<tr><td colspan="3">—</td></tr>`}
<tr class="total"><td colspan="2">${esc(copy.expenseTotal)}</td><td class="num">${money(st.expense)}</td></tr>
<tr class="total"><td colspan="2">${esc(copy.netIncome)}</td><td class="num">${money(st.netIncome)}</td></tr>
</tbody></table></div>`
}

export function buildFlowBalanceSheetHtml(meta: TaxBookFlowReportMeta, st: TaxBookStatements): string {
  const copy = flowCopy(meta.lang)
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
<tr class="total"><td colspan="2">${esc(copy.total)}</td><td class="num">${money(total)}</td></tr>`
  }
  const equityPlusProfit = st.equity + (Math.abs(st.unclosedProfit) > 0.01 ? st.unclosedProfit : 0)
  return `<div class="tb-flow">
${headerBlock(meta, copy.balance)}
<table>
<thead><tr><th>${esc(copy.code)}</th><th>${esc(copy.item)}</th><th>${esc(copy.amount)}</th></tr></thead>
<tbody>
${block('asset', copy.assets)}
${block('liability', copy.liabilities)}
${block('equity', copy.equity)}
${
  Math.abs(st.unclosedProfit) > 0.01
    ? `<tr><td></td><td>${esc(copy.unclosed)}</td><td class="num">${money(st.unclosedProfit)}</td></tr>
<tr class="total"><td colspan="2">${esc(copy.equityPlusNi)}</td><td class="num">${money(equityPlusProfit)}</td></tr>`
    : ''
}
<tr class="total"><td colspan="2">${esc(copy.le)}${Math.abs(st.unclosedProfit) > 0.01 ? '+NI' : ''}</td><td class="num">${money(st.liabilities + equityPlusProfit)}</td></tr>
</tbody></table>
<p class="tb-flow-meta">${st.balanced ? esc(copy.balanced) : esc(copy.unbalanced)}</p>
</div>`
}

export type TaxBookLedgerReportLabels = {
  title: string
  date: string
  book: string
  voucher: string
  description: string
  debit: string
  credit: string
  balance: string
  total: string
  /** 일별장부 라벨. voucherKind 우선, 없으면 sourceType */
  bookLabel: (voucherKindOrSourceType: string | null | undefined, sourceType?: string | null) => string
}

function signedMoney(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return '0.00'
  if (n < 0) return `(${money(-n)})`
  return money(n)
}

function amountOrBlank(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return ''
  return money(n)
}

/** 엑셀이 합계할 수 있는 숫자. 0은 빈칸. */
function excelAmount(n: number, blankZero = false): string {
  if (!Number.isFinite(n)) return ''
  const rounded = Math.round(n * 100) / 100
  if (blankZero && Math.abs(rounded) < 0.005) return ''
  return rounded.toFixed(2)
}

/** 계정별 총계정원장. 계정 헤더의 마지막 칸이 이월잔액이고, 행마다 잔액이 이어진다. */
export function buildFlowLedgerHtml(
  meta: TaxBookFlowReportMeta,
  sections: TaxBookLedgerAccountSection[],
  labels: TaxBookLedgerReportLabels,
  opts?: { numeric?: boolean }
): string {
  const numeric = opts?.numeric === true
  const cols = 7
  const debitCell = (n: number) => (numeric ? excelAmount(n, true) : amountOrBlank(n))
  const balanceCell = (n: number) => (numeric ? excelAmount(n) : signedMoney(n))
  const balanceClass = numeric ? 'bal' : 'num'
  const body = sections
    .map((sec) => {
      const moves = sec.lines
        .map(
          (ln) => `<tr>
<td>${esc(formatTaxBookLedgerDate(ln.accountingDate, meta.lang || 'en'))}</td>
<td>${esc(labels.bookLabel(ln.voucherKind, ln.sourceType))}</td>
<td>${esc(ln.voucherNo)}</td>
<td>${esc(ln.memo)}</td>
<td class="num">${debitCell(ln.debit)}</td>
<td class="num">${debitCell(ln.credit)}</td>
<td class="${balanceClass}">${balanceCell(ln.balance)}</td>
</tr>`
        )
        .join('')
      return `<tr class="section"><td class="code">${esc(sec.accountCode)}</td><td colspan="5">${esc(sec.accountName)}</td><td class="${balanceClass}">${balanceCell(sec.opening)}</td></tr>
${moves}
<tr class="total"><td colspan="4">${esc(labels.total)}</td><td class="num">${numeric ? excelAmount(sec.periodDebit) : money(sec.periodDebit)}</td><td class="num">${numeric ? excelAmount(sec.periodCredit) : money(sec.periodCredit)}</td><td class="${balanceClass}">${balanceCell(sec.closing)}</td></tr>
<tr class="gap"><td colspan="${cols}"></td></tr>`
    })
    .join('')
  return `<div class="tb-flow">
${headerBlock(meta, labels.title)}
<table>
<thead><tr>
<th>${esc(labels.date)}</th>
<th>${esc(labels.book)}</th>
<th>${esc(labels.voucher)}</th>
<th>${esc(labels.description)}</th>
<th>${esc(labels.debit)}</th>
<th>${esc(labels.credit)}</th>
<th>${esc(labels.balance)}</th>
</tr></thead>
<tbody>
${body || `<tr><td colspan="${cols}"></td></tr>`}
</tbody></table>
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
.tb-flow td.bal{text-align:right;mso-number-format:"\\#\\,\\#\\#0\\.00;\\(\\#\\,\\#\\#0\\.00\\)"}
.tb-flow tr.section td{background:#e2e8f0;font-weight:700}
.tb-flow tr.total td{background:#f1f5f9;font-weight:700}
.tb-flow tr.gap td{border:none;height:8px}
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
