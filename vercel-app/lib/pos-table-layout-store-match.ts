/**
 * pos_table_layouts.store_code 조회·저장 시 동일한 매장 코드 매칭.
 * get/save가 서로 다른 행을 읽/쓰면 저장 직후 예전 레이아웃(예: 테이블 1개)으로 보이는 원인.
 */

export type PosTableLayoutDbRow = {
  store_code?: string
  layout_json?: string | unknown[] | Record<string, unknown>
  updated_at?: string
}

/** UI/DB 표기 차이(하이픈·공백·CM 접두)를 흡수한 후보 코드 */
export function posTableLayoutStoreCodeCandidates(storeCode: string): string[] {
  const raw = String(storeCode || '').trim()
  if (!raw) return []
  return [
    raw,
    raw.startsWith('CM ') ? raw.slice(3).trim() : `CM ${raw}`.trim(),
    raw.replace(/^CM\s+/i, '').trim(),
    raw.replace(/-/g, ' ').trim(),
    raw.replace(/\s+/g, '-').trim(),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i)
}

export function normalizePosTableLayoutStoreCode(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/-/g, ' ').trim()
}

/** 전체 행 중 정규화 매칭. 단일 행 무조건 폴백은 하지 않음(다른 매장 레이아웃 오염 방지). */
export function matchPosTableLayoutRow(
  storeCode: string,
  allRows: PosTableLayoutDbRow[] | null | undefined
): PosTableLayoutDbRow | null {
  const reqNorm = normalizePosTableLayoutStoreCode(storeCode)
  if (!reqNorm || !allRows?.length) return null
  return (
    allRows.find((r) => {
      const dbNorm = normalizePosTableLayoutStoreCode(String(r.store_code ?? ''))
      return dbNorm === reqNorm || dbNorm.includes(reqNorm) || reqNorm.includes(dbNorm)
    }) ?? null
  )
}
