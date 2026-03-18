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
  const [serverMainToken, setServerMainToken] = React.useState<string | null>(null)
  const [deviceToken] = React.useState(() => getOrCreateDeviceToken())

  React.useEffect(() => {
    if (!storeCode || !deviceToken) {
      setServerMainToken(null)
      return
    }
    let cancelled = false
    getPosPrinterSettings({ storeCode })
      .then((s) => {
        if (!cancelled && s?.mainDeviceToken != null && s.mainDeviceToken.trim()) {
          setServerMainToken(s.mainDeviceToken.trim())
        } else {
          setServerMainToken(null)
        }
      })
      .catch(() => {
        if (!cancelled) setServerMainToken(null)
      })
    return () => {
      cancelled = true
    }
  }, [storeCode, deviceToken])

  const isMain = React.useMemo(() => {
    if (serverMainToken != null) return deviceToken === serverMainToken
    return localIsMain
  }, [serverMainToken, deviceToken, localIsMain])

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
        setServerMainToken(deviceToken)
        registerPosMainDevice({ storeCode, deviceToken })
          .then(async (res) => {
            if (!res.success) {
              setServerMainToken(null)
              applyLocal(false)
              return
            }
            try {
              const s = await getPosPrinterSettings({ storeCode })
              if (s?.mainDeviceToken === deviceToken) {
                setServerMainToken(deviceToken)
              }
            } catch {
              // keep optimistic state
            }
          })
          .catch(() => {
            setServerMainToken(null)
            applyLocal(false)
          })
      } else {
        applyLocal(false)
        setServerMainToken(null)
        clearPosMainDevice({ storeCode, deviceToken })
          .then((res) => {
            if (!res.success) {
              setServerMainToken(deviceToken)
              applyLocal(true)
            }
          })
          .catch(() => {
            setServerMainToken(deviceToken)
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
