'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { useAuth } from '@/lib/auth-context'
import { useStoreList } from '@/lib/api-client'
import { isPosTableOrderEnabledStore } from '@/lib/pos-table-order-access'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

export default function PosTableOrderEntryPage() {
  const router = useRouter()
  const { auth } = useAuth()
  const { stores } = useStoreList()
  const { lang } = useLang()
  const t = useT(lang)
  const storeCode = auth?.store || stores[0] || ''
  const enabled = isPosTableOrderEnabledStore(storeCode)

  useEffect(() => {
    if (!storeCode) return
    if (enabled) {
      navigatePosOfflineAware('/pos/terminal?type=dine_in&audience=guest', (p) => router.replace(p))
      return
    }
    navigatePosOfflineAware('/pos/order?type=dine_in&audience=guest', (p) => router.replace(p))
  }, [enabled, router, storeCode])

  return (
    <div className="flex h-full items-center justify-center bg-background p-4 text-center text-sm text-muted-foreground">
      {enabled
        ? (t('posLoading') || '불러오는 중...')
        : (t('posTableOrderUnavailableStore') || '이 매장은 테이블 오더를 사용하지 않습니다.')}
    </div>
  )
}
