function isMachineLikeToken(raw: string): boolean {
  const s = String(raw || '').trim()
  if (!s) return true
  if (/^(mods?:)?[a-z]+-\d+(?:-[a-z0-9]+)*$/i.test(s)) return true
  if (/^[a-z0-9_-]{16,}$/i.test(s) && !/\s/.test(s)) return true
  return false
}

/**
 * POS item.note 정리:
 * - 내부 식별자(mod-..., 긴 slug/id) 제거
 * - mods: 접두 옵션은 필요 시에만 유지
 */
export function normalizePosLineNote(
  rawNote: string | null | undefined,
  opts?: { keepOptionSummary?: boolean }
): string {
  const raw = String(rawNote ?? '').trim()
  if (!raw) return ''
  const keepOptionSummary = opts?.keepOptionSummary === true
  const chunks = raw
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const chunk of chunks) {
    const modMatch = /^mods:\s*(.+)$/i.exec(chunk)
    if (modMatch?.[1]) {
      const readable = modMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && !isMachineLikeToken(s))
      if (!readable.length) continue
      if (keepOptionSummary) out.push(`mods:${readable.join(',')}`)
      else out.push(readable.join(', '))
      continue
    }
    if (/^optc:\s*/i.test(chunk)) continue
    if (isMachineLikeToken(chunk)) continue
    out.push(chunk)
  }
  return out.join(' · ')
}

/**
 * 홀/결제 영수증 중복 방지:
 * 옵션이 이름·note 양쪽에 들어 있으면(예: 이름의 "(M - Boneless)" → 옵션 줄,
 * note 의 "M - Boneless" → 비고 줄) 같은 값이 두 번 찍힌다.
 * note 전체가 이미 출력된 옵션 토큰과 동일하면 비고 줄을 숨기기 위한 판정.
 * (note 에 옵션 외 실제 고객 메모가 섞여 있으면 일치하지 않으므로 비고를 유지한다.)
 */
export function lineNoteDuplicatesOptions(
  note: string | null | undefined,
  optionTokens: ReadonlyArray<string | null | undefined>
): boolean {
  const norm = (s: string | null | undefined) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  const n = norm(note)
  if (!n) return false
  const opts = optionTokens.map(norm).filter(Boolean)
  if (!opts.length) return false
  if (opts.includes(n)) return true
  if (norm(opts.join(', ')) === n) return true
  if (norm(opts.join(' ')) === n) return true
  return false
}
