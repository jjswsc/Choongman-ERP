/** 지출 등록 — 원천징수(หัก ณ ที่จ่าย) 여러 건 */

export type ExpenseWhtItem = {
  /** 50 ทวิ 표시용 소득유형 (ค่าเช่า, ค่าบริการ 등) */
  incomeType: string
  /** 세율 % */
  rate: number
  /** จำนวนเงินที่จ่าย (VAT 제외 과세표준) */
  baseAmount: number
  /** ภาษีที่หัก */
  taxAmount: number
}

export type ExpenseWhtIncomeOption = {
  value: string
  defaultRate: number
}

/** มาตรา 3 เตรส 등 현장에서 자주 쓰는 유형 + 기본 세율 */
export const EXPENSE_WHT_INCOME_OPTIONS: readonly ExpenseWhtIncomeOption[] = [
  { value: 'ค่าเช่า', defaultRate: 5 },
  { value: 'ค่าบริการ', defaultRate: 3 },
  { value: 'ค่าโฆษณา', defaultRate: 2 },
  { value: 'ค่าขนส่ง', defaultRate: 1 },
  { value: 'ค่าจ้างทำของ', defaultRate: 3 },
  { value: 'ค่าแสดง', defaultRate: 5 },
  { value: 'อื่นๆ', defaultRate: 3 },
] as const

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100
}

export function isMissingWhtItemsColumnError(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('withholding_tax_items') &&
    (/column/i.test(msg) || /42703/.test(msg) || /pgrst204/.test(msg) || /does not exist/.test(msg) || /could not find/.test(msg))
  )
}

export function defaultRateForWhtIncomeType(incomeType: string): number {
  const v = String(incomeType || '').trim()
  const found = EXPENSE_WHT_INCOME_OPTIONS.find((o) => o.value === v)
  return found?.defaultRate ?? 3
}

export function concatExpenseWhtIncomeTypes(items: ExpenseWhtItem[]): string {
  const labels = items
    .map((x) => String(x.incomeType || '').trim())
    .filter(Boolean)
  const uniq: string[] = []
  for (const lab of labels) {
    if (!uniq.includes(lab)) uniq.push(lab)
  }
  return uniq.join(', ')
}

export function sumExpenseWhtTax(items: ExpenseWhtItem[]): number {
  return roundMoney2(items.reduce((s, x) => s + Math.max(0, Number(x.taxAmount) || 0), 0))
}

export function sumExpenseWhtBase(items: ExpenseWhtItem[]): number {
  return roundMoney2(items.reduce((s, x) => s + Math.max(0, Number(x.baseAmount) || 0), 0))
}

/** 한 종류면 그 세율, 여러 세율이 섞이면 null */
export function primaryExpenseWhtRate(items: ExpenseWhtItem[]): number | null {
  const rates = [
    ...new Set(
      items
        .map((x) => Number(x.rate) || 0)
        .filter((r) => r > 0)
        .map((r) => roundMoney2(r))
    ),
  ]
  if (rates.length === 1) return rates[0]
  return null
}

export function taxAmountFromWhtBase(baseAmount: number, ratePercent: number): number {
  const base = Math.max(0, Number(baseAmount) || 0)
  const rate = Math.max(0, Number(ratePercent) || 0)
  if (base <= 0 || rate <= 0) return 0
  return roundMoney2(base * (rate / 100))
}

function parseOneItem(raw: unknown): ExpenseWhtItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const incomeType = String(o.incomeType ?? o.income_type ?? '').trim()
  const rate = Math.max(0, Number(o.rate ?? o.whtRate ?? o.wht_rate) || 0)
  const baseAmount = roundMoney2(Math.max(0, Number(o.baseAmount ?? o.base_amount ?? o.grossAmount ?? o.gross_amount) || 0))
  let taxAmount = roundMoney2(Math.max(0, Number(o.taxAmount ?? o.tax_amount ?? o.whtAmount ?? o.wht_amount) || 0))
  if (taxAmount <= 0 && baseAmount > 0 && rate > 0) {
    taxAmount = taxAmountFromWhtBase(baseAmount, rate)
  }
  if (taxAmount <= 0 && baseAmount <= 0) return null
  return {
    incomeType: incomeType || 'ค่าบริการ',
    rate,
    baseAmount,
    taxAmount,
  }
}

/** DB jsonb / API 배열 / JSON 문자열 */
export function normalizeExpenseWhtItems(raw: unknown): ExpenseWhtItem[] {
  if (raw == null || raw === '') return []
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    try {
      parsed = JSON.parse(s)
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) {
    const one = parseOneItem(parsed)
    return one ? [one] : []
  }
  const out: ExpenseWhtItem[] = []
  for (const row of parsed) {
    const item = parseOneItem(row)
    if (item) out.push(item)
  }
  return out.slice(0, 12)
}

/** 총액만 있고 항목이 없을 때 증명서·원장용 1건 */
export function expenseWhtItemsFromTotals(params: {
  items?: unknown
  taxAmount: number
  baseAmount: number
  rate?: number | null
  incomeType?: string
}): ExpenseWhtItem[] {
  const fromJson = normalizeExpenseWhtItems(params.items)
  if (fromJson.length > 0) return fromJson
  const tax = roundMoney2(Math.max(0, Number(params.taxAmount) || 0))
  if (tax <= 0) return []
  const base = roundMoney2(Math.max(0, Number(params.baseAmount) || 0))
  const rateRaw = Number(params.rate)
  const rate =
    Number.isFinite(rateRaw) && rateRaw > 0
      ? roundMoney2(rateRaw)
      : base > 0
        ? roundMoney2((tax / base) * 100)
        : 0
  return [
    {
      incomeType: String(params.incomeType || '').trim() || 'ค่าบริการ',
      rate,
      baseAmount: base,
      taxAmount: tax,
    },
  ]
}

export function serializeExpenseWhtItems(items: ExpenseWhtItem[]): ExpenseWhtItem[] | null {
  const normalized = normalizeExpenseWhtItems(items)
  return normalized.length > 0 ? normalized : null
}

/** API body: items 있으면 그대로, 없으면 빈 배열(레거시는 합계만) */
export function parseExpenseWhtItemsFromBody(
  body: { withholdingTaxItems?: unknown; withholding_tax_items?: unknown }
): ExpenseWhtItem[] | undefined {
  if (!body || typeof body !== 'object') return undefined
  if (!Object.prototype.hasOwnProperty.call(body, 'withholdingTaxItems') &&
      !Object.prototype.hasOwnProperty.call(body, 'withholding_tax_items')) {
    return undefined
  }
  return normalizeExpenseWhtItems(body.withholdingTaxItems ?? body.withholding_tax_items)
}
