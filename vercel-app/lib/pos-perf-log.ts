'use client'

import type { PosPerfEntry } from '@/lib/pos-perf-summary'

const STORAGE_KEY = 'cm_pos_perf_log_v1'
const LOCAL_KEEP = 200
const FLUSH_COUNT = 30
const FLUSH_INTERVAL_MS = 3 * 60 * 1000
const BEACON_URL = '/api/pos/perf-beacon'

let buffer: PosPerfEntry[] = []
let storeCode = ''
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pagehideBound = false

function appendLocal(entry: PosPerfEntry) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as PosPerfEntry[]) : []
    list.push(entry)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-LOCAL_KEEP)))
  } catch {
    /* 저장소 꽉 참·프라이빗 모드 — 무시 */
  }
}

export function flushPosPerfLog(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (buffer.length === 0 || typeof navigator === 'undefined') return
  const body = JSON.stringify({ storeCode, entries: buffer })
  buffer = []
  try {
    const blob = new Blob([body], { type: 'application/json' })
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(BEACON_URL, blob)) return
    void fetch(BEACON_URL, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
      () => {}
    )
  } catch {
    /* 계측 실패가 POS 동작을 막으면 안 됨 */
  }
}

/** 클릭→버튼 해제 등 체감 지연 기록. 30건 또는 3분마다 서버 로그로 묶어 보낸다. */
export function recordPosPerf(action: string, ms: number, opts?: { storeCode?: string }): void {
  if (typeof window === 'undefined' || !Number.isFinite(ms) || ms < 0) return
  if (opts?.storeCode) storeCode = String(opts.storeCode).trim().slice(0, 40)
  const entry: PosPerfEntry = { a: action, ms: Math.round(ms), t: Date.now() }
  buffer.push(entry)
  appendLocal(entry)
  if (!pagehideBound) {
    pagehideBound = true
    window.addEventListener('pagehide', flushPosPerfLog)
  }
  if (buffer.length >= FLUSH_COUNT) {
    flushPosPerfLog()
    return
  }
  if (!flushTimer) flushTimer = setTimeout(flushPosPerfLog, FLUSH_INTERVAL_MS)
}

/** 기기에서 최근 기록 확인용 (DevTools: `JSON.parse(localStorage.cm_pos_perf_log_v1)`) */
export function readLocalPosPerfLog(): PosPerfEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PosPerfEntry[]) : []
  } catch {
    return []
  }
}
