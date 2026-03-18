/**
 * API fetch 핵심 - 인증 토큰 자동 첨부, 401 시 로그인 리다이렉트
 */
function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const token = sessionStorage.getItem('cm_token')
    if (token) return { Authorization: `Bearer ${token}` }
  } catch {}
  return {}
}

/** 절대 URL로 변환 - 상대 경로 시 현재 origin 사용 (배포/프록시 환경에서 요청이 올바른 서버로 가도록) */
function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string' && input.startsWith('/') && typeof window !== 'undefined') {
    return `${window.location.origin}${input}`
  }
  return typeof input === 'string' ? input : input.toString()
}

/** 인증 토큰을 붙인 fetch - 컴포넌트에서 직접 API 호출 시 사용 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const auth = getAuthHeaders()
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v))
  const url = resolveUrl(input)
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 && typeof window !== 'undefined') {
    if (navigator.onLine === false) {
      // 오프라인 시 401 리다이렉트 방지 - 세션이 있으면 캐시된 데이터로 계속 사용 허용
      return res
    }
    try {
      sessionStorage.removeItem('cm_token')
      sessionStorage.removeItem('cm_store')
      sessionStorage.removeItem('cm_user')
      sessionStorage.removeItem('cm_role')
    } catch {}
    window.location.href = '/login'
  }
  return res
}
