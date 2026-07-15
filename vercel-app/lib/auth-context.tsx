'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { canAccessPosOrder } from '@/lib/permissions'
import { readJwtCanManageOfficePayroll } from '@/lib/jwt-payload-client'

export interface AuthState {
  company?: string
  tenantId?: string
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
  /** employees.can_manage_office_payroll — 오피스 급여 조회·계산·확정 */
  canManageOfficePayroll?: boolean
}

const LAST_LOGIN_SNAPSHOT_KEY = 'cm_last_login_snapshot'
const CM_ALLOWED_STORES_KEY = 'cm_allowed_stores'
const CM_OFFICE_PAYROLL_KEY = 'cm_office_payroll_mgr'

function resolveLoginPathByCurrentRoute(): string {
  if (typeof window === 'undefined') return '/login'
  const p = window.location.pathname || '/'
  if (p.startsWith('/admin')) return '/admin/login'
  if (p.startsWith('/saas-admin')) return '/saas-admin/login'
  if (p.startsWith('/pos')) return '/pos/login'
  return '/login'
}

/** 로그인 화면에서는 스냅샷을 전역 auth로 올리지 않음 — 올리면 폼이 즉시 리다이렉트되어 로그아웃이 무효화됨. 오프라인 진입은 LoginForm의 offlineResume·CTA로 처리 */
function isAuthLoginPathname(pathname: string): boolean {
  const p = (pathname || '/').replace(/\/+$/, '') || '/'
  return p === '/login' || p === '/admin/login' || p === '/saas-admin/login' || p === '/pos/login'
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
      let canManageOfficePayroll = false
      try {
        canManageOfficePayroll = sessionStorage.getItem(CM_OFFICE_PAYROLL_KEY) === '1'
      } catch {}
      if (!canManageOfficePayroll && token) {
        canManageOfficePayroll = readJwtCanManageOfficePayroll(token)
      }
      return {
        ...(sessionStorage.getItem('cm_company') ? { company: sessionStorage.getItem('cm_company') || undefined } : {}),
        ...(sessionStorage.getItem('cm_tenant_id')
          ? { tenantId: sessionStorage.getItem('cm_tenant_id') || undefined }
          : {}),
        store,
        user,
        role,
        token: token || undefined,
        ...(employeeId != null ? { employeeId } : {}),
        ...(employeeCode ? { employeeCode } : {}),
        allowedStores,
        ...(canManageOfficePayroll ? { canManageOfficePayroll: true } : {}),
      }
    }
  } catch {}
  return null
}

/**
 * 고객사 로그인 전환(회사 바로가기 새 탭 등) — localStorage 마지막 로그인 스냅샷만 제거.
 * (대리점 Partner/admin 오프라인 CTA가 고객사 로그인 폼을 가리지 않게)
 */
export function clearOfflineLoginSnapshot(): void {
  try {
    if (typeof window === 'undefined') return
    localStorage.removeItem(LAST_LOGIN_SNAPSHOT_KEY)
  } catch {}
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
      company?: string
      tenantId?: string
      store?: string
      user?: string
      role?: string
      employeeId?: number
      employeeCode?: string
      allowedStores?: string[]
      canManageOfficePayroll?: boolean
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
    let canManageOfficePayroll = o.canManageOfficePayroll === true
    if (!canManageOfficePayroll && token) {
      canManageOfficePayroll = readJwtCanManageOfficePayroll(token)
    }
    return {
      ...(o.company ? { company: String(o.company).trim() } : {}),
      ...(o.tenantId ? { tenantId: String(o.tenantId).trim() } : {}),
      store,
      user,
      role: String(o.role || '').trim(),
      token,
      ...(snapEid > 0 ? { employeeId: snapEid } : {}),
      ...(snapCode ? { employeeCode: snapCode } : {}),
      allowedStores,
      ...(canManageOfficePayroll ? { canManageOfficePayroll: true } : {}),
    }
  } catch {
    return null
  }
}

/**
 * 오프라인 진입 시 role 이 비어 있으면 POS 주문 화면 권한 검사에 막혀 /pos ↔ /pos/login 이 반복된다.
 * 스냅샷 역할을 보강하고, 없으면 staff 로 최소 POS 주문 접근을 허용한다(PIN 검증은 생략된 오프라인 세션).
 */
export function enrichOfflinePosAuth(partial: AuthState): AuthState {
  const role = String(partial.role || '').trim()
  if (role && canAccessPosOrder(role)) return partial

  try {
    const raw = localStorage.getItem(LAST_LOGIN_SNAPSHOT_KEY)
    if (raw) {
      const o = JSON.parse(raw) as {
        role?: string
        employeeId?: number
        employeeCode?: string
        allowedStores?: string[]
      }
      const snapRole = String(o.role ?? '').trim()
      if (snapRole && canAccessPosOrder(snapRole)) {
        const snapEid =
          o.employeeId != null && Number.isFinite(Number(o.employeeId))
            ? Math.floor(Number(o.employeeId))
            : 0
        const snapCode = o.employeeCode != null ? String(o.employeeCode).trim() : ''
        let allowedStores: string[] | undefined
        if (Array.isArray(o.allowedStores)) {
          allowedStores = o.allowedStores.map((x) => String(x || '').trim()).filter(Boolean)
          if (allowedStores.length === 0) allowedStores = undefined
        }
        return {
          ...partial,
          role: snapRole,
          ...(partial.employeeId == null && snapEid > 0 ? { employeeId: snapEid } : {}),
          ...(partial.employeeCode == null && snapCode ? { employeeCode: snapCode } : {}),
          ...(partial.allowedStores == null && allowedStores ? { allowedStores } : {}),
        }
      }
    }
  } catch {
    /* ignore */
  }

  if (!role) {
    return { ...partial, role: 'staff' }
  }
  return partial
}

function saveAuth(auth: AuthState) {
  try {
    sessionStorage.setItem('cm_store', auth.store)
    sessionStorage.setItem('cm_user', auth.user)
    sessionStorage.setItem('cm_role', auth.role)
    if (auth.company) sessionStorage.setItem('cm_company', auth.company)
    else sessionStorage.removeItem('cm_company')
    if (auth.tenantId) sessionStorage.setItem('cm_tenant_id', auth.tenantId)
    else sessionStorage.removeItem('cm_tenant_id')
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
    if (auth.canManageOfficePayroll) {
      sessionStorage.setItem(CM_OFFICE_PAYROLL_KEY, '1')
    } else {
      sessionStorage.removeItem(CM_OFFICE_PAYROLL_KEY)
    }
    localStorage.setItem(
      LAST_LOGIN_SNAPSHOT_KEY,
      JSON.stringify({
        store: auth.store,
        user: auth.user,
        role: auth.role,
        ...(auth.company ? { company: auth.company } : {}),
        ...(auth.tenantId ? { tenantId: auth.tenantId } : {}),
        ...(auth.employeeId != null && auth.employeeId > 0 ? { employeeId: auth.employeeId } : {}),
        ...(auth.employeeCode ? { employeeCode: auth.employeeCode } : {}),
        ...(auth.allowedStores && auth.allowedStores.length > 0 ? { allowedStores: auth.allowedStores } : {}),
        ...(auth.canManageOfficePayroll ? { canManageOfficePayroll: true } : {}),
      })
    )
  } catch {}
}

/** 세션·토큰·마지막 로그인 스냅샷 제거. 스냅샷을 남기면 로그인 URL에서 전역 auth가 복구되어 곧바로 앱으로 튕김(로그아웃 무력화). 오프라인 재진입은 로그인 화면에서 스냅샷을 읽는 CTA로만 사용. */
function clearAuth() {
  try {
    sessionStorage.removeItem('cm_store')
    sessionStorage.removeItem('cm_user')
    sessionStorage.removeItem('cm_role')
    sessionStorage.removeItem('cm_company')
    sessionStorage.removeItem('cm_tenant_id')
    sessionStorage.removeItem('cm_token')
    try {
      localStorage.removeItem('cm_token')
    } catch {}
    sessionStorage.removeItem('cm_employee_id')
    sessionStorage.removeItem('cm_employee_code')
    sessionStorage.removeItem(CM_ALLOWED_STORES_KEY)
    sessionStorage.removeItem(CM_OFFICE_PAYROLL_KEY)
    try {
      localStorage.removeItem(LAST_LOGIN_SNAPSHOT_KEY)
    } catch {}
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
      const path = typeof window !== 'undefined' ? window.location.pathname || '' : ''
      if (!isAuthLoginPathname(path)) {
        a = loadOfflineResumeAuth()
      }
    }
    if (a) a = enrichOfflinePosAuth(a)
    setAuthState(a)
    // 세션 복구·스냅샷 복구 후 sessionStorage·스냅샷 동기화 (새 탭/401 직후에도 POS 레이아웃이 로그인으로 튕기지 않게)
    if (a) saveAuth(a)
    setInitialized(true)
  }, [])

  const setAuth = useCallback((a: AuthState | null) => {
    if (a) {
      const enriched = enrichOfflinePosAuth(a)
      setAuthState(enriched)
      saveAuth(enriched)
      return
    }
    setAuthState(null)
    clearAuth()
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
