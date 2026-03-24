'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type LangCode = 'ko' | 'en' | 'th' | 'mm' | 'la' | 'kh' | 'vi' | 'ms'

/** UI·sessionStorage와 동일한 지원 언어 목록 (한곳에서만 정의) */
export const LANG_CODES: readonly LangCode[] = ['ko', 'en', 'th', 'mm', 'la', 'kh', 'vi', 'ms']

export function isLangCode(s: string): s is LangCode {
  return (LANG_CODES as readonly string[]).includes(s)
}

function loadLang(): LangCode {
  if (typeof window === 'undefined') return 'ko'
  try {
    const s = sessionStorage.getItem('cm_lang')
    if (s && isLangCode(s)) return s
  } catch {}
  return 'ko'
}

const LangContext = createContext<{ lang: LangCode; setLang: (l: LangCode) => void } | null>(null)

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('ko')

  useEffect(() => {
    setLangState(loadLang())
  }, [])

  const setLang = useCallback((l: LangCode) => {
    setLangState(l)
    try {
      sessionStorage.setItem('cm_lang', l)
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
