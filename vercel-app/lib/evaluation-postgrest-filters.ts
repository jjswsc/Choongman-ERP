import { expandStoreVariantsForGrade, escapeForIlikeExact } from '@/lib/grade-store-key-variants'

export type EvalHistoryType = 'kitchen' | 'service' | 'manager'

/** URL·시트 등에서 온 평가 유형 문자열 → kitchen|service|manager */
export function normalizeHistoryEvalType(raw: string): EvalHistoryType {
  const x = String(raw || '')
    .toLowerCase()
    .trim()
  if (x === 'service') return 'service'
  if (x === 'manager') return 'manager'
  return 'kitchen'
}

/**
 * eval_type 대소문 혼용 + 매장 ilike or 와 동시에 쓰면 쿼리에 `or=` 키가 두 번 생겨 PostgREST/게이트웨이가 깨질 수 있음.
 * → eval_type 은 단일 `in.(...)` 로만 표현.
 */
export function postgrestEvalTypeInFilter(canonical: EvalHistoryType): string {
  const lower = canonical
  const title = canonical.charAt(0).toUpperCase() + canonical.slice(1)
  const upper = canonical.toUpperCase()
  const variants = [...new Set([lower, title, upper])]
  return `eval_type=in.(${variants.map((v) => encodeURIComponent(v)).join(',')})`
}

/**
 * 매장 필터 — eval_type 은 `in` 이므로 여기서만 `or=` 사용(쿼리당 or 키 1개).
 * 대소문·CM 접두 변형은 ilike 로 흡수.
 */
export function postgrestStoreNameIlikeOrFilter(store: string): string | null {
  const variants = [...new Set(expandStoreVariantsForGrade(store).filter(Boolean))]
  if (variants.length === 0) return null
  if (variants.length === 1) {
    return `store_name=ilike.${encodeURIComponent(escapeForIlikeExact(variants[0]))}`
  }
  return `or=(${variants.map((v) => `store_name.ilike.${encodeURIComponent(escapeForIlikeExact(v))}`).join(',')})`
}

/** 목록·집계 공통 정렬 (단일 요청·적은 페이지에서도 안전) */
export const EVAL_RESULTS_ORDER = 'eval_date.desc' as const
