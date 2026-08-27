'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type LangCode = 'ko' | 'en' | 'th' | 'mm' | 'la' | 'kh' | 'vi' | 'ms'

/** UI·sessionStorage와 동일한 지원 언어 목록 (한곳에서만 정의) */
export const LANG_CODES: readonly LangCode[] = ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms']

export function isLangCode(s: string): s is LangCode {
  return (LANG_CODES as readonly string[]).includes(s)
}

/** 관리자(ERP / SaaS) 로그인·헤더 — POS·모바일과 동일 8개 코드 */
export const ADMIN_UI_LANGS = LANG_CODES

export type AdminUiLang = LangCode

export function isAdminUiLang(s: string): s is AdminUiLang {
  return isLangCode(s)
}

/** 알 수 없는 값만 ko로 (POS에서 mm 등 선택 후 /admin 진입 시 유지) */
export function normalizeAdminUiLang(lang: string): LangCode {
  if (isLangCode(lang)) return lang
  return 'ko'
}

/** `<input type="date">` 등 네이티브 UI 로케일용 BCP 47 */
export function langCodeToHtmlLang(lang: LangCode): string {
  switch (lang) {
    case 'ko':
      return 'ko'
    case 'en':
      return 'en'
    case 'th':
      return 'th'
    case 'mm':
      return 'my'
    case 'la':
      return 'lo'
    case 'kh':
      return 'km'
    case 'vi':
      return 'vi'
    case 'ms':
      return 'ms'
    default:
      return 'en'
  }
}

export const ADMIN_UI_LANG_OPTIONS: { value: LangCode; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'th', label: 'ไทย' },
  { value: 'mm', label: 'မြန်မာ' },
  { value: 'la', label: 'ລາວ' },
  { value: 'kh', label: 'ខ្មែរ' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'ms', label: 'Bahasa Melayu' },
]

function loadLang(): LangCode {
  if (typeof window === 'undefined') return 'ko'
  try {
    const s = sessionStorage.getItem('cm_lang')
    if (s && isLangCode(s)) return s
  } catch {}
  try {
    const s = localStorage.getItem('cm_lang')
    if (s && isLangCode(s)) return s
  } catch {}
  return 'ko'
}

const LangContext = createContext<{ lang: LangCode; setLang: (l: LangCode) => void } | null>(null)

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => loadLang())

  useEffect(() => {
    const loaded = loadLang()
    setLangState(loaded)
    try {
      sessionStorage.setItem('cm_lang', loaded)
    } catch {}
    try {
      localStorage.setItem('cm_lang', loaded)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = langCodeToHtmlLang(lang)
  }, [lang])

  const setLang = useCallback((l: LangCode) => {
    setLangState(l)
    try {
      sessionStorage.setItem('cm_lang', l)
    } catch {}
    try {
      localStorage.setItem('cm_lang', l)
    } catch {}
  }, [])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
