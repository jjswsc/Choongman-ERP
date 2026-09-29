/** 직원 코드: 영문 2자 + 숫자 3자 (예: ST001). DB check와 동일. */
export const EMPLOYEE_CODE_RE = /^[A-Z]{2}\d{3}$/

export function normalizeEmployeeCodeInput(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
}

export function isEmployeeCodeFormat(raw: unknown): boolean {
  return EMPLOYEE_CODE_RE.test(normalizeEmployeeCodeInput(raw))
}

function storePrefixFromName(storeName: string): string {
  const alpha = String(storeName || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (alpha.length >= 2) return alpha.slice(0, 2)
  if (alpha.length === 1) return `${alpha}X`
  return 'ST'
}

function prefixCandidatesForStore(storeName: string): string[] {
  const raw = String(storeName || '').trim()
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '')
  const out: string[] = []
  const seen = new Set<string>()
  const push = (p: string) => {
    const v = String(p || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 2)
    if (v.length !== 2) return
    if (seen.has(v)) return
    seen.add(v)
    out.push(v)
  }

  if (letters.length >= 2) {
    for (let i = 0; i < letters.length - 1; i++) {
      push(`${letters[i]}${letters[i + 1]}`)
    }
  }
  push(storePrefixFromName(raw))

  const words = raw.split(/\s+/).filter(Boolean)
  let ini = ''
  for (let wi = 0; wi < Math.min(words.length, 4); wi++) {
    const a = words[wi].toUpperCase().replace(/[^A-Z]/g, '')
    if (a.length >= 1) ini += a[0]
    if (ini.length >= 2) break
  }
  if (ini.length >= 2) push(`${ini[0]}${ini[1]}`)

  if (letters.length >= 2) {
    for (let i = 0; i < letters.length; i++) {
      for (let j = i + 1; j < letters.length; j++) {
        push(`${letters[i]}${letters[j]}`)
      }
    }
    push(`${letters[0]}${letters[letters.length - 1]}`)
  }

  if (letters.length === 1) {
    push(`${letters}X`)
    for (let j = 0; j < 26; j++) push(`${letters}${String.fromCharCode(65 + j)}`)
  }
  if (!letters.length) push('ST')

  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      push(`${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}`)
    }
  }
  return out
}

/** 이미 있는 코드 목록으로 다음 직원 코드를 고른다. DB 조회는 호출 측. */
export function pickNextEmployeeCode(
  storeName: string,
  rows: { store?: string | null; employee_code?: string | null }[]
): string {
  const targetStore = String(storeName || '').trim()
  const usedPrefixesByOtherStore = new Set<string>()
  const validPrefixCountInTarget = new Map<string, number>()
  const targetRows: string[] = []
  for (const r of rows || []) {
    const rowStore = String(r.store || '').trim()
    const c = normalizeEmployeeCodeInput(r.employee_code)
    if (!EMPLOYEE_CODE_RE.test(c)) continue
    const pfx = c.slice(0, 2)
    if (rowStore && rowStore.toLowerCase() === targetStore.toLowerCase()) {
      validPrefixCountInTarget.set(pfx, (validPrefixCountInTarget.get(pfx) || 0) + 1)
      targetRows.push(c)
    } else {
      usedPrefixesByOtherStore.add(pfx)
    }
  }
  let prefix = ''
  if (validPrefixCountInTarget.size > 0) {
    const sorted = Array.from(validPrefixCountInTarget.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    prefix = sorted[0][0]
  } else {
    const cands = prefixCandidatesForStore(storeName)
    prefix = cands.find((p) => !usedPrefixesByOtherStore.has(p)) || cands[0] || 'ST'
  }
  const used = new Set<number>()
  for (const c of targetRows) {
    if (!c.startsWith(prefix)) continue
    const n = Number(c.slice(2))
    if (Number.isFinite(n) && n >= 1 && n <= 999) used.add(n)
  }
  for (let i = 1; i <= 999; i++) {
    if (!used.has(i)) return `${prefix}${String(i).padStart(3, '0')}`
  }
  throw new Error(`매장(${storeName}) 직원코드가 999명을 초과했습니다.`)
}
