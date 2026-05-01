/** POS 금액 입력: 표시만 천 단위 콤마, 저장·계산 시 parseBahtAmount */

export function parseBahtAmount(raw: string | undefined | null): number {
  if (raw == null) return 0
  const s = String(raw).replace(/,/g, '').trim()
  if (s === '' || s === '.' || s === '-' || s === '-.') return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** 입력 문자열을 정규 포맷(정수 부분 천단위 콤마, 소수 최대 2자리). */
export function formatBahtInputDisplay(raw: string): string {
  const normalized = String(raw).replace(/,/g, '').replace(/[^\d.]/g, '')
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
