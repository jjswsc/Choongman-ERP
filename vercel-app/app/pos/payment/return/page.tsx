/**
 * POS용 KBank 스위치백 스텁.
 */
'use client'

import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

export default function PosPaymentReturnPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <main className="min-h-[40vh] flex flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">{t('posPaymentReturnTitle')}</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        {t('posPaymentReturnBody')}
      </p>
    </main>
  )
}
