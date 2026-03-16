'use client'

import { ReceiptsManagementTab } from '@/components/tabs/receipts-management-tab'
import { OfflineBanner } from '@/components/offline-banner'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

/** POS 영수증 관리 - 관리자와 동일한 판매 리스트 UI, 매출 관리와 동일한 동작 흐름 */
export default function PosLocalReceiptsPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="space-y-3">
      <OfflineBanner
        offlineOnly
        offlineMsg={t('posLocalOfflineNotice') || '오프라인 - 캐시된 주문 데이터를 표시합니다. 연결 시 자동으로 최신 데이터를 불러옵니다.'}
      />
      <ReceiptsManagementTab offlineAware readOnly />
    </div>
  )
}
