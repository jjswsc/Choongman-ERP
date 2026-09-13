/** 강제출고 삭제 시 같은 세금계산서/참조번호의 ForcePush 도 함께 찾는다. */
export function uniqueTrimmedReferenceNos(
  rows: Array<{ reference_no?: string | null }>
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const t = String(r.reference_no || '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}
