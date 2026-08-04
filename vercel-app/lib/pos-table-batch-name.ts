/**
 * Table Layout 일괄 이름: Prefix + 시작번호 + 증가 + Suffix
 * 예: prefix "A-", start 1, step 1 → A-1, A-2, A-3 …
 */

export type PosTableBatchNameOptions = {
  count: number
  prefix?: string
  suffix?: string
  start?: number
  step?: number
}

export function buildPosTableBatchNames(opts: PosTableBatchNameOptions): string[] {
  const count = Math.max(0, Math.floor(Number(opts.count) || 0))
  const prefix = String(opts.prefix ?? '')
  const suffix = String(opts.suffix ?? '')
  const startRaw = Number(opts.start)
  const start = Number.isFinite(startRaw) ? Math.trunc(startRaw) : 1
  const stepRaw = Number(opts.step)
  const step = Number.isFinite(stepRaw) && Math.trunc(stepRaw) !== 0 ? Math.trunc(stepRaw) : 1
  const names: string[] = []
  for (let i = 0; i < count; i += 1) {
    names.push(`${prefix}${start + i * step}${suffix}`)
  }
  return names
}

/** 미리보기용 짧은 예시 문자열 */
export function previewPosTableBatchNames(opts: PosTableBatchNameOptions, maxShow = 5): string {
  const names = buildPosTableBatchNames(opts)
  if (names.length === 0) return ''
  if (names.length <= maxShow) return names.join(' ')
  const head = names.slice(0, maxShow).join(' ')
  return `${head} … ${names[names.length - 1]}`
}

/**
 * Name 1–99 / 일괄 이름 기본 접두사.
 * 구역명이 VIP 이면 `VIP-`, 없으면 `2F-` (층 슬롯 번호).
 */
export function resolvePosTableZoneNamePrefix(
  floor: number,
  zoneLabel?: string | null
): string {
  const f = Math.min(3, Math.max(1, Math.trunc(Number(floor) || 1)))
  const zone = String(zoneLabel ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
  if (zone) {
    return /[-_\s.]$/.test(zone) ? zone : `${zone}-`
  }
  return `${f}F-`
}
