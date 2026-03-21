'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface AuthState {
  store: string
  user: string
  role: string
  token?: string
}

const LAST_LOGIN_SNAPSHOT_KEY = 'cm_last_login_snapshot'

function loadAuth(): AuthState | null {
  if (typeof window === 'undefined') return null
  try {
    const token = sessionStorage.getItem('cm_token')
    const store = sessionStorage.getItem('cm_store')
    const user = sessionStorage.getItem('cm_user')
    const role = sessionStorage.getItem('cm_role') || ''
    if (store && user) return { store, user, role, token: token || undefined }
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
    const o = JSON.parse(raw) as { store?: string; user?: string; role?: string }
    if (!o.store || !o.user) return null
    let token: string | undefined
    try {
      token = sessionStorage.getItem('cm_token') || undefined
    } catch {}
    return { store: o.store, user: o.user, role: o.role || '', token }
  } catch {
    return null
  }
}

function saveAuth(auth: AuthState) {
  try {
    sessionStorage.setItem('cm_store', auth.store)
    sessionStorage.setItem('cm_user', auth.user)
    sessionStorage.setItem('cm_role', auth.role)
    if (auth.token) sessionStorage.setItem('cm_token', auth.token)
    localStorage.setItem(
      LAST_LOGIN_SNAPSHOT_KEY,
      JSON.stringify({ store: auth.store, user: auth.user, role: auth.role })
    )
  } catch {}
}

function clearAuth() {
  try {
    sessionStorage.removeItem('cm_store')
    sessionStorage.removeItem('cm_user')
    sessionStorage.removeItem('cm_role')
    sessionStorage.removeItem('cm_token')
    localStorage.removeItem(LAST_LOGIN_SNAPSHOT_KEY)
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
    const a = loadAuth()
    setAuthState(a)
    // 예전 빌드: session만 있고 스냅샷 없음 → 오프라인 복구용 localStorage 보강
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
    if (typeof window !== 'undefined') window.location.href = '/login'
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
