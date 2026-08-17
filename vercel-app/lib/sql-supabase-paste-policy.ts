/**
 * Supabase SQL Editor 붙여넣기 단위.
 * 에디터는 붙여넣은 전체를 한 번에 실행하므로, 독립 조회는 문(statement) 1개여야 한다.
 */
export function stripSqlComments(sql: string): string {
  return String(sql || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*--[^\n]*$/gm, " ")
}

export function countSupabasePasteStatements(sql: string): number {
  const body = stripSqlComments(sql)
  const parts = body
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return parts.length
}

export function isSingleSupabasePaste(sql: string): boolean {
  return countSupabasePasteStatements(sql) === 1
}
