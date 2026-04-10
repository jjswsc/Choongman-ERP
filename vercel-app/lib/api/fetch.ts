/**
 * API fetch 핵심 - 인증 토큰 자동 첨부, 401 시 로그인 리다이렉트
 */
function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    let token: string | null = null
    try {
      token = sessionStorage.getItem('cm_token') || localStorage.getItem('cm_token')
    } catch {
      token = sessionStorage.getItem('cm_token')
    }
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

/** 현재 앱 영역에 맞는 로그인 경로 선택 (모바일/관리자/POS) */
function resolveLoginPathFromLocation(): string {
  if (typeof window === 'undefined') return '/login'
  const p = window.location.pathname || '/'
  if (p.startsWith('/admin')) return '/admin/login'
  if (p.startsWith('/saas-admin')) return '/saas-admin/login'
  if (p.startsWith('/pos')) return '/pos/login'
  return '/login'
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
    // Bearer 없음 = 오프라인 복구 세션(cm_store 등만 있음) 등 — 401이 나와도 로그인 화면으로 보내지 않음
    if (!auth.Authorization) {
      return res
    }
    const path = window.location.pathname || ''
    const isPos = path.startsWith('/pos')
    try {
      sessionStorage.removeItem('cm_token')
      try {
        localStorage.removeItem('cm_token')
      } catch {}
      // POS: 토큰만 무효화하고 매장·사용자는 유지 → 불안정 망에서 401 한 번에 전체 세션 삭제·로그인 강제 이동 방지
      if (!isPos) {
        sessionStorage.removeItem('cm_store')
        sessionStorage.removeItem('cm_user')
        sessionStorage.removeItem('cm_role')
      }
    } catch {}
    if (!isPos) {
      window.location.href = resolveLoginPathFromLocation()
    }
  }
  return res
}
