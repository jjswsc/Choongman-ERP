'use client'

import * as React from 'react'
import { getPosPrinterSettings, registerPosMainDevice, clearPosMainDevice, registerPosDevice } from '@/lib/api-client'
import { buildPosClientHint } from '@/lib/pos-device-client-hint'
import { DEFAULT_POS_DEVICE_ROLE_LIMITS } from '@/lib/pos-device-role-limits'
import { getOrCreatePosDeviceToken } from '@/lib/pos-device-token-storage'
import { appAlert } from '@/lib/app-message'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'

const STORAGE_KEY = 'pos_main_device'
/** POS 기기 heartbeat — Edge Request 절감. 슬롯 제한(7일)과 무관, last_seen_at 갱신용 */
const POS_DEVICE_HEARTBEAT_MS = 600_000
/** 아침 부팅 직후 네트워크 미준비 등으로 설정 조회가 실패하면 메인이 주문으로 고착되지 않도록 재시도 */
const SETTINGS_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const

type RoleSettingsPayload = {
  mainDeviceTokens: unknown[]
  mainDeviceToken?: unknown
  mainDeviceRoleLocked: boolean
  mainDeviceMaxCount?: unknown
  orderDeviceMaxCount?: unknown
}

/** 오프라인 최소 폴백(역할 필드 없음)은 서버 판정으로 쓰지 않는다 */
function isRoleSettingsPayload(s: unknown): s is RoleSettingsPayload {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  return Array.isArray(o.mainDeviceTokens) && typeof o.mainDeviceRoleLocked === 'boolean'
}

function mainTokensFromSettings(s: RoleSettingsPayload): string[] {
  const list = s.mainDeviceTokens.map((x) => String(x || '').trim()).filter(Boolean)
  if (list.length > 0) return list
  const legacy = s.mainDeviceToken != null ? String(s.mainDeviceToken).trim() : ''
  return legacy ? [legacy] : []
}

export type PosMainDeviceMeta = {
  roleLocked: boolean
  mainDeviceMaxCount: number
  orderDeviceMaxCount: number
  /** 매장에 메인 POS 토큰이 1대 이상 등록됨 — 주문 단말 배달 팝업 억제 판단용 */
  hasMainDevice: boolean
}

/** localStorage 미설정: 서버 목록과 병합. '0'/'false': 사용자가 주문 단말로 명시 → 서버에 토큰이 남아 있어도 메인 UI로 두지 않음 */
function getLocalMainExplicit(): 'main' | 'order' | 'unset' {
  if (typeof window === 'undefined') return 'unset'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '1' || v === 'true') return 'main'
    if (v === '0' || v === 'false') return 'order'
    return 'unset'
  } catch {
    return 'unset'
  }
}

function sanitizeMainTokensForExplicitOrder(tokens: string[], deviceToken: string): string[] {
  if (getLocalMainExplicit() !== 'order') return tokens
  return tokens.filter((t) => t !== deviceToken)
}

export function usePosMainDevice(
  storeCode: string | null
): [boolean, (value: boolean) => void, PosMainDeviceMeta] {
  const { lang } = useLang()
  const t = useT(lang)
  const [localIsMain, setLocalIsMain] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return getLocalMainExplicit() === 'main'
  })
  const [serverMainTokens, setServerMainTokens] = React.useState<string[]>([])
  const [roleLocked, setRoleLocked] = React.useState(DEFAULT_POS_DEVICE_ROLE_LIMITS.mainDeviceRoleLocked)
  const [mainDeviceMaxCount, setMainDeviceMaxCount] = React.useState(
    DEFAULT_POS_DEVICE_ROLE_LIMITS.mainDeviceMaxCount
  )
  const [orderDeviceMaxCount, setOrderDeviceMaxCount] = React.useState(
    DEFAULT_POS_DEVICE_ROLE_LIMITS.orderDeviceMaxCount
  )
  const [deviceToken] = React.useState(() => getOrCreatePosDeviceToken())
  /** 늦게 도착한 getPosPrinterSettings / heartbeat 응답 / 사용자 토글이 겹치면 낙관적 상태를 덮어쓰지 않도록 함 */
  const settingsFetchSeqRef = React.useRef(0)
  /** 현장 메인/주문 토글 직전에 보낸 heartbeat 응답은 무시 */
  const roleToggleSeqRef = React.useRef(0)
  /** 서버 역할 설정을 한 번이라도 정상 수신했는지 — 그 전 heartbeat는 `keep`으로 보낸다 */
  const [settingsLoaded, setSettingsLoaded] = React.useState(false)

  React.useEffect(() => {
    setSettingsLoaded(false)
    if (!storeCode || !deviceToken) {
      setServerMainTokens([])
      return
    }
    let cancelled = false
    let loaded = false
    let attempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRetry = () => {
      if (cancelled || loaded || retryTimer) return
      const delay = SETTINGS_RETRY_DELAYS_MS[Math.min(attempt, SETTINGS_RETRY_DELAYS_MS.length - 1)]
      attempt += 1
      retryTimer = setTimeout(() => {
        retryTimer = null
        load()
      }, delay)
    }

    const load = () => {
      if (cancelled || loaded) return
      const seq = ++settingsFetchSeqRef.current
      getPosPrinterSettings({ storeCode })
        .then((s) => {
          if (cancelled) return
          if (!isRoleSettingsPayload(s)) {
            scheduleRetry()
            return
          }
          loaded = true
          if (seq === settingsFetchSeqRef.current) {
            setServerMainTokens(sanitizeMainTokensForExplicitOrder(mainTokensFromSettings(s), deviceToken))
          }
          const locked = s.mainDeviceRoleLocked === true
          setRoleLocked(locked)
          if (locked) {
            try {
              localStorage.removeItem(STORAGE_KEY)
            } catch {
              /* ignore */
            }
            setLocalIsMain(false)
          }
          setMainDeviceMaxCount(
            typeof s.mainDeviceMaxCount === 'number' && s.mainDeviceMaxCount > 0
              ? s.mainDeviceMaxCount
              : DEFAULT_POS_DEVICE_ROLE_LIMITS.mainDeviceMaxCount
          )
          setOrderDeviceMaxCount(
            typeof s.orderDeviceMaxCount === 'number' && s.orderDeviceMaxCount > 0
              ? s.orderDeviceMaxCount
              : DEFAULT_POS_DEVICE_ROLE_LIMITS.orderDeviceMaxCount
          )
          setSettingsLoaded(true)
        })
        .catch(() => {
          scheduleRetry()
        })
    }

    const onOnline = () => {
      if (cancelled || loaded) return
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      load()
    }

    load()
    window.addEventListener('online', onOnline)
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener('online', onOnline)
    }
  }, [storeCode, deviceToken])

  /**
   * 잠금 ON: 서버에 지정된 메인 토큰만 메인.
   * 잠금 OFF: 기존 localStorage + 서버 병합.
   */
  const isMain = React.useMemo(() => {
    if (roleLocked) return serverMainTokens.includes(deviceToken)
    const mode = getLocalMainExplicit()
    if (mode === 'order') return false
    if (mode === 'main') return true
    return serverMainTokens.includes(deviceToken)
  }, [serverMainTokens, deviceToken, localIsMain, roleLocked])

  const setValue = React.useCallback(
    (value: boolean) => {
      if (roleLocked) return
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
      roleToggleSeqRef.current += 1
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
              const msg =
                res.code === 'MAIN_LIMIT'
                  ? (t('posDeviceRoleMainLimitApi') || '').replace(
                      '{{n}}',
                      String(mainDeviceMaxCount)
                    )
                  : localizeApiMessage(
                      res.message,
                      t,
                      t('posDeviceRoleLockedApi'),
                      lang
                    )
              if (msg) void appAlert(msg)
              return
            }
            try {
              const s = await getPosPrinterSettings({ storeCode })
              if (isRoleSettingsPayload(s)) {
                setServerMainTokens(sanitizeMainTokensForExplicitOrder(mainTokensFromSettings(s), deviceToken))
              }
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
              if (isRoleSettingsPayload(s)) {
                setServerMainTokens(sanitizeMainTokensForExplicitOrder(mainTokensFromSettings(s), deviceToken))
              }
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
    [storeCode, deviceToken, roleLocked, mainDeviceMaxCount, t, lang]
  )

  const heartbeatRole: 'main' | 'order' | 'keep' = settingsLoaded ? (isMain ? 'main' : 'order') : 'keep'

  // 접속 기기 목록에 등록·하트비트 (last_seen_at 갱신). 잠금 ON이면 서버가 DB 역할을 고정함.
  // 응답의 role(서버 확정값)로 이 기기 메인 여부를 맞춘다 — 설정 조회가 실패·지연돼도 메인이 주문으로 고착되지 않게.
  React.useEffect(() => {
    if (!storeCode || !deviceToken) return
    let cancelled = false
    const ping = () => {
      const seq = roleToggleSeqRef.current
      registerPosDevice({
        storeCode,
        deviceToken,
        role: heartbeatRole,
        clientHint: buildPosClientHint(),
      })
        .then((res) => {
          if (cancelled || seq !== roleToggleSeqRef.current) return
          if (!res?.success || (res.role !== 'main' && res.role !== 'order')) return
          const serverIsMain = res.role === 'main'
          setServerMainTokens((prev) => {
            const has = prev.includes(deviceToken)
            if (serverIsMain === has) return prev
            return serverIsMain ? [...prev, deviceToken] : prev.filter((x) => x !== deviceToken)
          })
        })
        .catch(() => {})
    }
    ping()
    const interval = setInterval(ping, POS_DEVICE_HEARTBEAT_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [storeCode, deviceToken, heartbeatRole])

  const meta = React.useMemo(
    () => ({
      roleLocked,
      mainDeviceMaxCount,
      orderDeviceMaxCount,
      hasMainDevice: isMain || serverMainTokens.length > 0,
    }),
    [roleLocked, mainDeviceMaxCount, orderDeviceMaxCount, isMain, serverMainTokens]
  )

  return [isMain, setValue, meta]
}
