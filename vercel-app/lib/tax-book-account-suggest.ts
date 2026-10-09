export type AccountSuggestOption = {
  code: string
  name?: string | null
  nameEn?: string | null
  nameTh?: string | null
}

/**
 * 계정 자동완성 후보.
 * 숫자만 입력하면 그 번호로 시작하는 계정만(41 → 41xx), 글자를 입력하면 코드·계정명 포함 검색.
 */
export function suggestAccountCodes<T extends AccountSuggestOption>(
  options: T[],
  query: string,
  shownName: (row: T) => string,
  limit = 12
): T[] {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return []
  if (/^\d+$/.test(needle)) {
    return options.filter((row) => String(row.code || '').startsWith(needle)).slice(0, limit)
  }
  const hits = options.filter((row) => {
    const blob = [row.code, row.name, row.nameEn, row.nameTh, shownName(row)].join(' ').toLowerCase()
    return blob.includes(needle)
  })
  const codeFirst = (row: T) => (String(row.code || '').toLowerCase().startsWith(needle) ? 0 : 1)
  return hits.sort((a, b) => codeFirst(a) - codeFirst(b) || a.code.localeCompare(b.code)).slice(0, limit)
}
