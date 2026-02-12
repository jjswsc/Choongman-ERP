'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export type LangCode = 'ko' | 'en' | 'th' | 'mm' | 'la'

function loadLang(): LangCode {
  if (typeof window === 'undefined') return 'ko'
  try {
    const s = sessionStorage.getItem('cm_lang')
    if (s && ['ko', 'en', 'th', 'mm', 'la'].includes(s)) return s as LangCode
  } catch {}
  return 'ko'
}

const LangContext = createContext<{ lang: LangCode; setLang: (l: LangCode) => void } | null>(null)

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('ko')

  useEffect(() => {
    setLangState(loadLang())
  }, [])

  const setLang = (l: LangCode) => {
    setLangState(l)
    try {
      sessionStorage.setItem('cm_lang', l)
    } catch {}
  }

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
