'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, Home } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { canAccessAdmin } from '@/lib/permissions'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

/** /pos/local 전용 레이아웃 - 헤더 포함 */
export default function PosLocalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isHub = pathname === '/pos/local' || pathname === '/pos/local/'

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-1">
          <Link
            href={isHub ? '/pos' : '/pos/local'}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {isHub ? <Home className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            {isHub ? t('posHome') : t('posLocalHub')}
          </Link>
          {canAccessAdmin(auth?.role || '') && (
            <Link
              href="/admin"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('posAdmin')}
            </Link>
          )}
        </div>
        <span className="text-sm font-bold text-slate-800">{t('posLocalHub')}</span>
        <div className="w-16" />
      </header>
      <main className="flex-1 overflow-auto p-4">{children}</main>
    </div>
  )
}
