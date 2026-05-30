'use client'

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
      <Languages className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
      <span className="sr-only">{t('langLabel')}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as LangCode)}
        className="h-9 max-w-[9.5rem] truncate rounded-xl border border-white/10 bg-black/30 px-2 text-xs text-white/85 outline-none focus:border-amber-400/40"
        aria-label={t('langLabel')}
      >
        {MEMBER_PORTAL_LANG_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#121214] text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
