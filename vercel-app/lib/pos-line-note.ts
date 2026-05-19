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
