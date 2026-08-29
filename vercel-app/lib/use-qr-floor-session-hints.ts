'use client'

import * as React from 'react'
import { qrTableStaffSessionsMap } from '@/lib/api-client/qr-table'
import {
  QR_FLOOR_SESSION_HINTS_DISABLED_POLL_MS,
  QR_FLOOR_SESSION_HINTS_ERROR_POLL_MS,
  QR_FLOOR_SESSION_HINTS_POLL_MS,
} from '@/lib/qr-table-poll-interval'
import { useVisiblePolling } from '@/lib/use-visible-polling'

export type QrFloorMarker = 'awaiting' | 'active' | 'call' | null

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
    void reload()
  }, [reload])

  const nextDelayMs = React.useCallback(() => {
    if (!lastOkRef.current) return QR_FLOOR_SESSION_HINTS_ERROR_POLL_MS
    if (enabledRef.current === false) return QR_FLOOR_SESSION_HINTS_DISABLED_POLL_MS
    return QR_FLOOR_SESSION_HINTS_POLL_MS
  }, [])

  useVisiblePolling(reload, nextDelayMs)

  const getMarker = React.useCallback(
    (_id: string, name: string): QrFloorMarker => {
      const key = String(name || '').trim().toLowerCase()
      return key ? byTable[key] || null : null
    },
    [byTable]
  )

  return { getQrSessionMarker: getMarker, reloadQrHints: reload }
}
