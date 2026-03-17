'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ArrowLeft, Home } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

/** /pos/local 전용 레이아웃 - 헤더 포함 */
export default function PosLocalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { lang } = useLang()
  const t = useT(lang)

  const isPettyCash = pathname?.includes('/petty-cash')
  const headerTitle = isPettyCash ? t('adminPettyCash') : t('posCashInputOutput')

  return (
    <div className="flex min-h-full w-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('posBack')}
          </button>
          <Link
            href="/pos"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <Home className="h-4 w-4" />
            {t('posHome')}
          </Link>
        </div>
        <span className="text-sm font-bold text-slate-800">{headerTitle || (isPettyCash ? '패티 캐쉬' : '시재 입출금')}</span>
        <div className="w-16" />
      </header>
      <main className="flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
