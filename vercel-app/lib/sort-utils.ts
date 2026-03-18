/**
 * 공통 정렬 유틸 - 품목, 메뉴 등 코드(영문접두사+숫자) 기준 정렬
 * 예: DRK022, DRK023, JD026, CK052 → CK052, DRK022, DRK023, JD026
 */
export function sortByCode<T>(items: T[], getCode: (item: T) => string): T[] {
  const parse = (code: string) => {
    const m = String(code || '').match(/^([A-Za-z]*)(\d*)$/)
    return {
      prefix: (m?.[1] ?? '').toLowerCase(),
      num: parseInt(m?.[2] ?? '0', 10) || 0,
    }
  }
  return [...items].sort((a, b) => {
    const pa = parse(getCode(a))
    const pb = parse(getCode(b))
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix, undefined, { sensitivity: 'base' })
    return pa.num - pb.num
  })
}

/** 비교 함수 (sort 콜백용) - 코드 기준 */
export function compareByCode(a: string, b: string): number {
  const parse = (code: string) => {
    const m = String(code || '').match(/^([A-Za-z]*)(\d*)$/)
    return {
      prefix: (m?.[1] ?? '').toLowerCase(),
      num: parseInt(m?.[2] ?? '0', 10) || 0,
    }
  }
  const pa = parse(a)
  const pb = parse(b)
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix, undefined, { sensitivity: 'base' })
  return pa.num - pb.num
}
