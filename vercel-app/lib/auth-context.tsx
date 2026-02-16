'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export interface AuthState {
  store: string
  user: string
  role: string
  token?: string
}

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

function saveAuth(auth: AuthState) {
  try {
    sessionStorage.setItem('cm_store', auth.store)
    sessionStorage.setItem('cm_user', auth.user)
    sessionStorage.setItem('cm_role', auth.role)
    if (auth.token) sessionStorage.setItem('cm_token', auth.token)
  } catch {}
}

function clearAuth() {
  try {
    sessionStorage.removeItem('cm_store')
    sessionStorage.removeItem('cm_user')
    sessionStorage.removeItem('cm_role')
    sessionStorage.removeItem('cm_token')
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
    setAuthState(loadAuth())
    setInitialized(true)
  }, [])

  const setAuth = (a: AuthState | null) => {
    setAuthState(a)
    if (a) saveAuth(a)
    else clearAuth()
  }

  const logout = () => {
    setAuthState(null)
    clearAuth()
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ auth, initialized, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
