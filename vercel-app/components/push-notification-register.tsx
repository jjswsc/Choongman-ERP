'use client'

import { useEffect, useRef, useState } from 'react'
import { isFirebaseConfigured, requestNotificationPermission, getFcmToken } from '@/lib/firebase-client'
import { useLang } from '@/lib/lang-context'

export function PushNotificationRegister(props: { store: string; name: string }) {
  const { store, name } = props
  const { lang } = useLang()
  const registered = useRef(false)
  const [showBanner, setShowBanner] = useState(true)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 자동 시도 (Chrome/Android에서는 페이지 로드 시에도 권한 요청 가능)
  useEffect(() => {
    if (!store?.trim() || !name?.trim() || registered.current) return
    if (!isFirebaseConfigured()) return

    let cancelled = false
    ;(async () => {
      try {
        const token = await getFcmToken()
        if (cancelled || !token) {
          if (!cancelled && typeof Notification !== 'undefined') {
            if (Notification.permission === 'default') setShowBanner(true)
            else if (Notification.permission === 'denied') {
              setShowBanner(true)
              setMessage('알림이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.')
            }
          }
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
            lang,
          }),
        })
        if (res.ok) {
          registered.current = true
          setShowBanner(false)
        } else {
          setShowBanner(true)
        }
      } catch (e) {
        console.warn('PushNotificationRegister:', e)
        setShowBanner(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [store, name])

  const handleEnablePush = async () => {
    if (!store?.trim() || !name?.trim() || !isFirebaseConfigured()) return
    setLoading(true)
    setMessage(null)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setMessage('알림이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.')
        setLoading(false)
        return
      }
      const permission = await requestNotificationPermission()
      if (permission !== 'granted') {
        setMessage(permission === 'denied' ? '알림이 차단되었습니다. 브라우저 설정에서 허용해 주세요.' : '알림 권한을 허용해 주세요.')
        setLoading(false)
        return
      }
      let lastError = ''
      const token = await getFcmToken((err, detail) => {
        lastError = detail || err
      })
      if (!token) {
        const hint =
          lastError && lastError.includes('앱 내 브라우저')
            ? '카카오톡·라인 등 앱 내에서 열면 안 됩니다. Chrome 앱을 열고 주소를 직접 입력해 접속하세요.'
            : lastError && lastError.includes('지원하지 않습니다')
              ? 'Chrome 브라우저에서 시도해 주세요.'
              : lastError && lastError.includes('permission') || lastError && lastError.includes('denied')
                ? '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'
                : 'Chrome에서 직접 접속했는지, HTTPS인지 확인하세요. (localhost 또는 배포 URL)'
        setMessage(`토큰을 받지 못했습니다. ${hint}`)
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
          lang,
        }),
      })
      if (res.ok) {
        registered.current = true
        setMessage('푸시 알림 설정이 완료되었습니다.')
        setShowBanner(false)
        setTimeout(() => setMessage(null), 3000)
      } else {
        const err = await res.json().catch(() => ({}))
        setMessage(err?.message || '저장에 실패했습니다.')
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '오류가 발생했습니다.')
    }
    setLoading(false)
  }

  if (!isFirebaseConfigured()) return null
  if (!showBanner && !message) return null

  return (
    <div className="sticky top-0 z-50 mx-auto max-w-lg bg-primary/10 px-3 py-2 text-center text-sm">
      {message ? (
        <p className={registered.current ? 'text-green-600' : 'text-amber-600'}>{message}</p>
      ) : showBanner ? (
        <>
          <p className="mb-2 text-muted-foreground">공지 등 푸시 알림을 받으시려면 아래를 눌러 주세요.</p>
          <button
            type="button"
            onClick={handleEnablePush}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? '설정 중...' : '푸시 알림 받기'}
          </button>
        </>
      ) : null}
    </div>
  )
}
