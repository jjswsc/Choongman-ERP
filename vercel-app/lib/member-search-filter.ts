import {
  memberPhoneLookupVariants,
  normalizeMemberBirthDateInput,
  normalizeMemberPhone,
} from '@/lib/member-phone-lookup'

function toText(v: unknown): string {
  return String(v || '').trim()
}

/** 회원 목록 UI — 필드별 검색 (채워진 조건은 모두 AND) */
export type MemberSearchFieldDraft = {
  name: string
  phone: string
  memberNo: string
  email: string
  birthDate: string
}

export const emptyMemberSearchFieldDraft: MemberSearchFieldDraft = {
  name: '',
  phone: '',
  memberNo: '',
  email: '',
  birthDate: '',
}

export type MemberSearchFieldKey = keyof MemberSearchFieldDraft

const MEMBER_SEARCH_FIELD_KEYS: MemberSearchFieldKey[] = [
  'name',
  'phone',
  'memberNo',
  'email',
  'birthDate',
]

export function listFilledMemberSearchFields(fields: MemberSearchFieldDraft): MemberSearchFieldKey[] {
  return MEMBER_SEARCH_FIELD_KEYS.filter((key) => toText(fields[key]))
}

export function countFilledMemberSearchFields(fields: MemberSearchFieldDraft): number {
  return listFilledMemberSearchFields(fields).length
}

export function hasMemberSearchFields(fields?: MemberSearchFieldDraft | null): boolean {
  if (!fields) return false
  return countFilledMemberSearchFields(fields) > 0
}

/** UI 결과 라벨용 — "이름:Kim · 전화:08…" */
export function formatMemberSearchFieldsSummary(
  fields: MemberSearchFieldDraft,
  labels: Partial<Record<MemberSearchFieldKey, string>>
): string {
  return listFilledMemberSearchFields(fields)
    .map((key) => `${labels[key] || key}:${toText(fields[key])}`)
    .join(' · ')
}

function buildNameOrFilter(value: string): string {
  const trimmed = toText(value)
  if (!trimmed) return ''
  const escaped = encodeURIComponent(`*${trimmed}*`)
  return `or=(name.ilike.${escaped},full_name.ilike.${escaped},line_display_name.ilike.${escaped})`
}

function buildPhoneOrFilter(value: string): string {
  const trimmed = toText(value)
  if (!trimmed) return ''
  const clauses: string[] = [`phone.ilike.${encodeURIComponent(`*${trimmed}*`)}`]
  const normalizedDigits = normalizeMemberPhone(trimmed).replace(/^\+/, '')
  if (normalizedDigits && normalizedDigits !== trimmed) {
    clauses.push(`phone.ilike.${encodeURIComponent(`*${normalizedDigits}*`)}`)
  }
  for (const phone of memberPhoneLookupVariants(trimmed)) {
    clauses.push(`phone.eq.${encodeURIComponent(phone)}`)
  }
  return `or=(${clauses.join(',')})`
}

function buildMemberNoFilter(value: string): string {
  const trimmed = toText(value)
  if (!trimmed) return ''
  return `member_no.ilike.${encodeURIComponent(`*${trimmed}*`)}`
}

function buildEmailFilter(value: string): string {
  const trimmed = toText(value)
  if (!trimmed) return ''
  return `email.ilike.${encodeURIComponent(`*${trimmed}*`)}`
}

function buildBirthDateFilter(value: string): string {
  const trimmed = toText(value)
  if (!trimmed) return ''
  const birthIso = normalizeMemberBirthDateInput(trimmed)
  if (!birthIso || !/^\d{4}-\d{2}-\d{2}$/.test(birthIso)) return ''
  return `birth_date.eq.${encodeURIComponent(birthIso)}`
}

/**
 * 필드별 조건을 `&` 로 이어 PostgREST AND 검색.
 * 각 필드 내부(이름 OR LINE표시명 등)는 or=() 유지.
 */
export function buildMemberSearchPostgrestAndFilter(fields: MemberSearchFieldDraft): string {
  return [
    buildNameOrFilter(fields.name),
    buildPhoneOrFilter(fields.phone),
    buildMemberNoFilter(fields.memberNo),
    buildEmailFilter(fields.email),
    buildBirthDateFilter(fields.birthDate),
  ]
    .filter(Boolean)
    .join('&')
}

/**
 * PostgREST members 검색용 `or=(…)` 필터 (단일 키워드).
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

  // 순수 숫자이면서 전화번호처럼 보이지 않을 때 id 직접 조회 (딥링크 memberId)
  // 0으로 시작하거나 9자 이상 → 전화로 보고 id 검색 생략
  if (/^\d{1,8}$/.test(trimmed) && !trimmed.startsWith('0')) {
    clauses.push(`id.eq.${trimmed}`)
  }

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
