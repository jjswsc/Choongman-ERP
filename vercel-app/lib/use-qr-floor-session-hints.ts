'use client'

import * as React from 'react'
import { qrTableStaffSessionsMap } from '@/lib/api-client/qr-table'

export type QrFloorMarker = 'awaiting' | 'active' | 'call' | null

/** Poll QR sessions for POS floor badges. Safe if schema missing (returns empty). */
const QR_FLOOR_SESSION_HINTS_POLL_MS = 5_000

export function useQrFloorSessionHints(storeCode: string | null | undefined) {
  const [byTable, setByTable] = React.useState<Record<string, QrFloorMarker>>({})

  const reload = React.useCallback(async () => {
    const code = String(storeCode || '').trim()
    if (!code) {
      setByTable({})
      return
    }
    try {
      const res = await qrTableStaffSessionsMap(code)
      if (!res.success) {
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
    }
  }, [storeCode])

  React.useEffect(() => {
    void reload()
    const id = window.setInterval(() => void reload(), QR_FLOOR_SESSION_HINTS_POLL_MS)
    return () => window.clearInterval(id)
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
