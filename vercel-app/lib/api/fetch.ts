import { getMemoryAuthToken } from '@/lib/auth-token-memory'
import { readJwtRemainingSec } from '@/lib/jwt-payload-client'
import { loginPathWithSessionExpired } from '@/lib/session-expired-notice'

/**
 * API fetch 핵심 - 인증 토큰 자동 첨부, 401 시 로그인 리다이렉트
 */
function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const mem = getMemoryAuthToken()
    if (mem) return { Authorization: `Bearer ${mem}` }
    let token: string | null = null
    try {
      token = sessionStorage.getItem('cm_token')
    } catch {}
    if (!token) {
      try {
        token = localStorage.getItem('cm_token')
      } catch {}
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

/** 오프라인 큐 재전송 — 401 시 토큰 삭제하면 재시도 전에 세션이 날아가 배너가 계속 남음 */
function isOfflineQueueSyncRequest(init?: RequestInit): boolean {
  if (!init?.headers) return false
  const h = init.headers
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    const v = h.get('X-CM-Offline-Queue-Sync') ?? h.get('x-cm-offline-queue-sync')
    return String(v ?? '').trim() === '1'
  }
  if (h && typeof h === 'object' && !Array.isArray(h)) {
    const o = h as Record<string, string>
    for (const key of Object.keys(o)) {
      if (key.toLowerCase() === 'x-cm-offline-queue-sync' && String(o[key]).trim() === '1') return true
    }
  }
  return false
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
  const res = await fetch(url, { ...init, headers, credentials: 'include' })
  if (res.status === 401 && typeof window !== 'undefined') {
    if (navigator.onLine === false) {
      // 오프라인 시 401 리다이렉트 방지 - 세션이 있으면 캐시된 데이터로 계속 사용 허용
      return res
    }
    // 오프라인 큐 동기화 요청: 토큰 만료여도 여기서 지우면 재시도 불가·배너 영구 대기
    if (isOfflineQueueSyncRequest(init)) {
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
      window.location.href = loginPathWithSessionExpired(resolveLoginPathFromLocation())
      return res
    }
    const remain = readJwtRemainingSec(auth.Authorization.replace(/^Bearer\s+/i, ''))
    if (remain != null && remain <= 0) {
      window.location.href = loginPathWithSessionExpired(resolveLoginPathFromLocation())
    }
  }
  return res
}
