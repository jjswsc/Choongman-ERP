/** Realtime pos_orders UPDATE — 테이블 이동(table_name만 변경) vs 추가주문 구분 */

function rowItemsJsonSnapshot(row: Record<string, unknown>): string {
  const raw = row.items_json
  if (raw == null) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

/** table_name만 바뀌고 품목·소계가 같으면 true (추가주문 인쇄 제외) */
export function isPosDineInTableNameOnlyUpdate(
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>
): boolean {
  const oldTable = String(oldRow.table_name ?? '').trim()
  const newTable = String(newRow.table_name ?? '').trim()
  if (!oldTable || !newTable || oldTable === newTable) return false

  if (rowItemsJsonSnapshot(oldRow) !== rowItemsJsonSnapshot(newRow)) return false

  const oldSub = Number(oldRow.subtotal ?? 0) || 0
  const newSub = Number(newRow.subtotal ?? 0) || 0
  if (Math.abs(oldSub - newSub) > 0.01) return false

  const oldTotal = Number(oldRow.total ?? 0) || 0
  const newTotal = Number(newRow.total ?? 0) || 0
  if (Math.abs(oldTotal - newTotal) > 0.01) return false

  return true
}
