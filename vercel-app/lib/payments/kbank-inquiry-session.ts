/**
 * Client-side KBank QR inquiry session guards (expiry + single loop per POS).
 */

import { KBANK_QR_SESSION_MAX_MS } from '@/lib/payments/kbank-api-reference'

const LOOP_KEY_PREFIX = 'cm_kbank_inq_loop:'

export type KbankInquiryLoopClaim = {
  tabId: string
  partnerTxnUid: string
  until: number
}

function storageKey(storeCode: string): string {
  return `${LOOP_KEY_PREFIX}${String(storeCode || '').trim()}`
}

export function createKbankInquiryTabId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* noop */
  }
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** True when QR waiting session exceeded bank/ops max (10 minutes). */
export function isKbankQrSessionExpired(
  sessionStartedAtMs: number | null | undefined,
  nowMs = Date.now(),
  maxMs = KBANK_QR_SESSION_MAX_MS
): boolean {
  const started = Number(sessionStartedAtMs || 0)
  if (!started || started <= 0) return false
  return nowMs - started >= maxMs
}

export function msUntilKbankQrSessionExpiry(
  sessionStartedAtMs: number | null | undefined,
  nowMs = Date.now(),
  maxMs = KBANK_QR_SESSION_MAX_MS
): number {
  const started = Number(sessionStartedAtMs || 0)
  if (!started || started <= 0) return maxMs
  return Math.max(0, maxMs - (nowMs - started))
}

/**
 * Claim exclusive inquiry loop for this POS (one active set of timers across tabs).
 * Heartbeat extends `until`. Returns false if another tab owns a different live loop.
 */
export function claimKbankInquiryLoop(
  storeCode: string,
  partnerTxnUid: string,
  tabId: string,
  ttlMs = 45_000
): boolean {
  if (typeof window === 'undefined') return true
  const key = storageKey(storeCode)
  const now = Date.now()
  const uid = String(partnerTxnUid || '').trim()
  if (!uid) return false
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) {
      const cur = JSON.parse(raw) as KbankInquiryLoopClaim
      if (
        cur &&
        cur.tabId &&
        cur.tabId !== tabId &&
        Number(cur.until || 0) > now &&
        String(cur.partnerTxnUid || '') === uid
      ) {
        // Same txn already polled by another tab — skip duplicate.
        return false
      }
      if (
        cur &&
        cur.tabId &&
        cur.tabId !== tabId &&
        Number(cur.until || 0) > now &&
        String(cur.partnerTxnUid || '') !== uid
      ) {
        // Another tab owns a different active QR — take over only after their heartbeat dies.
        return false
      }
    }
    const next: KbankInquiryLoopClaim = {
      tabId,
      partnerTxnUid: uid,
      until: now + Math.max(5_000, ttlMs),
    }
    window.localStorage.setItem(key, JSON.stringify(next))
    return true
  } catch {
    return true
  }
}

export function releaseKbankInquiryLoop(
  storeCode: string,
  tabId: string,
  partnerTxnUid?: string
): void {
  if (typeof window === 'undefined') return
  const key = storageKey(storeCode)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return
    const cur = JSON.parse(raw) as KbankInquiryLoopClaim
    if (cur.tabId !== tabId) return
    if (partnerTxnUid && String(cur.partnerTxnUid || '') !== String(partnerTxnUid)) return
    window.localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

/** True when the POS tab is in the foreground (SSR / missing document → true). */
export function isDocumentVisible(): boolean {
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}

/**
 * Auto-Inquiry 조건: 결제 QR이 화면에 있고 waiting 일 때만.
 * 패널을 닫거나(페이로드 없음) 백그라운드 탭이면 은행 Inquiry를 돌리지 않는다.
 */
export function shouldRunKbankAutoInquiry(opts: {
  callbackState: string
  liveQrPayload?: string | null
  documentVisible?: boolean
}): boolean {
  if (String(opts.callbackState || '').trim() !== 'waiting') return false
  if (!String(opts.liveQrPayload || '').trim()) return false
  if (opts.documentVisible === false) return false
  return true
}
