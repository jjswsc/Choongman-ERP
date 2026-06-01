/**
 * 본사 매출·매입 원장에만 등장하는 거래처/location 표기.
 * erp_stores 가맹 매장 alias 가 아님 — 본사(Office) 필터 선택 시에만 집계에 포함.
 */
const HEAD_OFFICE_COUNTERPARTY_LABELS = [
  'Aum',
  'Bangna Saemaeul Gamjatang',
  'Office-Logistic',
  'POS',
  'R&B Food Supply',
  '본사',
  '입고등록',
] as const

function normCounterpartyKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
}

const HEAD_OFFICE_COUNTERPARTY_KEYS = new Set(
  HEAD_OFFICE_COUNTERPARTY_LABELS.map((label) => normCounterpartyKey(label))
)

/** 원장·재고 location 등 — 가맹 매장이 아닌 본사 거래처 표기 */
export function isHeadOfficeCounterpartyLabel(name: string): boolean {
  const key = normCounterpartyKey(name)
  if (!key) return false
  return HEAD_OFFICE_COUNTERPARTY_KEYS.has(key)
}

export function listHeadOfficeCounterpartyLabels(): readonly string[] {
  return HEAD_OFFICE_COUNTERPARTY_LABELS
}
