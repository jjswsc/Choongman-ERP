/** 계정과목 표시용 (API·손익 등 공통) */
export type AccountSubjectI18nFields = {
  code?: string
  name: string
  nameEn?: string | null
  nameTh?: string | null
}

/**
 * chart of accounts 행을 UI 언어에 맞게 표시합니다.
 * - ko: 코드 + 한글명
 * - th: 코드 + (태국어명 → 영문명 → 한글명)
 * - 그 외(mm, la, kh, vi, ms, en): 코드 + (영문명 → 한글명)
 */
export function formatAccountSubjectLabel(lang: string, row: AccountSubjectI18nFields): string {
  const code = String(row.code || '').trim()
  const nameKo = String(row.name || '').trim()
  const nameEn = String(row.nameEn || '').trim()
  const nameTh = String(row.nameTh || '').trim()

  let displayName = nameKo
  if (lang === 'ko') {
    displayName = nameKo
  } else if (lang === 'th') {
    displayName = nameTh || nameEn || nameKo
  } else {
    displayName = nameEn || nameKo
  }

  const combined = [code, displayName || nameKo].filter(Boolean).join(' ').trim()
  return combined || displayName || nameKo || code
}
