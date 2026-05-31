'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  ADMIN_UI_LANG_OPTIONS,
  type LangCode,
  isLangCode,
} from '@/lib/lang-context'
import { memberPortalT, type MemberPortalKey } from '@/lib/member-portal-i18n'

const MEMBER_LANG_KEY = 'cm_member_lang'

function loadMemberLang(): LangCode {
  if (typeof window === 'undefined') return 'th'
  try {
    const s = localStorage.getItem(MEMBER_LANG_KEY)
    if (s && isLangCode(s)) return s
  } catch {
    /* ignore */
  }
  return 'th'
}

type MemberPortalLangContextValue = {
  lang: LangCode
  setLang: (l: LangCode) => void
  t: (key: MemberPortalKey, vars?: Record<string, string>) => string
}

const MemberPortalLangContext = createContext<MemberPortalLangContextValue | null>(null)

export function MemberPortalLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('th')

  useEffect(() => {
    setLangState(loadMemberLang())
  }, [])

  const setLang = useCallback((l: LangCode) => {
    setLangState(l)
    try {
      localStorage.setItem(MEMBER_LANG_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const t = useCallback(
    (key: MemberPortalKey, vars?: Record<string, string>) => memberPortalT(lang, key, vars),
    [lang]
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <MemberPortalLangContext.Provider value={value}>{children}</MemberPortalLangContext.Provider>
}

export function useMemberPortalLang(): MemberPortalLangContextValue {
  const ctx = useContext(MemberPortalLangContext)
  if (!ctx) throw new Error('useMemberPortalLang must be used within MemberPortalLangProvider')
  return ctx
}

export { ADMIN_UI_LANG_OPTIONS as MEMBER_PORTAL_LANG_OPTIONS }
