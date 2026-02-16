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

/** 인증 토큰을 붙인 fetch - 컴포넌트에서 직접 API 호출 시 사용 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const auth = getAuthHeaders()
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v))
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401 && typeof window !== 'undefined') {
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
