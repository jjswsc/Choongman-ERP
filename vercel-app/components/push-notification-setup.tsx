'use client'

import { useState } from 'react'
import { isFirebaseConfigured, requestNotificationPermission, getFcmToken } from '@/lib/firebase-client'
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
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setMessage(t('pushBlocked'))
        setLoading(false)
        return
      }
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        setMessage(permission === 'denied' ? t('pushDenied') : t('pushGrant'))
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
        const lastError = lastDetail || lastErr || ""
        const isNetwork = lastErr === "network" || /fetch|Failed|timeout|ERR_|network/i.test(lastError)
        const hint =
          lastError.includes('앱 내 브라우저') || lastError.includes('Chrome 앱을 열고') || lastError.includes('push service') || lastError.includes('지원하지 않습니다')
            ? t('pushChromeHint')
            : lastError.includes('HTTPS') || lastError.includes('localhost') || lastError.includes('Firebase 설정')
                ? lastError
                : isNetwork
                  ? t('pushNetworkHint') + (lastError ? ` (${lastError.slice(0, 50)}…)` : '')
                  : lastError
                    ? lastError
                    : t('pushChromeHint')
        setMessage(`${t('pushTokenFail')} ${hint}`)
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
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t('pushError'))
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
      <Bell className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="text-xs text-muted-foreground">{t('pushDesc')}</span>
      <span className="text-[10px] text-muted-foreground/70">({t('pushHint')})</span>
      {!done && (
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
      )}
      {message && (
        <div className={`w-full rounded-md px-2 py-1.5 text-[11px] ${done ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
