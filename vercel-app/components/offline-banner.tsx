'use client'

import * as React from 'react'
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useOnlineStatus,
  getOfflineQueueCounts,
  removeDeadLetterFromQueue,
  syncPending,
  onSyncComplete,
  getSyncSnapshot,
  onSyncSnapshot,
  type SyncSnapshot,
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
  /** 아직 자동 전송 재시도 가능한 건 (한도 초과 건은 제외) */
  const [retriableCount, setRetriableCount] = React.useState(0)
  /** 재시도 한도 초과로 syncPending이 건너뛰는 건 — 예전에는 여기에 걸려 배너가 영구 표시됨 */
  const [deadLetterCount, setDeadLetterCount] = React.useState(0)
  const [syncing, setSyncing] = React.useState(false)
  const [syncSnapshot, setSyncSnapshot] = React.useState<SyncSnapshot>(() => getSyncSnapshot())

  const totalQueued = retriableCount + deadLetterCount

  const pendingLineText = React.useMemo(
    () =>
      t('offlineBannerPendingLine')
        .replace('{label}', pendingLabel)
        .replace('{count}', String(retriableCount)),
    [t, pendingLabel, retriableCount]
  )

  const refreshPending = React.useCallback(() => {
    getOfflineQueueCounts()
      .then(({ retriable, dead }) => {
        setRetriableCount(retriable)
        setDeadLetterCount(dead)
      })
      .catch(() => {
        setRetriableCount(0)
        setDeadLetterCount(0)
      })
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

  React.useEffect(() => {
    return onSyncSnapshot((snapshot) => {
      setSyncSnapshot(snapshot)
    })
  }, [])

  const lastSyncAtText = React.useMemo(() => {
    const ts = syncSnapshot.lastSuccessAt
    if (!ts) return '-'
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return '-'
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d)
  }, [syncSnapshot.lastSuccessAt])

  const syncMetaText = React.useMemo(() => {
    const synced = Math.max(0, Number(syncSnapshot.lastSynced ?? 0))
    const failed = Math.max(0, Number(syncSnapshot.lastFailed ?? 0))
    return `Sync ${lastSyncAtText} | +${synced} / !${failed}`
  }, [lastSyncAtText, syncSnapshot.lastFailed, syncSnapshot.lastSynced])

  if (offlineOnly && online) return null
  if (!offlineOnly && online && totalQueued === 0) return null

  return (
    <div className="mx-4 my-2 flex shrink-0 items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
        {syncing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            <span>
              {syncingMsg}
              {retriableCount > 0 ? ` (${retriableCount})` : ''}
            </span>
          </>
        ) : online ? (
          <>
            <RefreshCw className="h-4 w-4 text-amber-600" />
            <span>
              {retriableCount > 0 ? (
                pendingLineText
              ) : deadLetterCount > 0 ? (
                t('offlineBannerDeadLetterLine').replace('{count}', String(deadLetterCount))
              ) : null}
            </span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4 text-amber-600" />
            <span>{offlineMsg}</span>
            {totalQueued > 0 && (
              <span className="text-amber-700 font-medium">
                {t('offlineBannerOfflineQueued').replace('{count}', String(totalQueued))}
              </span>
            )}
          </>
        )}
        </div>
        {deadLetterCount > 0 && retriableCount > 0 && online && !syncing && (
          <div className="text-xs text-amber-800/95">
            {t('offlineBannerDeadLetterLine').replace('{count}', String(deadLetterCount))}
          </div>
        )}
        <div className="truncate text-xs text-amber-700/90">
          {syncMetaText}
        </div>
      </div>
      {online && !syncing && (
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          {retriableCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-amber-600/50 text-amber-700 hover:bg-amber-500/20"
              onClick={() => {
                setSyncing(true)
                syncPending({ bypassBackoff: true })
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
          {deadLetterCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => {
                const ok = window.confirm(t('offlineBannerRemoveDeadLetterConfirm'))
                if (!ok) return
                void removeDeadLetterFromQueue().then(() => {
                  refreshPending()
                  onSync?.()
                })
              }}
            >
              {t('offlineBannerRemoveDeadLetter')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
