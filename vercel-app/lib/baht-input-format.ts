/** POS 금액 입력: 표시만 천 단위 콤마, 저장·계산 시 parseBahtAmount */

/** 태국·전각 숫자 → ASCII 0-9 (POS 결산 입력과 동일) */
export function normalizeDigitChars(raw: string): string {
  return String(raw || '')
    .replace(/[๐-๙]/g, (ch) => String(ch.charCodeAt(0) - 0x0e50))
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
}

export function parseBahtAmount(raw: string | undefined | null): number {
  if (raw == null) return 0
  const s = normalizeDigitChars(String(raw)).replace(/,/g, '').trim()
  if (s === '' || s === '.' || s === '-' || s === '-.') return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** 캐럿 앞의 숫자·소수점 개수 (콤마 무시) — 포맷 후 selection 복원용 */
export function countBahtDigitLikeBefore(raw: string, caret: number): number {
  const s = String(raw || '')
  const end = Math.max(0, Math.min(caret, s.length))
  let n = 0
  for (let i = 0; i < end; i++) {
    const ch = s[i]
    if ((ch >= '0' && ch <= '9') || ch === '.') n++
  }
  return n
}

/** digitLike 개수에 해당하는 포맷 문자열 내 캐럿 위치 */
export function caretFromBahtDigitLikeCount(formatted: string, digitLikeCount: number): number {
  if (digitLikeCount <= 0) return 0
  const s = String(formatted || '')
  let seen = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      seen++
      if (seen >= digitLikeCount) return i + 1
    }
  }
  return s.length
}

/** 콤마 재삽입 후에도 타이핑 위치가 유지되도록 selection 인덱스 계산 */
export function selectionAfterBahtFormat(
  rawBeforeFormat: string,
  caretBefore: number,
  formatted: string
): number {
  return caretFromBahtDigitLikeCount(
    formatted,
    countBahtDigitLikeBefore(rawBeforeFormat, caretBefore)
  )
}

/** 입력 문자열을 정규 포맷(정수 부분 천단위 콤마, 소수 최대 2자리). */
export function formatBahtInputDisplay(raw: string): string {
  const normalized = normalizeDigitChars(String(raw)).replace(/,/g, '').replace(/[^\d.]/g, '')
  if (normalized === '') return ''

  const firstDot = normalized.indexOf('.')
  let intRaw: string
  let fracRaw: string
  if (firstDot === -1) {
    intRaw = normalized
    fracRaw = ''
  } else {
    intRaw = normalized.slice(0, firstDot)
    fracRaw = normalized.slice(firstDot + 1).replace(/\./g, '')
  }
  fracRaw = fracRaw.slice(0, 2)

  const endsWithDot =
    normalized.endsWith('.') && fracRaw === '' && normalized.includes('.')
  const intDigits = intRaw.replace(/\D/g, '')

  if (intDigits === '' && fracRaw === '') {
    return endsWithDot ? '0.' : ''
  }
  if (intDigits === '' && fracRaw !== '') {
    return `0.${fracRaw}`
  }

  const intNum = parseInt(intDigits, 10)
  if (!Number.isFinite(intNum)) return ''
  const intStr = intNum.toLocaleString('en-US')
  if (fracRaw !== '') return `${intStr}.${fracRaw}`
  if (endsWithDot) return `${intStr}.`
  return intStr
}

/** DB/숫자 → 입력란 문자열 (0이면 빈 칸). */
export function formatBahtAmountForField(n: number | string | undefined | null): string {
  const num = typeof n === 'number' ? n : parseBahtAmount(String(n ?? ''))
  if (!Number.isFinite(num) || Math.abs(num) < 1e-9) return ''
  return formatBahtInputDisplay(String(num))
}

export function mapBreakdownStringsToBahtDisplay(rec: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(rec).map(([k, v]) => {
      const s = String(v ?? '').trim()
      if (s === '') return [k, '']
      return [k, formatBahtAmountForField(s)]
    })
  )
}

/** 정수 입력(포인트·쿠폰 수량·손님 수 직접입력 등): 타이핑 중 빈 칸 허용 */
export function formatIntegerInputDisplay(raw: string, maxDigits = 6): string {
  return normalizeDigitChars(String(raw || '')).replace(/\D/g, '').slice(0, maxDigits)
}

export function parseIntegerInput(raw: string | undefined | null, fallback = 0): number {
  const digits = normalizeDigitChars(String(raw || '')).replace(/\D/g, '')
  if (digits === '') return fallback
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : fallback
}

export function parsePosDiscountValueInput(
  raw: string,
  discountType: 'percent' | 'fixed'
): number {
  if (discountType === 'percent') {
    return Math.min(100, Math.max(0, parseIntegerInput(raw, 0)))
  }
  return Math.max(0, parseBahtAmount(raw))
}

export function formatPosDiscountValueInput(
  value: number,
  discountType: 'percent' | 'fixed'
): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  if (discountType === 'percent') return String(Math.trunc(value))
  return formatBahtAmountForField(value)
}
