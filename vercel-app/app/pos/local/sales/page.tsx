'use client'

import { SalesManagementTab } from '@/components/tabs/sales-management-tab'
import { OfflineBanner } from '@/components/offline-banner'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

/** POS 매출 관리 - 관리자와 동일한 풀 UI, 오프라인 시 캐시 표시, 재연결 시 자동 새로고침 */
export default function PosLocalSalesPage() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="space-y-3">
      <OfflineBanner
        offlineOnly
        offlineMsg={t('posLocalOfflineNotice') || '오프라인 - 캐시된 매출 데이터를 표시합니다. 연결 시 자동으로 최신 데이터를 불러옵니다.'}
      />
      <SalesManagementTab offlineAware />
    </div>
  )
}
