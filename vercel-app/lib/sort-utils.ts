/**
 * 코드 파싱: 영문 접두사 + 숫자 + 선택적 .숫자 (예: CT002.1, CTU11.7, CK001.1)
 * 엑셀 체크스탁 순서에 맞춰 정렬하기 위함.
 */
function parseCode(code: string): { prefix: string; num1: number; num2: number } {
  const s = String(code || '').trim()
  const m = s.match(/^([A-Za-z]*)(\d+)(?:\.(\d+))?$/i)
  if (m) {
    return {
      prefix: (m[1] ?? '').toLowerCase(),
      num1: parseInt(m[2] ?? '0', 10) || 0,
      num2: parseInt(m[3] ?? '0', 10) || 0,
    }
  }
  const fallback = s.match(/^([A-Za-z]*)(\d*)$/i)
  return {
    prefix: (fallback?.[1] ?? s).toLowerCase(),
    num1: parseInt(fallback?.[2] ?? '0', 10) || 0,
    num2: 0,
  }
}

/**
 * 공통 정렬 유틸 - 품목, 메뉴 등 코드(영문접두사+숫자, 또는 접두사+숫자.숫자) 기준 정렬
 * 예: CT002.1, CT005.1, CT005.2, CT007.1, CTU11.1~CTU11.7, CK001.1 → 접두사·숫자·소수부 순
 */
export function sortByCode<T>(items: T[], getCode: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const pa = parseCode(getCode(a))
    const pb = parseCode(getCode(b))
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix, undefined, { sensitivity: 'base' })
    if (pa.num1 !== pb.num1) return pa.num1 - pb.num1
    return pa.num2 - pb.num2
  })
}

/** 비교 함수 (sort 콜백용) - 코드 기준 */
export function compareByCode(a: string, b: string): number {
  const pa = parseCode(a)
  const pb = parseCode(b)
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix, undefined, { sensitivity: 'base' })
  if (pa.num1 !== pb.num1) return pa.num1 - pb.num1
  return pa.num2 - pb.num2
}
