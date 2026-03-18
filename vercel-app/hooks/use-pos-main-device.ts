'use client'

import * as React from 'react'
import { getPosPrinterSettings, registerPosMainDevice, clearPosMainDevice } from '@/lib/api-client'

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
      if (!storeCode || !deviceToken) {
        setLocalIsMain(value)
        try {
          localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
        } catch {
          // ignore
        }
        return
      }
      if (value) {
        registerPosMainDevice({ storeCode, deviceToken })
          .then(async (res) => {
            if (!res.success) return
            try {
              const s = await getPosPrinterSettings({ storeCode })
              if (s?.mainDeviceToken === deviceToken) {
                setServerMainToken(deviceToken)
                setLocalIsMain(true)
                try {
                  localStorage.setItem(STORAGE_KEY, '1')
                } catch {
                  // ignore
                }
              }
            } catch {
              // ignore
            }
          })
          .catch(() => {})
      } else {
        clearPosMainDevice({ storeCode, deviceToken })
          .then((res) => {
            if (res.success) {
              setServerMainToken(null)
              setLocalIsMain(false)
              try {
                localStorage.setItem(STORAGE_KEY, '0')
              } catch {
                // ignore
              }
            }
          })
          .catch(() => {})
      }
    },
    [storeCode, deviceToken]
  )

  return [isMain, setValue]
}
