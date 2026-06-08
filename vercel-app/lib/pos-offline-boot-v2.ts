'use client'

import { isCmPosHybridShell } from '@/lib/cm-pos-shell'

const STORAGE_KEY = 'cm_pos_offline_boot_v2'

/** Vercel env: `NEXT_PUBLIC_CM_POS_OFFLINE_BOOT_V2=1` — 전 매장 v2 ON */
function envBootV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_CM_POS_OFFLINE_BOOT_V2 === '1'
}

function readStorageFlag(): '1' | '0' | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v === '1' || v === '0') return v
  } catch {
    /* private mode */
  }
  return null
}

/**
 * Phase A — 하이브리드 cold start·로그인 오프라인 진입 개선.
 * 기본 OFF. 파일럿: URL `?offlineBootV2=1` 또는 localStorage `cm_pos_offline_boot_v2=1`
 * 전 매장: Vercel `NEXT_PUBLIC_CM_POS_OFFLINE_BOOT_V2=1`
 */
export function isPosOfflineBootV2Enabled(): boolean {
  if (envBootV2Enabled()) return true
  const stored = readStorageFlag()
  if (stored === '1') return true
  if (stored === '0') return false
  return false
}

/** 로그인 URL ?offlineBootV2=1 — 해당 PC에 v2 플래그 저장(파일럿용) */
export function persistOfflineBootV2FromQuery(searchParams: URLSearchParams | null | undefined): void {
  if (typeof window === 'undefined') return
  if (searchParams?.get('offlineBootV2') !== '1') return
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function isHybridPosOfflineBootTarget(): boolean {
  return isCmPosHybridShell()
}
