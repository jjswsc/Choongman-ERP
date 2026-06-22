'use client'

import { startTransition } from 'react'
import { Languages } from 'lucide-react'
import {
  MEMBER_PORTAL_LANG_OPTIONS,
  useMemberPortalLang,
} from '@/lib/member-portal-lang-context'
import type { LangCode } from '@/lib/lang-context'
import { cn } from '@/lib/utils'

export function MemberPortalLangSelect({
  className,
  compact = true,
}: {
  className?: string
  compact?: boolean
}) {
  const { lang, setLang, t } = useMemberPortalLang()

  return (
    <label className={cn('inline-flex items-center gap-1', className)}>
      <Languages
        className={cn('shrink-0 text-stone-400', compact ? 'h-3 w-3' : 'h-4 w-4')}
        aria-hidden
      />
      <span className="sr-only">{t('langLabel')}</span>
      <select
        value={lang}
        onChange={(e) => {
          const next = e.target.value as LangCode
          requestAnimationFrame(() => {
            startTransition(() => setLang(next))
          })
        }}
        className={cn(
          'truncate rounded-lg border border-stone-200/90 bg-white/95 text-stone-800 shadow-sm outline-none focus:border-amber-400/60',
          compact
            ? 'h-7 max-w-[4.75rem] px-1 text-[10px] font-medium'
            : 'h-9 max-w-[9.5rem] px-2 text-xs'
        )}
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
