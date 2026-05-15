'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowLeft, Home } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ADMIN_UI_LANG_OPTIONS, type LangCode, useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

/** /pos/local 전용 레이아웃 - 헤더 포함 */
export default function PosLocalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { lang, setLang } = useLang()
  const t = useT(lang)

  const isPettyCash = pathname?.includes('/petty-cash')
  const headerTitle = isPettyCash ? t('adminPettyCash') : t('posCashInputOutput')

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col">
      <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-slate-200 bg-white px-3 shadow-sm sm:px-4">
        <div className="flex min-w-0 items-center gap-1 justify-self-start">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('posBack')}
          </button>
          <Link
            href="/pos"
            className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <Home className="h-4 w-4" />
            {t('posHome')}
          </Link>
        </div>
        <span className="max-w-[min(42vw,12rem)] truncate text-center text-sm font-bold text-slate-800 sm:max-w-[16rem]">
          {headerTitle || (isPettyCash ? t('adminPettyCash') : t('posCashInputOutput'))}
        </span>
        <div className="flex min-w-0 justify-end justify-self-end">
          <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
            <SelectTrigger
              className="h-9 w-[min(100%,9.5rem)] sm:h-10 sm:w-36"
              aria-label={t('posLanguage') || 'Language'}
            >
              <SelectValue placeholder={t('posLanguage') || '언어'} />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_UI_LANG_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-6 lg:px-8 [-webkit-overflow-scrolling:touch]">
        {children}
      </main>
    </div>
  )
}
