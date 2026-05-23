'use client'

import * as React from 'react'
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  useOnlineStatus,
  getOfflineQueueCounts,
  getOfflineQueueErrorHint,
  OFFLINE_QUEUE_UPDATED_EVENT,
  removeDeadLetterFromQueue,
  syncPending,
  onSyncComplete,
  getSyncSnapshot,
  onSyncSnapshot,
  getAllPending,
  OFFLINE_QUEUE_MAX_RETRIES,
  formatQueuedAtBangkok,
  formatLastTriedBangkok,
  isQueueItemDeadLetter,
  summarizeQueuedRequestBody,
  normalQueuedApiPath,
  type SyncSnapshot,
  type PendingRequest,
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
  const [lastErrorHint, setLastErrorHint] = React.useState<string | null>(null)
  const [queueDetailOpen, setQueueDetailOpen] = React.useState(false)
  const [queueDetailItems, setQueueDetailItems] = React.useState<PendingRequest[]>([])
  const [queueDetailLoading, setQueueDetailLoading] = React.useState(false)

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
      .then(async ({ retriable, dead }) => {
        setRetriableCount(retriable)
        setDeadLetterCount(dead)
        try {
          const hint = await getOfflineQueueErrorHint()
          setLastErrorHint(hint)
        } catch {
          setLastErrorHint(null)
        }
      })
      .catch(() => {
        setRetriableCount(0)
        setDeadLetterCount(0)
        setLastErrorHint(null)
      })
  }, [])

  const triggerSyncNow = React.useCallback(() => {
    if (syncing) return
    setSyncing(true)
    syncPending({ bypassBackoff: true })
      .then((result) => {
        if (result.synced > 0) onSync?.()
        refreshPending()
      })
      .finally(() => setSyncing(false))
  }, [onSync, refreshPending, syncing])

  React.useEffect(() => {
    refreshPending()
  }, [refreshPending])

  React.useEffect(() => {
    if (!online) return
    triggerSyncNow()
  }, [online, triggerSyncNow])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const onQueueUpdated = () => {
      refreshPending()
      if (online) triggerSyncNow()
    }
    window.addEventListener(OFFLINE_QUEUE_UPDATED_EVENT, onQueueUpdated)
    return () => window.removeEventListener(OFFLINE_QUEUE_UPDATED_EVENT, onQueueUpdated)
  }, [online, refreshPending, triggerSyncNow])

  React.useEffect(() => {
    if (!online || retriableCount <= 0 || syncing) return
    const tid = window.setInterval(() => {
      triggerSyncNow()
    }, 6000)
    return () => window.clearInterval(tid)
  }, [online, retriableCount, syncing, triggerSyncNow])

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
    return t('offlineBannerSyncMetaLine')
      .replace('{time}', lastSyncAtText)
      .replace('{synced}', String(synced))
      .replace('{failed}', String(failed))
  }, [lastSyncAtText, syncSnapshot.lastFailed, syncSnapshot.lastSynced, t])

  const lastErrorLine = React.useMemo(() => {
    if (!lastErrorHint || !lastErrorHint.trim()) return null
    const max = 220
    const reason =
      lastErrorHint.length > max ? `${lastErrorHint.slice(0, max)}…` : lastErrorHint
    return t('offlineBannerLastError').replace('{reason}', reason)
  }, [lastErrorHint, t])

  const openQueueDetail = React.useCallback(async () => {
    setQueueDetailOpen(true)
    setQueueDetailLoading(true)
    try {
      const all = await getAllPending()
      all.sort((a, b) => a.createdAt - b.createdAt)
      setQueueDetailItems(all)
    } catch {
      setQueueDetailItems([])
    } finally {
      setQueueDetailLoading(false)
    }
  }, [])

  if (offlineOnly && online) return null
  if (!offlineOnly && online && totalQueued === 0) return null

  return (
    <>
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
        <button
          type="button"
          disabled={syncing}
          title={t('offlineBannerViewQueueDetails')}
          onClick={() => {
            if (!syncing) void openQueueDetail()
          }}
          className={cn(
            'w-full min-w-0 truncate text-left text-xs text-amber-700/90',
            !syncing && 'cursor-pointer rounded-sm hover:underline hover:decoration-amber-700/80',
            syncing && 'cursor-default opacity-70',
          )}
        >
          {syncMetaText}
        </button>
        {totalQueued > 0 && !syncing && (
          <button
            type="button"
            onClick={() => void openQueueDetail()}
            className="w-fit text-left text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
          >
            {t('offlineBannerViewQueueDetails')}
          </button>
        )}
        {online && retriableCount > 0 && lastErrorLine && (
          <div className="break-words text-xs text-destructive/95" title={lastErrorHint ?? undefined}>
            {lastErrorLine}
          </div>
        )}
      </div>
      {online && !syncing && (
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          {retriableCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 border-amber-600/50 text-amber-700 hover:bg-amber-500/20"
              onClick={() => {
                triggerSyncNow()
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

    <Dialog open={queueDetailOpen} onOpenChange={setQueueDetailOpen}>
      <DialogContent className="max-h-[85vh] max-w-lg gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1 px-4 pb-2 pt-4">
          <DialogTitle>{t('offlineBannerQueueDetailTitle')}</DialogTitle>
          <DialogDescription>{t('offlineBannerQueueDetailDesc')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(60vh,420px)] px-4">
          {queueDetailLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{syncingMsg}</span>
            </div>
          ) : queueDetailItems.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{t('offlineBannerQueueEmpty')}</p>
          ) : (
            <ul className="space-y-3 pb-4">
              {queueDetailItems.map((item) => {
                const dead = isQueueItemDeadLetter(item)
                const lastTry = formatLastTriedBangkok(item.lastTriedAt, item.createdAt)
                return (
                  <li
                    key={item.id}
                    className="rounded-md border border-amber-500/35 bg-background/80 p-3 text-xs shadow-sm"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-foreground">
                        {item.method} {normalQueuedApiPath(item.api)}
                      </span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium',
                          dead
                            ? 'bg-destructive/15 text-destructive'
                            : 'bg-amber-500/20 text-amber-900',
                        )}
                      >
                        {dead
                          ? t('offlineBannerQueueStatusDead')
                          : t('offlineBannerQueueStatusRetriable')}
                      </span>
                    </div>
                    <dl className="grid gap-1.5 text-[11px] leading-snug text-muted-foreground">
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-foreground/80">{t('offlineBannerQueueLabelQueuedAt')}</dt>
                        <dd className="min-w-0 break-words">{formatQueuedAtBangkok(item.createdAt)}</dd>
                      </div>
                      {lastTry ? (
                        <div className="flex gap-2">
                          <dt className="w-28 shrink-0 text-foreground/80">{t('offlineBannerQueueLabelLastTry')}</dt>
                          <dd className="min-w-0 break-words">{lastTry}</dd>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-foreground/80">{t('offlineBannerQueueLabelRetries')}</dt>
                        <dd>
                          {item.retryCount}/{OFFLINE_QUEUE_MAX_RETRIES}
                        </dd>
                      </div>
                      {item.metadata?.localOrderNo ? (
                        <div className="flex gap-2">
                          <dt className="w-28 shrink-0 text-foreground/80">{t('offlineBannerQueueLabelLocalOrder')}</dt>
                          <dd className="font-mono text-foreground">{item.metadata.localOrderNo}</dd>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 align-top text-foreground/80">{t('offlineBannerQueueLabelSummary')}</dt>
                        <dd className="min-w-0 break-words text-foreground/90">{summarizeQueuedRequestBody(item)}</dd>
                      </div>
                      {item.lastError?.trim() ? (
                        <div className="flex gap-2">
                          <dt className="w-28 shrink-0 align-top text-foreground/80">{t('offlineBannerQueueLabelLastError')}</dt>
                          <dd className="min-w-0 break-words text-destructive">{item.lastError.trim()}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
        <DialogFooter className="border-t px-4 py-3">
          <Button type="button" variant="secondary" onClick={() => setQueueDetailOpen(false)}>
            {t('btnClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
