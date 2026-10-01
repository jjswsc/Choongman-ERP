/**
 * 플로우 어카운트 등 외부 시산(재무상태) → 세무 장부 기초 전표.
 * 손익(4·5)은 넣지 않고, 차대 차이는 이익잉여금(3120)으로 맞춘다.
 */

import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { roundTaxAmount, taxJournalBalanced, type TaxJournalLineDraft } from '@/lib/tax-book'

export type ExternalTrialBalanceRow = {
  code: string
  endDebit: number
  endCredit: number
}

/** FlowAccount(S&J) → ERP 계정. 미매핑은 건너뛰고 3120으로 흡수된다. */
export function mapFlowAccountCodeToErp(code: string): string | null {
  const c = String(code || '').trim()
  if (!c) return null
  if (c === '11511') return '1460'
  if (/^111/.test(c)) return '1010'
  if (/^113/.test(c)) return '1130'
  if (c === '11410' || /^114/.test(c)) return '1150'
  if (/^119/.test(c)) return '1160'
  if (/^126/.test(c)) return '1490'
  if (/^186/.test(c)) return '1470'
  if (c === '17113' || c === '17111' || c === '17114') return '1360'
  if (c === '17120' || c === '27125') return '1160'
  if (/^191|^192/.test(c)) return '3120'
  if (/^213/.test(c)) return '2110'
  if (/^214/.test(c)) return '2150'
  if (c === '21924') return '2160'
  if (c === '21952.01' || /^21952/.test(c)) return '2195'
  if (/^21951|^21953|^21911|^21919/.test(c)) return '2110'
  if (/^2712[1-4]/.test(c)) return '2190'
  if (c === '27140' || c === '27111') return '2180'
  if (/^311/.test(c)) return '3110'
  if (/^34/.test(c)) return '3120'
  return null
}

function addBucket(
  buckets: Record<string, { debit: number; credit: number }>,
  code: string,
  debit: number,
  credit: number
) {
  if (!buckets[code]) buckets[code] = { debit: 0, credit: 0 }
  buckets[code].debit += debit
  buckets[code].credit += credit
}

/**
 * 외부 시산 잔액 + ERP 재고액으로 세무 기초 분개 행을 만든다.
 * inventorySourceCodes 합계를 빼고 inventoryAmount를 1460에 넣는다.
 */
export function buildTaxOpeningBalanceLines(input: {
  rows: ExternalTrialBalanceRow[]
  inventoryAmount: number
  inventorySourceCodes?: string[]
}): { lines: TaxJournalLineDraft[]; flowInventory: number; inventoryDelta: number } {
  const invCodes = new Set(
    (input.inventorySourceCodes || ['11511']).map((c) => String(c || '').trim()).filter(Boolean)
  )
  let flowInventory = 0
  const buckets: Record<string, { debit: number; credit: number }> = {}

  for (const row of input.rows) {
    const code = String(row.code || '').trim()
    if (!code || !/^[123]/.test(code)) continue
    const endDr = Math.max(0, Number(row.endDebit) || 0)
    const endCr = Math.max(0, Number(row.endCredit) || 0)
    if (endDr < 0.005 && endCr < 0.005) continue
    if (invCodes.has(code)) {
      flowInventory += endDr - endCr
      continue
    }
    const erp = mapFlowAccountCodeToErp(code)
    if (!erp) {
      addBucket(buckets, '3120', endDr, endCr)
      continue
    }
    addBucket(buckets, erp, endDr, endCr)
  }

  const inv = Math.max(0, roundTaxAmount(Number(input.inventoryAmount) || 0))
  if (inv > 0) addBucket(buckets, '1460', inv, 0)

  let debit = 0
  let credit = 0
  for (const b of Object.values(buckets)) {
    const net = b.debit - b.credit
    if (net > 0.005) debit += net
    else if (net < -0.005) credit += -net
  }
  const diff = roundTaxAmount(debit - credit)
  if (Math.abs(diff) >= 0.005) {
    if (!buckets['3120']) buckets['3120'] = { debit: 0, credit: 0 }
    if (diff > 0) buckets['3120'].credit += diff
    else buckets['3120'].debit += -diff
  }

  const lines: TaxJournalLineDraft[] = []
  for (const code of Object.keys(buckets).sort()) {
    const b = buckets[code]
    const net = roundTaxAmount(b.debit - b.credit)
    if (Math.abs(net) < 0.005) continue
    const meta = accountLine(code)
    lines.push({
      accountCode: code,
      accountName: meta.accountName,
      side: net > 0 ? 'debit' : 'credit',
      amount: Math.abs(net),
    })
  }

  if (!taxJournalBalanced(lines)) {
    throw new Error('UNBALANCED')
  }

  return {
    lines,
    flowInventory: roundTaxAmount(flowInventory),
    inventoryDelta: roundTaxAmount(inv - flowInventory),
  }
}

/** S&J Global(TIN 0105566137147) FlowAccount 시산 — As at 30 June 2026 */
export const SJ_GLOBAL_FLOW_TB_2026_06_30: ExternalTrialBalanceRow[] = [
  { code: '11112', endDebit: 51311.83, endCredit: 0 },
  { code: '11122.01', endDebit: 6297331.07, endCredit: 0 },
  { code: '11311', endDebit: 2680107.48, endCredit: 0 },
  { code: '11319', endDebit: 350296.74, endCredit: 0 },
  { code: '11399', endDebit: 0, endCredit: 125.1 },
  { code: '11410', endDebit: 0, endCredit: 10000 },
  { code: '11511', endDebit: 6117698.34, endCredit: 0 },
  { code: '11921', endDebit: 255044.43, endCredit: 0 },
  { code: '11922', endDebit: 6000, endCredit: 0 },
  { code: '12611', endDebit: 114658.79, endCredit: 0 },
  { code: '12612', endDebit: 422776.92, endCredit: 0 },
  { code: '12613', endDebit: 15173.57, endCredit: 0 },
  { code: '17113', endDebit: 951274.05, endCredit: 0 },
  { code: '17120', endDebit: 148186.58, endCredit: 0 },
  { code: '18611', endDebit: 0, endCredit: 28077.58 },
  { code: '18612', endDebit: 0, endCredit: 179235.82 },
  { code: '18613', endDebit: 0, endCredit: 72537.29 },
  { code: '19191', endDebit: 0, endCredit: 0.92 },
  { code: '19291', endDebit: 0, endCredit: 1083.25 },
  { code: '21311', endDebit: 0, endCredit: 15355350.52 },
  { code: '21398', endDebit: 0, endCredit: 18124 },
  { code: '21399', endDebit: 0, endCredit: 140022.45 },
  { code: '21410', endDebit: 0, endCredit: 6831970.12 },
  { code: '21450.02', endDebit: 0, endCredit: 396618.98 },
  { code: '21450.03', endDebit: 0, endCredit: 3000000 },
  { code: '21911.03', endDebit: 0, endCredit: 533.93 },
  { code: '21911.05', endDebit: 0, endCredit: 50500 },
  { code: '21919', endDebit: 0, endCredit: 275703.65 },
  { code: '21924', endDebit: 0, endCredit: 354220 },
  { code: '21951.01', endDebit: 0, endCredit: 403162.66 },
  { code: '21951.99', endDebit: 0, endCredit: 1000 },
  { code: '21952.01', endDebit: 0, endCredit: 80080 },
  { code: '21953', endDebit: 0, endCredit: 35586.01 },
  { code: '27121', endDebit: 0, endCredit: 7687.51 },
  { code: '27123', endDebit: 0, endCredit: 2904.47 },
  { code: '27124', endDebit: 0, endCredit: 59118.56 },
  { code: '27125', endDebit: 29898.34, endCredit: 0 },
  { code: '27140', endDebit: 0, endCredit: 83852.94 },
  { code: '31110', endDebit: 0, endCredit: 2000000 },
  { code: '34200', endDebit: 8537980.24, endCredit: 0 },
  { code: '34998', endDebit: 1017733.27, endCredit: 0 },
]

export const SJ_GLOBAL_TAX_ENTITY = 'tin:0105566137147'
export const SJ_GLOBAL_OPENING_DATE = '2026-07-01'
export const SJ_GLOBAL_FLOW_INVENTORY_2026_06_30 = 6117698.34
