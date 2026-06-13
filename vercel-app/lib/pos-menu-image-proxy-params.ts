/** posMenuImageProxy `w`/`q` 파싱 — `searchParams.get()` 미지정 시 `null` → `Number(null)===0` 함정 방지 */
export function clampPosMenuProxyInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw == null || String(raw).trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
