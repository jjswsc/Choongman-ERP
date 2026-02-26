'use client'

import { useState } from 'react'
import { isFirebaseConfigured, getFcmToken } from '@/lib/firebase-client'
import { Bell } from 'lucide-react'

interface Props {
  store: string
  name: string
}

export function PushNotificationSetup({ store, name }: Props) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!store?.trim() || !name?.trim()) return null

  if (!isFirebaseConfigured()) {
    return (
      <div className="overflow-hidden rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
        <p className="text-xs text-muted-foreground">
          푸시 알림 기능을 사용하려면 Firebase 설정이 필요합니다.
        </p>
      </div>
    )
  }

  const handleEnablePush = async () => {
    setLoading(true)
    setMessage(null)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        setMessage('알림이 차단되어 있습니다. 브라우저 설정에서 이 사이트의 알림을 허용해 주세요.')
        setLoading(false)
        return
      }
      const token = await getFcmToken()
      if (!token) {
        setMessage('토큰을 받지 못했습니다. 브라우저 알림 설정을 확인해 주세요.')
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
        setMessage('푸시 알림 설정이 완료되었습니다.')
        setDone(true)
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

  return (
    <div className="overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">푸시 알림</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            공지·주문 승인 등 알림을 휴대폰으로 받으시려면 아래를 눌러 주세요.
          </p>
          {message && (
            <p className={`mt-2 text-xs ${done ? 'text-green-600' : 'text-amber-600'}`}>{message}</p>
          )}
          {!done && (
            <Button
              type="button"
              size="sm"
              className="mt-3 h-9 px-4 text-xs font-medium"
              onClick={handleEnablePush}
              disabled={loading}
            >
              {loading ? '설정 중...' : '푸시 알림 받기'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
