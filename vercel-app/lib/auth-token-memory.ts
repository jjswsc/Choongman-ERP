/**
 * 로그인 JWT 메모리 보관 — sessionStorage/localStorage 쓰기 실패·쿼터 초과 시에도
 * 같은 탭의 API 요청에 Bearer를 붙이기 위함 (모바일 원가 분석 401 방지).
 */
let memoryToken: string | null = null

export function setMemoryAuthToken(token: string | null | undefined) {
  const t = String(token || "").trim()
  memoryToken = t || null
}

export function getMemoryAuthToken(): string | null {
  return memoryToken
}
