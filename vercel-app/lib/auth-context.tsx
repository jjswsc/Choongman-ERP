'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface AuthState {
  store: string
  user: string
  role: string
  token?: string
  /** employees.id — 휴가·내 휴가 조회 식별 */
  employeeId?: number
  /** employees.employee_code */
  employeeCode?: string
  /** 가맹점주 복수 매장 허용 목록(로그인 응답·JWT와 동기) */
  allowedStores?: string[]
}

const LAST_LOGIN_SNAPSHOT_KEY = 'cm_last_login_snapshot'
const CM_ALLOWED_STORES_KEY = 'cm_allowed_stores'

function resolveLoginPathByCurrentRoute(): string {
  if (typeof window === 'undefined') return '/login'
  const p = window.location.pathname || '/'
  if (p.startsWith('/admin')) return '/admin/login'
  if (p.startsWith('/pos')) return '/pos/login'
  return '/login'
}

function loadAuth(): AuthState | null {
  if (typeof window === 'undefined') return null
  try {
    let token: string | null = null
    try {
      token = sessionStorage.getItem('cm_token') || localStorage.getItem('cm_token')
    } catch {
      token = sessionStorage.getItem('cm_token')
    }
    const store = sessionStorage.getItem('cm_store')
    const user = sessionStorage.getItem('cm_user')
    let role = sessionStorage.getItem('cm_role') || ''
    if (store && user) {
      // cm_role만 비어 있는 경우(세션 불일치 등) 스냅샷으로 복구 — 없으면 관리자 레이아웃이 / 로 튕김
      if (!String(role).trim()) {
        try {
          const raw = localStorage.getItem(LAST_LOGIN_SNAPSHOT_KEY)
          if (raw) {
            const o = JSON.parse(raw) as { role?: string }
            const snapRole = String(o.role ?? '').trim()
            if (snapRole) {
              role = snapRole
              try {
                sessionStorage.setItem('cm_role', snapRole)
              } catch {}
            }
          }
        } catch {}
      }
      let allowedStores: string[] | undefined
      try {
        const rawA = sessionStorage.getItem(CM_ALLOWED_STORES_KEY)
        if (rawA) {
          const p = JSON.parse(rawA) as unknown
          if (Array.isArray(p)) {
            allowedStores = p.map((x) => String(x || '').trim()).filter(Boolean)
            if (allowedStores.length === 0) allowedStores = undefined
          }
        }
      } catch {}
      let employeeId: number | undefined
      let employeeCode: string | undefined
      try {
        const idStr = sessionStorage.getItem('cm_employee_id')
        if (idStr) {
          const n = Math.floor(Number(idStr))
          if (n > 0) employeeId = n
        }
        const codeStr = sessionStorage.getItem('cm_employee_code')
        if (codeStr) employeeCode = String(codeStr).trim() || undefined
      } catch {}
      return {
        store,
        user,
        role,
        token: token || undefined,
        ...(employeeId != null ? { employeeId } : {}),
        ...(employeeCode ? { employeeCode } : {}),
        allowedStores,
      }
    }
  } catch {}
  return null
}

/**
 * 오프라인 진입용: 탭 단위 sessionStorage가 비어도, 이전에 이 브라우저에서 로그인한 적이 있으면
 * localStorage 스냅샷으로 매장·이름·역할 복구 (토큰은 session에 있을 때만 첨부)
 */
export function loadOfflineResumeAuth(): AuthState | null {
  if (typeof window === 'undefined') return null
  const fromSession = loadAuth()
  if (fromSession) return fromSession
  try {
    const raw = localStorage.getItem(LAST_LOGIN_SNAPSHOT_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as {
      store?: string
      user?: string
      role?: string
      employeeId?: number
      employeeCode?: string
      allowedStores?: string[]
    }
    const store = String(o.store ?? '').trim()
    const user = String(o.user ?? '').trim()
    if (!store || !user) return null
    let token: string | undefined
    try {
      token = sessionStorage.getItem('cm_token') || localStorage.getItem('cm_token') || undefined
    } catch {}
    let allowedStores: string[] | undefined
    if (Array.isArray(o.allowedStores)) {
      allowedStores = o.allowedStores.map((x) => String(x || '').trim()).filter(Boolean)
      if (allowedStores.length === 0) allowedStores = undefined
    }
    const snapEid = o.employeeId != null && Number.isFinite(Number(o.employeeId)) ? Math.floor(Number(o.employeeId)) : 0
    const snapCode = o.employeeCode != null ? String(o.employeeCode).trim() : ''
    return {
      store,
      user,
      role: String(o.role || '').trim(),
      token,
      ...(snapEid > 0 ? { employeeId: snapEid } : {}),
      ...(snapCode ? { employeeCode: snapCode } : {}),
      allowedStores,
    }
  } catch {
    return null
  }
}

function saveAuth(auth: AuthState) {
  try {
    sessionStorage.setItem('cm_store', auth.store)
    sessionStorage.setItem('cm_user', auth.user)
    sessionStorage.setItem('cm_role', auth.role)
    if (auth.employeeId != null && auth.employeeId > 0) {
      sessionStorage.setItem('cm_employee_id', String(auth.employeeId))
    } else {
      sessionStorage.removeItem('cm_employee_id')
    }
    if (auth.employeeCode) {
      sessionStorage.setItem('cm_employee_code', auth.employeeCode)
    } else {
      sessionStorage.removeItem('cm_employee_code')
    }
    if (auth.token) {
      sessionStorage.setItem('cm_token', auth.token)
      try {
        localStorage.setItem('cm_token', auth.token)
      } catch {}
    }
    if (auth.allowedStores && auth.allowedStores.length > 0) {
      sessionStorage.setItem(CM_ALLOWED_STORES_KEY, JSON.stringify(auth.allowedStores))
    } else {
      sessionStorage.removeItem(CM_ALLOWED_STORES_KEY)
    }
    localStorage.setItem(
      LAST_LOGIN_SNAPSHOT_KEY,
      JSON.stringify({
        store: auth.store,
        user: auth.user,
        role: auth.role,
        ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
        ...(auth.employeeCode ? { employeeCode: auth.employeeCode } : {}),
        ...(auth.allowedStores && auth.allowedStores.length > 0 ? { allowedStores: auth.allowedStores } : {}),
      })
    )
  } catch {}
}

/** 세션·토큰만 제거. `cm_last_login_snapshot`은 유지 → 로그아웃 후에도 오프라인 모드로 재진입 가능(전용 기기 POS). 완전 삭제는 브라우저 사이트 데이터 삭제. */
function clearAuth() {
  try {
    sessionStorage.removeItem('cm_store')
    sessionStorage.removeItem('cm_user')
    sessionStorage.removeItem('cm_role')
    sessionStorage.removeItem('cm_token')
    try {
      localStorage.removeItem('cm_token')
    } catch {}
    sessionStorage.removeItem('cm_employee_id')
    sessionStorage.removeItem('cm_employee_code')
    sessionStorage.removeItem(CM_ALLOWED_STORES_KEY)
  } catch {}
}

const AuthContext = createContext<{
  auth: AuthState | null
  initialized: boolean
  setAuth: (auth: AuthState | null) => void
  logout: () => void
} | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthState] = useState<AuthState | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    let a = loadAuth()
    if (!a) {
      a = loadOfflineResumeAuth()
    }
    setAuthState(a)
    // 세션 복구·스냅샷 복구 후 sessionStorage·스냅샷 동기화 (새 탭/401 직후에도 POS 레이아웃이 로그인으로 튕기지 않게)
    if (a) saveAuth(a)
    setInitialized(true)
  }, [])

  const setAuth = useCallback((a: AuthState | null) => {
    setAuthState(a)
    if (a) saveAuth(a)
    else clearAuth()
  }, [])

  const logout = useCallback(() => {
    setAuthState(null)
    clearAuth()
    if (typeof window === 'undefined') return
    const goLogin = () => {
      window.location.href = resolveLoginPathByCurrentRoute()
    }
    fetch(`${window.location.origin}/api/logout`, { method: 'POST', credentials: 'same-origin' })
      .catch(() => {})
      .finally(goLogin)
  }, [])

  const value = useMemo(
    () => ({ auth, initialized, setAuth, logout }),
    [auth, initialized, setAuth, logout]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
