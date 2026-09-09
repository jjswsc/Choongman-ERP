/** PostgREST: 테이블 없음(42P01) 또는 스키마 캐시 미스(PGRST205). */

export function isMissingPostgrestTableError(e: unknown, tableName?: string): boolean {
  const msg = String(e ?? '')
  const generic =
    /42P01/i.test(msg) ||
    /PGRST205/i.test(msg) ||
    /Could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  if (!generic) return false
  if (!tableName) return true
  return msg.includes(tableName)
}
