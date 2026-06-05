import {
  memberPhoneLookupVariants,
  normalizeMemberBirthDateInput,
  normalizeMemberPhone,
} from '@/lib/member-phone-lookup'

function toText(v: unknown): string {
  return String(v || '').trim()
}

/**
 * PostgREST members 검색용 `or=(…)` 필터.
 * `birth_date`는 date 타입이라 ilike 불가 → ISO 날짜일 때만 eq.
 */
export function buildMemberSearchPostgrestOrFilter(q: string): string {
  const trimmed = toText(q)
  if (!trimmed) return ''

  const escaped = encodeURIComponent(`*${trimmed}*`)
  const normalizedDigits = normalizeMemberPhone(trimmed).replace(/^\+/, '')
  const normalizedDigitsEscaped = normalizedDigits ? encodeURIComponent(`*${normalizedDigits}*`) : ''

  const clauses = [
    `name.ilike.${escaped}`,
    `full_name.ilike.${escaped}`,
    `line_display_name.ilike.${escaped}`,
    `phone.ilike.${escaped}`,
    `email.ilike.${escaped}`,
    `member_no.ilike.${escaped}`,
    `tier_code.ilike.${escaped}`,
  ]

  if (normalizedDigits && normalizedDigits !== trimmed) {
    clauses.push(`phone.ilike.${normalizedDigitsEscaped}`)
  }

  for (const phone of memberPhoneLookupVariants(trimmed)) {
    clauses.push(`phone.eq.${encodeURIComponent(phone)}`)
  }

  const birthIso = normalizeMemberBirthDateInput(trimmed)
  if (birthIso && /^\d{4}-\d{2}-\d{2}$/.test(birthIso)) {
    clauses.push(`birth_date.eq.${encodeURIComponent(birthIso)}`)
  }

  return `or=(${clauses.join(',')})`
}
