'use client'

import * as React from 'react'
import { getPosPrinterSettings, registerPosMainDevice, clearPosMainDevice, registerPosDevice } from '@/lib/api-client'

const STORAGE_KEY = 'pos_main_device'
const DEVICE_TOKEN_KEY = 'pos_device_token'

function getOrCreateDeviceToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    let token = localStorage.getItem(DEVICE_TOKEN_KEY)
    if (!token || token.length < 10) {
      token = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
      localStorage.setItem(DEVICE_TOKEN_KEY, token)
    }
    return token
  } catch {
    return ''
  }
}

export function usePosMainDevice(storeCode: string | null): [boolean, (value: boolean) => void] {
  const [localIsMain, setLocalIsMain] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      return v === '1' || v === 'true'
    } catch {
      return false
    }
  })
  const [serverMainTokens, setServerMainTokens] = React.useState<string[]>([])
  const [deviceToken] = React.useState(() => getOrCreateDeviceToken())

  React.useEffect(() => {
    if (!storeCode || !deviceToken) {
      setServerMainTokens([])
      return
    }
    let cancelled = false
    getPosPrinterSettings({ storeCode })
      .then((s) => {
        if (cancelled) return
        const list = Array.isArray(s?.mainDeviceTokens)
          ? s.mainDeviceTokens.map((x) => String(x || '').trim()).filter(Boolean)
          : []
        const legacy = s?.mainDeviceToken != null && String(s.mainDeviceToken).trim()
          ? [String(s.mainDeviceToken).trim()]
          : []
        setServerMainTokens(list.length > 0 ? list : legacy)
      })
      .catch(() => {
        if (!cancelled) setServerMainTokens([])
      })
    return () => {
      cancelled = true
    }
  }, [storeCode, deviceToken])

  const isMain = React.useMemo(() => {
    if (serverMainTokens.length > 0) return serverMainTokens.includes(deviceToken)
    return localIsMain
  }, [serverMainTokens, deviceToken, localIsMain])

  const setValue = React.useCallback(
    (value: boolean) => {
      const applyLocal = (v: boolean) => {
        setLocalIsMain(v)
        try {
          localStorage.setItem(STORAGE_KEY, v ? '1' : '0')
        } catch {
          // ignore
        }
      }
      if (!storeCode || !deviceToken) {
        applyLocal(value)
        return
      }
      const role = value ? 'main' : 'order'
      registerPosDevice({ storeCode, deviceToken, role }).catch(() => {})
      if (value) {
        applyLocal(true)
        setServerMainTokens((prev) => (prev.includes(deviceToken) ? prev : [...prev, deviceToken]))
        registerPosMainDevice({ storeCode, deviceToken })
          .then(async (res) => {
            if (!res.success) {
              setServerMainTokens([])
              applyLocal(false)
              return
            }
            try {
              const s = await getPosPrinterSettings({ storeCode })
              const list = Array.isArray(s?.mainDeviceTokens)
                ? s.mainDeviceTokens.map((x) => String(x || '').trim()).filter(Boolean)
                : []
              const legacy = s?.mainDeviceToken != null && String(s.mainDeviceToken).trim()
                ? [String(s.mainDeviceToken).trim()]
                : []
              setServerMainTokens(list.length > 0 ? list : legacy)
            } catch {
              // keep optimistic state
            }
          })
          .catch(() => {
            setServerMainTokens([])
            applyLocal(false)
          })
      } else {
        applyLocal(false)
        setServerMainTokens((prev) => prev.filter((t) => t !== deviceToken))
        clearPosMainDevice({ storeCode, deviceToken })
          .then(async (res) => {
            if (!res.success) {
              setServerMainTokens((prev) => (prev.includes(deviceToken) ? prev : [...prev, deviceToken]))
              applyLocal(true)
              return
            }
            try {
              const s = await getPosPrinterSettings({ storeCode })
              const list = Array.isArray(s?.mainDeviceTokens)
                ? s.mainDeviceTokens.map((x) => String(x || '').trim()).filter(Boolean)
                : []
              const legacy = s?.mainDeviceToken != null && String(s.mainDeviceToken).trim()
                ? [String(s.mainDeviceToken).trim()]
                : []
              setServerMainTokens(list.length > 0 ? list : legacy)
            } catch {
              /* ignore */
            }
          })
          .catch(() => {
            setServerMainTokens((prev) => (prev.includes(deviceToken) ? prev : [...prev, deviceToken]))
            applyLocal(true)
          })
      }
    },
    [storeCode, deviceToken]
  )

  // 접속 기기 목록에 등록·하트비트 (last_seen_at 갱신)
  React.useEffect(() => {
    if (!storeCode || !deviceToken) return
    registerPosDevice({ storeCode, deviceToken, role: isMain ? 'main' : 'order' }).catch(() => {})
    const interval = setInterval(
      () => registerPosDevice({ storeCode, deviceToken, role: isMain ? 'main' : 'order' }).catch(() => {}),
      120_000
    )
    return () => clearInterval(interval)
  }, [storeCode, deviceToken, isMain])

  return [isMain, setValue]
}
