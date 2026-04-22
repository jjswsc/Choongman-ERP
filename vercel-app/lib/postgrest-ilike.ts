/**
 * PostgREST `ilike` 패턴 문자열용 — 사용자 입력의 % _ \ 를 리터럴로 취급
 */
export function escapeIlikePattern(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}
