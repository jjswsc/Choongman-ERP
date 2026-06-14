'use client'

import { startTransition } from 'react'
import { Languages } from 'lucide-react'
import {
  MEMBER_PORTAL_LANG_OPTIONS,
  useMemberPortalLang,
} from '@/lib/member-portal-lang-context'
import type { LangCode } from '@/lib/lang-context'

export function MemberPortalLangSelect({ className }: { className?: string }) {
  const { lang, setLang, t } = useMemberPortalLang()

  return (
    <label className={`inline-flex items-center gap-2 ${className || ''}`}>
      <Languages className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
      <span className="sr-only">{t('langLabel')}</span>
      <select
        value={lang}
        onChange={(e) => {
          const next = e.target.value as LangCode
          requestAnimationFrame(() => {
            startTransition(() => setLang(next))
          })
        }}
        className="h-9 max-w-[9.5rem] truncate rounded-xl border border-stone-200 bg-white px-2 text-xs text-stone-800 shadow-sm outline-none focus:border-amber-400/60"
        aria-label={t('langLabel')}
      >
        {MEMBER_PORTAL_LANG_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-white text-stone-900">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
