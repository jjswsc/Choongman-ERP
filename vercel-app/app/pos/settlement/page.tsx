'use client'

import { useSearchParams } from 'next/navigation'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { PosSettlementForm } from '@/components/pos/pos-settlement-form'

/** POS 화면 내 영업시작/영업마감 결산 */
export default function PosSettlementPage() {
  const searchParams = useSearchParams()
  const { lang } = useLang()
  const t = useT(lang)
  const isOpenMode = searchParams.get('mode') === 'open'

  return <PosSettlementForm t={t} compact offlineAware openMode={isOpenMode} />
}
