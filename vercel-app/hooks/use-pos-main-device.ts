'use client'

import * as React from 'react'
import { getPosPrinterSettings, registerPosMainDevice, clearPosMainDevice, registerPosDevice } from '@/lib/api-client'
import { buildPosClientHint } from '@/lib/pos-device-client-hint'

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
  /** 늦게 도착한 getPosPrinterSettings / 사용자 토글이 겹치면 낙관적 상태를 덮어쓰지 않도록 함 */
  const settingsFetchSeqRef = React.useRef(0)

  React.useEffect(() => {
    if (!storeCode || !deviceToken) {
      setServerMainTokens([])
      return
    }
    const seq = ++settingsFetchSeqRef.current
    let cancelled = false
    getPosPrinterSettings({ storeCode })
      .then((s) => {
        if (cancelled || seq !== settingsFetchSeqRef.current) return
        const list = Array.isArray(s?.mainDeviceTokens)
          ? s.mainDeviceTokens.map((x) => String(x || '').trim()).filter(Boolean)
          : []
        const legacy = s?.mainDeviceToken != null && String(s.mainDeviceToken).trim()
          ? [String(s.mainDeviceToken).trim()]
          : []
        setServerMainTokens(list.length > 0 ? list : legacy)
      })
      .catch(() => {
        if (!cancelled && seq === settingsFetchSeqRef.current) setServerMainTokens([])
      })
    return () => {
      cancelled = true
    }
  }, [storeCode, deviceToken])

  /**
   * 서버에 다른 메인 기기만 있고 아직 본인 토큰이 목록에 없을 때도, 사용자가 메인으로 켠 직후(local)는 반영해야 함.
   * (기존: server 목록 length>0 이면 localIsMain 무시 → 메인 버튼이 계속 주문으로 돌아가는 현상)
   */
  const isMain = React.useMemo(
    () => localIsMain || serverMainTokens.includes(deviceToken),
    [serverMainTokens, deviceToken, localIsMain]
  )

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
      settingsFetchSeqRef.current += 1
      const role = value ? 'main' : 'order'
      registerPosDevice({
        storeCode,
        deviceToken,
        role,
        clientHint: buildPosClientHint(),
      }).catch(() => {})
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
    const ping = () =>
      registerPosDevice({
        storeCode,
        deviceToken,
        role: isMain ? 'main' : 'order',
        clientHint: buildPosClientHint(),
      }).catch(() => {})
    ping()
    const interval = setInterval(ping, 120_000)
    return () => clearInterval(interval)
  }, [storeCode, deviceToken, isMain])

  return [isMain, setValue]
}
