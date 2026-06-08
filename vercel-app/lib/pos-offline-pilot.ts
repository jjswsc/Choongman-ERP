'use client'

import { OFFICE_STORES } from '@/lib/permissions'
import { normStoreKey } from '@/lib/store-list-keys'
import { isCmPosHybridShell } from '@/lib/cm-pos-shell'

/** @deprecated — Phase A PC 플래그 키 (하위 호환) */
const STORAGE_PHASE_A = 'cm_pos_offline_boot_v2'
const STORAGE_PHASE_B = 'cm_pos_offline_phase_b'

/**
 * Vercel — 파일럿 매장 목록(쉼표 구분). 미설정 시 Office 계열만.
 * 예: `Office,CM Office`
 */
function pilotStoreKeysFromEnv(): string[] {
  const raw = String(process.env.NEXT_PUBLIC_CM_POS_OFFLINE_PILOT_STORES ?? '').trim()
  if (raw) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return OFFICE_STORES.filter(Boolean)
}

/** 로그인·POS에서 이 매장이 오프라인 파일럿 대상인지 */
export function isPosOfflinePilotStore(storeCode: string | null | undefined): boolean {
  const probe = normStoreKey(String(storeCode ?? '').trim())
  if (!probe) return false
  return pilotStoreKeysFromEnv().some((s) => normStoreKey(s) === probe)
}

function readStorageFlag(key: string): '1' | '0' | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(key)
    if (v === '1' || v === '0') return v
  } catch {
    /* private mode */
  }
  return null
}

function envPhaseBEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CM_POS_OFFLINE_PHASE_B === '1'
}

function envPhaseAEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CM_POS_OFFLINE_BOOT_V2 === '1'
}

/** 이 PC에 Phase B 파일럿 URL/Electron이 켜 둔 플래그 */
export function isPosOfflinePhaseBEnabledOnPc(): boolean {
  return readStorageFlag(STORAGE_PHASE_B) === '1'
}

/** 매장 기준 Phase B (SQLite·로컬 DB 파일럿 — 기능은 단계적으로 연결) */
export function isPosOfflinePhaseBEnabledForStore(storeCode: string | null | undefined): boolean {
  const store = String(storeCode ?? '').trim()
  if (!store || !isPosOfflinePilotStore(store)) return false
  return envPhaseBEnabled() || isPosOfflinePhaseBEnabledOnPc()
}

/**
 * Phase B 활성 — 로그인 전(PC 부팅) 또는 로그인 후(매장) 판정.
 * B는 A(콜드스타트·오프라인 진입)를 포함.
 */
export function isPosOfflinePhaseBEnabled(storeCode?: string | null): boolean {
  const store = String(storeCode ?? '').trim()
  if (store) return isPosOfflinePhaseBEnabledForStore(store)
  return isPosOfflinePhaseBEnabledOnPc()
}

/**
 * Phase A — 하이브리드 cold start·로그인 오프라인 진입.
 * Phase B가 켜져 있으면 별도 Phase A 세팅 없이 자동 포함.
 */
export function isPosOfflinePhaseAEnabled(storeCode?: string | null): boolean {
  if (isPosOfflinePhaseBEnabled(storeCode)) return true
  if (envPhaseAEnabled()) return true
  if (readStorageFlag(STORAGE_PHASE_A) === '1') return true
  if (readStorageFlag(STORAGE_PHASE_A) === '0') return false
  return false
}

/** @deprecated — `isPosOfflinePhaseAEnabled` 사용 */
export function isPosOfflineBootV2Enabled(): boolean {
  return isPosOfflinePhaseAEnabled()
}

/** 로그인 URL 쿼리 → localStorage (Office PC 1회 설정) */
export function persistOfflinePilotFromQuery(searchParams: URLSearchParams | null | undefined): void {
  if (typeof window === 'undefined' || !searchParams) return
  try {
    if (searchParams.get('offlinePhaseB') === '1') {
      window.localStorage.setItem(STORAGE_PHASE_B, '1')
      window.localStorage.setItem(STORAGE_PHASE_A, '1')
    }
    if (searchParams.get('offlineBootV2') === '1') {
      window.localStorage.setItem(STORAGE_PHASE_A, '1')
    }
    if (searchParams.get('offlinePilot') === '0' || searchParams.get('offlinePhaseB') === '0') {
      window.localStorage.setItem(STORAGE_PHASE_B, '0')
    }
  } catch {
    /* ignore */
  }
}

/** @deprecated */
export function persistOfflineBootV2FromQuery(searchParams: URLSearchParams | null | undefined): void {
  persistOfflinePilotFromQuery(searchParams)
}

export function isHybridPosOfflineBootTarget(): boolean {
  return isCmPosHybridShell()
}

/** POS 설정·디버그용 */
export function getPosOfflinePilotSnapshot(storeCode?: string | null): {
  pilotStore: boolean
  phaseA: boolean
  phaseB: boolean
  pcPhaseB: boolean
} {
  const store = String(storeCode ?? '').trim()
  return {
    pilotStore: store ? isPosOfflinePilotStore(store) : false,
    phaseA: isPosOfflinePhaseAEnabled(store || null),
    phaseB: isPosOfflinePhaseBEnabled(store || null),
    pcPhaseB: isPosOfflinePhaseBEnabledOnPc(),
  }
}
