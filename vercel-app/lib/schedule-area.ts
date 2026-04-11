/**
 * 스케줄 `memo`(저장 시 remark) → 구역(Kitchen / Office / Service).
 * admin-schedule-edit 는 remark 를 `[Service, Kitchen]` 형태로 저장할 수 있어
 * 단일 문자열에 kitchen·service 가 함께 있으면 예전 로직은 항상 Kitchen 만 반환함 → Service 필터에서 행이 빠짐.
 */

const CANON = ['Kitchen', 'Office', 'Service'] as const
export type ScheduleArea = (typeof CANON)[number]

function isScheduleArea(s: string): s is ScheduleArea {
  return (CANON as readonly string[]).includes(s)
}

/** 한 토큰(또는 직무 문자열)에서 구역 추론 — 태국어·한국어·영문 */
export function canonicalAreaFromText(text: string | null | undefined): ScheduleArea {
  const m = String(text || '')
    .trim()
    .toLowerCase()
  if (
    m.includes('kitchen') ||
    m.includes('주방') ||
    m.includes('ครัว') ||
    m.includes('キッチン')
  ) {
    return 'Kitchen'
  }
  if (
    m.includes('office') ||
    m.includes('오피스') ||
    m.includes('สำนักงาน') ||
    m.includes('ออฟฟิศ') ||
    m.includes('オフィス')
  ) {
    return 'Office'
  }
  if (
    m.includes('service') ||
    m.includes('서비스') ||
    m.includes('บริการ') ||
    m.includes('サービス')
  ) {
    return 'Service'
  }
  const t = String(text || '').trim()
  if (isScheduleArea(t)) return t
  return 'Service'
}

/**
 * memo 예: `[Service, Kitchen]`, `스마트스케줄러`, `Kitchen`
 * → 구역 배열 (중복 제거, 순서 유지)
 */
export function parseMemoToAreaList(memo: string | null | undefined): ScheduleArea[] {
  const raw = String(memo ?? '').trim()
  if (!raw) return ['Service']
  const bracket = raw.match(/^\[(.*)\]\s*$/)
  if (bracket) {
    const parts = bracket[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length > 0) {
      const seen = new Set<ScheduleArea>()
      const out: ScheduleArea[] = []
      for (const p of parts) {
        const a = canonicalAreaFromText(p)
        if (!seen.has(a)) {
          seen.add(a)
          out.push(a)
        }
      }
      return out.length > 0 ? out : ['Service']
    }
  }
  return [canonicalAreaFromText(raw)]
}

/** 구역 필터(Service 등)와 memo 가 호환되는지 — 다중 구역이면 하나라도 일치하면 통과 */
export function memoMatchesAreaFilter(memo: string | null | undefined, filterArea: string): boolean {
  const fa = String(filterArea || '').trim()
  if (!fa || fa.toLowerCase() === 'all' || fa === '전체') return true
  if (!isScheduleArea(fa)) return true
  return parseMemoToAreaList(memo).includes(fa)
}

/**
 * 표시용 단일 구역: 복수 구역이면 직무(job)와 일치하는 쪽을 우선, 없으면 Service 우선.
 */
export function primaryAreaForDisplay(
  memo: string | null | undefined,
  jobHint: string | null | undefined
): ScheduleArea {
  const list = parseMemoToAreaList(memo)
  if (list.length === 1) return list[0]
  const jobArea = canonicalAreaFromText(jobHint)
  if (list.includes(jobArea)) return jobArea
  if (list.includes('Service')) return 'Service'
  return list[0] || 'Service'
}

/** @deprecated 새 코드는 canonicalAreaFromText / parseMemoToAreaList 사용 */
export function parseAreaFromMemo(memo: string | null | undefined): ScheduleArea {
  return canonicalAreaFromText(memo)
}
