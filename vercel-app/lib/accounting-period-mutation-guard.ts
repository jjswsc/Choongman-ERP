/** 마감월 원거래·분개 변경 가드 — 순수 유틸 (기간 조회는 assertAccountingDateOpen) */

export const ACCOUNTING_PERIOD_CLOSED_CODE = 'ACCOUNTING_PERIOD_CLOSED'

export function isAccountingPeriodClosedError(e: unknown): boolean {
  return e instanceof Error && e.message === ACCOUNTING_PERIOD_CLOSED_CODE
}

export function accountingPeriodClosedMessage(kind: 'edit' | 'delete' = 'edit'): string {
  return kind === 'delete'
    ? '마감된 회계기간의 거래는 삭제할 수 없습니다.'
    : '마감된 회계기간의 거래는 수정할 수 없습니다.'
}

/** 입고 헤더에서 증빙만 바꾸는 키 — 마감 후에도 인보이스 수령 표시는 허용 */
export const INBOUND_HEADER_METADATA_KEYS = [
  'invoice_received',
  'invoice_no',
  'invoice_photo_url',
  'po_no',
] as const

export function inboundHeaderPatchAffectsClosedPeriod(patchKeys: string[]): boolean {
  const meta = new Set<string>(INBOUND_HEADER_METADATA_KEYS)
  return patchKeys.some((k) => !meta.has(k))
}

export type AccountingPeriodCheck = { dateYmd: string; storeName: string | null }

/** 분개·원장 행에서 마감 검사할 (일자, 매장) 중복 제거 */
export function uniqueAccountingPeriodChecks(
  rows: Array<{ accounting_date?: string | null; store_name?: string | null }>
): AccountingPeriodCheck[] {
  const seen = new Set<string>()
  const out: AccountingPeriodCheck[] = []
  for (const row of rows) {
    const dateYmd = String(row.accounting_date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) continue
    const storeName = String(row.store_name || '').trim() || null
    const key = `${dateYmd}|${storeName || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ dateYmd, storeName })
  }
  return out
}
