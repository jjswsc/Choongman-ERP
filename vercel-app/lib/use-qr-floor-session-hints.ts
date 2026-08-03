'use client'

import * as React from 'react'
import { qrTableStaffSessionsMap } from '@/lib/api-client/qr-table'

export type QrFloorMarker = 'awaiting' | 'active' | 'call' | null

/** QR 켠 매장 — 홀 배지 폴링 (5s는 Fluid CPU·요청 폭증) */
const QR_FLOOR_SESSION_HINTS_POLL_MS = 15_000
/** QR 꺼진 매장 — 설정 변경만 가끔 재확인 */
const QR_FLOOR_SESSION_HINTS_DISABLED_POLL_MS = 300_000
/** API 실패 시 백오프 (인증 실패·일시 장애에서 15s 폭주 방지) */
const QR_FLOOR_SESSION_HINTS_ERROR_POLL_MS = 60_000

export function useQrFloorSessionHints(storeCode: string | null | undefined) {
  const [byTable, setByTable] = React.useState<Record<string, QrFloorMarker>>({})
  const enabledRef = React.useRef<boolean | null>(null)
  const lastOkRef = React.useRef(false)

  const reload = React.useCallback(async () => {
    const code = String(storeCode || '').trim()
    if (!code) {
      setByTable({})
      enabledRef.current = false
      lastOkRef.current = true
      return
    }
    try {
      const res = await qrTableStaffSessionsMap(code)
      if (!res.success) {
        setByTable({})
        lastOkRef.current = false
        return
      }
      lastOkRef.current = true
      const enabled = res.enabled !== false
      enabledRef.current = enabled
      if (!enabled) {
        setByTable({})
        return
      }
      const next: Record<string, QrFloorMarker> = {}
      for (const s of res.sessions || []) {
        const key = String(s.tableName || '').trim().toLowerCase()
        if (!key) continue
        if (s.staffCallAt) next[key] = 'call'
        else if (s.status === 'active' && s.entryPaid) next[key] = 'active'
        else next[key] = 'awaiting'
      }
      setByTable(next)
    } catch {
      setByTable({})
      lastOkRef.current = false
    }
  }, [storeCode])

  React.useEffect(() => {
    enabledRef.current = null
    lastOkRef.current = false
    let cancelled = false
    let timeoutId = 0

    const nextDelayMs = () => {
      if (!lastOkRef.current) return QR_FLOOR_SESSION_HINTS_ERROR_POLL_MS
      if (enabledRef.current === false) return QR_FLOOR_SESSION_HINTS_DISABLED_POLL_MS
      return QR_FLOOR_SESSION_HINTS_POLL_MS
    }

    const scheduleNext = () => {
      if (cancelled) return
      timeoutId = window.setTimeout(() => {
        void (async () => {
          await reload()
          scheduleNext()
        })()
      }, nextDelayMs())
    }

    void (async () => {
      await reload()
      scheduleNext()
    })()

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [reload])

  const getMarker = React.useCallback(
    (_id: string, name: string): QrFloorMarker => {
      const key = String(name || '').trim().toLowerCase()
      return key ? byTable[key] || null : null
    },
    [byTable]
  )

  return { getQrSessionMarker: getMarker, reloadQrHints: reload }
}
