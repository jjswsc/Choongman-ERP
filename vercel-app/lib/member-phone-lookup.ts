/** 회원 포털·CRM 공통 — 태국 휴대폰 번호 조회용 변형 */

function toText(v: unknown): string {
  return String(v || '').trim()
}

export function normalizeMemberPhone(phone: string): string {
  return toText(phone).replace(/[^\d+]/g, '')
}

/** DB 저장·중복 판정용 — 태국 휴대폰은 선행 0 포함 10자리로 통일 */
export function canonicalMemberPhoneForStorage(phone: string): string {
  const raw = normalizeMemberPhone(phone)
  if (!raw) return ''
  let digits = raw.startsWith('+') ? raw.slice(1) : raw
  if (digits.startsWith('66') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`
  } else if (/^\d{9}$/.test(digits)) {
    digits = `0${digits}`
  }
  return digits
}

/** 동일인 중복 그룹 키 — 선행 0·66 국가코드 차이 무시 */
export function canonicalPhoneDedupeKey(phone: string): string {
  return canonicalMemberPhoneForStorage(phone)
}

/** DB에 0 / 66 / 선행 0 없음 등 여러 형식으로 저장된 번호를 찾기 위한 후보 */
export function memberPhoneLookupVariants(phone: string): string[] {
  const raw = normalizeMemberPhone(phone)
  if (!raw) return []
  const digits = raw.startsWith('+') ? raw.slice(1) : raw
  const out = new Set<string>([raw, digits])

  if (digits.startsWith('66') && digits.length >= 11) {
    const local = `0${digits.slice(2)}`
    out.add(local)
    out.add(digits.slice(2))
    out.add(`+${digits}`)
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    out.add(`66${digits.slice(1)}`)
    out.add(digits.slice(1))
    out.add(`+66${digits.slice(1)}`)
  }
  if (/^\d{9}$/.test(digits)) {
    out.add(`0${digits}`)
    out.add(`66${digits}`)
    out.add(`+66${digits}`)
  }

  return [...out].filter(Boolean)
}

/** 방콕 CRM 입력·비교용 YYYY-MM-DD */
export function normalizeMemberBirthDateInput(raw: string): string {
  const v = toText(raw)
  if (!v) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)

  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  const ymd = v.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/)
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
  }

  return v.slice(0, 10)
}

export function memberBirthDatesMatch(stored: string, input: string): boolean {
  const a = normalizeMemberBirthDateInput(stored)
  const b = normalizeMemberBirthDateInput(input)
  if (!a || !b) return false
  return a === b
}

export function composeBirthDateFromParts(day: string, month: string, year: string): string {
  const d = toText(day)
  const m = toText(month)
  const y = toText(year)
  if (!d || !m || !y) return ''
  const iso = normalizeMemberBirthDateInput(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`)
  const parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!parts) return ''
  const yy = Number(parts[1])
  const mm = Number(parts[2])
  const dd = Number(parts[3])
  const probe = new Date(yy, mm - 1, dd)
  if (probe.getFullYear() !== yy || probe.getMonth() !== mm - 1 || probe.getDate() !== dd) return ''
  return iso
}

export function splitBirthDateParts(iso: string): { day: string; month: string; year: string } {
  const normalized = normalizeMemberBirthDateInput(iso)
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return { day: '', month: '', year: '' }
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) }
}
