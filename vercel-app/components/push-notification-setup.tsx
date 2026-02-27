'use client'

import { useEffect, useState } from 'react'
import { isFirebaseConfigured, preRegisterServiceWorker, requestNotificationPermission, getFcmToken, unregisterServiceWorkers } from '@/lib/firebase-client'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  store: string
  name: string
}

export function PushNotificationSetup({ store, name }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [swRetryHint, setSwRetryHint] = useState(false)
  const [tokenFailed, setTokenFailed] = useState(false)
  const [webViewError, setWebViewError] = useState(false)
  const [permissionBlocked, setPermissionBlocked] = useState(false)

  useEffect(() => {
    if (store?.trim() && name?.trim()) preRegisterServiceWorker()
  }, [store, name])

  if (!store?.trim() || !name?.trim()) return null

  // Firebase 미설정 시에도 안내 문구 표시 (알림 설정이 있다는 것을 사용자에게 알림)
  if (!isFirebaseConfigured()) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <Bell className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="text-xs text-muted-foreground">
          {t('pushFirebaseRequired')}
        </span>
      </div>
    )
  }

  const handleEnablePush = async () => {
    setLoading(true)
    setMessage(null)
    setTokenFailed(false)
    setWebViewError(false)
    setPermissionBlocked(false)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setMessage((t('pushBlocked') || '') + (t('pushAllowGuide') || ''))
        setPermissionBlocked(true)
        setLoading(false)
        return
      }
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        setMessage((permission === 'denied' ? t('pushDenied') : t('pushGrant')) + (t('pushAllowGuide') || ''))
        setPermissionBlocked(permission === 'denied')
        setLoading(false)
        return
      }
      let lastErr: string | undefined
      let lastDetail: string | undefined
      const token = await getFcmToken((err, detail) => {
        lastErr = err
        lastDetail = detail
      })
      if (!token) {
        const lastError = (lastDetail || lastErr || "").trim()
        const isSwRelated = /subscribing|subscribe|Subscription failed|no active Service Worker|Service Worker/i.test(lastError)
        const isWebView = lastErr === "webview" || /push service not available|Registration failed|앱 내 브라우저|WebView/i.test(lastError)
        setWebViewError(isWebView)
        const pushServiceUnavail = /push service not available|Registration failed/i.test(lastError)
        const baseMsg = lastError ? `${t('pushTokenFail')} ${lastError}` : `${t('pushTokenFail')} ${t('pushChromeHint')}`
        const troubleshootHint = pushServiceUnavail
          ? (t('pushTroubleshootHint') || '\n→ 광고차단 해제, 시크릿 모드, Chrome 새 프로필에서 시도해 보세요.')
          : ''
        setMessage(baseMsg + troubleshootHint)
        setSwRetryHint(isSwRelated)
        setTokenFailed(true)
        setLoading(false)
        return
      }
      const res = await fetch('/api/savePushToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: store.trim(),
          name: name.trim(),
          token,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }),
      })
      if (res.ok) {
        setMessage(t('pushDone'))
        setDone(true)
        setTimeout(() => setMessage(null), 3000)
      } else {
        const err = await res.json().catch(() => ({}))
        setMessage(err?.message || t('pushSaveFail'))
        setTokenFailed(true)
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('pushError'))
      setTokenFailed(true)
    }
    setLoading(false)
  }

  const handleDisablePush = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/deletePushToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store: store.trim(),
          name: name.trim(),
        }),
      })
      if (res.ok) {
        setDone(false)
        setMessage(t('pushDisabled'))
        setTimeout(() => setMessage(null), 3000)
      } else {
        const err = await res.json().catch(() => ({}))
        setMessage(err?.message || t('pushSaveFail'))
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('pushError'))
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
      <Bell className="h-3.5 w-3.5 shrink-0 text-primary" />
      {done ? (
        <>
          <span className="text-xs text-muted-foreground">{t('pushEnabled')}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2.5 text-[11px] text-muted-foreground"
            onClick={handleDisablePush}
            disabled={loading}
          >
            {t('pushDisable')}
          </Button>
        </>
      ) : (
        <>
          <span className="text-xs text-muted-foreground">{t('pushDesc')}</span>
          <span className="text-[10px] text-muted-foreground/70">({t('pushHint')})</span>
        </>
      )}
      {!done && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[11px]"
            onClick={handleEnablePush}
            disabled={loading}
          >
            {loading ? t('pushLoading') : t('pushBtn')}
          </Button>
          {permissionBlocked && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => typeof window !== 'undefined' && window.location.reload()}
              disabled={loading}
            >
              {t('pushRefreshHint') || '페이지 새로고침'}
            </Button>
          )}
          {tokenFailed && (
            <>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 px-2.5 text-[11px]"
                onClick={async () => {
                  setMessage(null)
                  if (swRetryHint) {
                    setLoading(true)
                    setMessage(t('pushRetryWait') || '15초 후 자동으로 다시 시도합니다...')
                    await new Promise((r) => setTimeout(r, 15000))
                    setMessage(null)
                  }
                  handleEnablePush()
                }}
                disabled={loading}
              >
                {t('posRetrySync') || '다시 시도'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => typeof window !== 'undefined' && window.location.reload()}
                disabled={loading}
              >
                {t('pushRefreshHint') || '페이지 새로고침'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px] border-amber-400 text-amber-700 dark:text-amber-400"
                onClick={async () => {
                  setLoading(true)
                  setMessage(t('pushSwResetHint') || 'Service Worker를 초기화한 뒤 새로고침합니다...')
                  await unregisterServiceWorkers()
                  if (typeof window !== 'undefined') window.location.reload()
                }}
                disabled={loading}
              >
                {t('pushSwReset') || 'SW 초기화 후 새로고침'}
              </Button>
              {webViewError && (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-7 px-2.5 text-[11px] bg-primary"
                  onClick={() => {
                    const url = typeof window !== 'undefined' ? window.location.href : ''
                    if (url && navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(url)
                      setMessage(t('pushUrlCopied') || '주소가 복사되었습니다. Chrome 앱을 열고 붙여넣기 후 접속하세요.')
                    }
                  }}
                >
                  {t('pushCopyUrl') || '주소 복사'}
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {message && (
        <div className={`w-full rounded-md px-2 py-1.5 text-[11px] ${done ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
