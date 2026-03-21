'use client'

import * as React from 'react'
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useOnlineStatus,
  getPendingCount,
  syncPending,
  onSyncComplete,
} from '@/lib/offline'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

interface OfflineBannerProps {
  /** 동기화 완료 시 호출 (todaySales 갱신 등) */
  onSyncComplete?: () => void
  /** i18n: 오프라인 메시지 */
  offlineMsg?: string
  /** i18n: 동기화 중 메시지 */
  syncingMsg?: string
  /** i18n: 재시도 버튼 */
  retryLabel?: string
  /** "대기 중인 {pendingLabel} N건" 문구용 (기본: 주문) */
  pendingLabel?: string
  /** true: 오프라인일 때만 표시 (매출 관리 등, 주문 대기 건수 무시) */
  offlineOnly?: boolean
}

export function OfflineBanner({
  onSyncComplete: onSync,
  offlineMsg: offlineMsgProp,
  syncingMsg: syncingMsgProp,
  retryLabel: retryLabelProp,
  pendingLabel: pendingLabelProp,
  offlineOnly = false,
}: OfflineBannerProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const offlineMsg = offlineMsgProp ?? t('offlineBannerAdminSaved')
  const syncingMsg = syncingMsgProp ?? t('offlineBannerSyncing')
  const retryLabel = retryLabelProp ?? t('offlineBannerRetry')
  const pendingLabel = pendingLabelProp ?? t('offlineBannerPendingOrders')
  const online = useOnlineStatus()
  const [pendingCount, setPendingCount] = React.useState(0)
  const [syncing, setSyncing] = React.useState(false)

  const pendingLineText = React.useMemo(
    () => t('offlineBannerPendingLine').replace('{label}', pendingLabel).replace('{count}', String(pendingCount)),
    [t, pendingLabel, pendingCount]
  )

  const refreshPending = React.useCallback(() => {
    getPendingCount().then(setPendingCount).catch(() => setPendingCount(0))
  }, [])

  React.useEffect(() => {
    refreshPending()
  }, [refreshPending])

  React.useEffect(() => {
    if (!online) return
    setSyncing(true)
    syncPending()
      .then((result) => {
        if (result.synced > 0) onSync?.()
        refreshPending()
      })
      .finally(() => setSyncing(false))
  }, [online, onSync, refreshPending])

  React.useEffect(() => {
    return onSyncComplete(() => {
      refreshPending()
      onSync?.()
    })
  }, [onSync, refreshPending])

  if (offlineOnly && online) return null
  if (!offlineOnly && online && pendingCount === 0) return null

  return (
    <div className="mx-4 my-2 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        {syncing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            <span>{syncingMsg} ({pendingCount})</span>
          </>
        ) : online ? (
          <>
            <RefreshCw className="h-4 w-4 text-amber-600" />
            <span>{pendingLineText}</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-amber-600" />
            <span>{offlineMsg}</span>
            {pendingCount > 0 && (
              <span className="text-amber-700 font-medium">
                {t('offlineBannerOfflineQueued').replace('{count}', String(pendingCount))}
              </span>
            )}
          </>
        )}
      </div>
      {online && pendingCount > 0 && !syncing && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-amber-600/50 text-amber-700 hover:bg-amber-500/20"
          onClick={() => {
            setSyncing(true)
            syncPending()
              .then(() => {
                refreshPending()
                onSync?.()
              })
              .finally(() => setSyncing(false))
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
