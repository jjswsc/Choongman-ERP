/**
 * 오프라인 요청 큐 - 추가/조회/삭제
 */

import { getDB, STORES } from './db'

/** `sync.ts`와 동일 — 이 횟수 이상 실패 시 더 이상 자동 전송하지 않음 */
export const OFFLINE_QUEUE_MAX_RETRIES = 8

export interface PendingRequest {
  id: string
  api: string
  method: string
  body?: string
  headers?: Record<string, string>
  createdAt: number
  retryCount: number
  lastTriedAt?: number
  lastError?: string
  metadata?: { localOrderNo?: string }
}

function uuid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export async function addToQueue(req: Omit<PendingRequest, 'id' | 'createdAt' | 'retryCount'>): Promise<string> {
  const db = await getDB()
  const id = uuid()
  const item: PendingRequest = {
    id,
    ...req,
    createdAt: Date.now(),
    retryCount: 0,
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_REQUESTS, 'readwrite')
    const store = tx.objectStore(STORES.PENDING_REQUESTS)
    const r = store.put(item)
    r.onerror = () => reject(r.error)
    r.onsuccess = () => resolve(id)
  })
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_REQUESTS, 'readonly')
    const store = tx.objectStore(STORES.PENDING_REQUESTS)
    const req = store.count()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  })
}

/** 배너·동기화용: 아직 전송 재시도 가능한 건 / 한도 초과로 스킵되는 건 */
export async function getOfflineQueueCounts(): Promise<{ retriable: number; dead: number }> {
  const all = await getAllPending()
  let retriable = 0
  let dead = 0
  for (const item of all) {
    if (item.retryCount >= OFFLINE_QUEUE_MAX_RETRIES) dead += 1
    else retriable += 1
  }
  return { retriable, dead }
}

/** 배너 표시용: 재시도 가능한 건 중 가장 최근 실패 메시지(서버/HTTP 원인) */
export async function getOfflineQueueErrorHint(): Promise<string | null> {
  const all = await getAllPending()
  const retriable = all.filter((i) => i.retryCount < OFFLINE_QUEUE_MAX_RETRIES)
  const withErr = retriable
    .filter((i) => (i.lastError ?? '').trim().length > 0)
    .sort(
      (a, b) =>
        (b.lastTriedAt ?? b.createdAt) - (a.lastTriedAt ?? a.createdAt)
    )
  const msg = withErr[0]?.lastError?.trim()
  return msg || null
}

/** 재시도 한도 초과 항목만 로컬 큐에서 제거 (서버 미반영 데이터는 복구되지 않음) */
export async function removeDeadLetterFromQueue(): Promise<number> {
  const all = await getAllPending()
  let removed = 0
  for (const item of all) {
    if (item.retryCount >= OFFLINE_QUEUE_MAX_RETRIES) {
      await removeFromQueue(item.id)
      removed += 1
    }
  }
  return removed
}

export async function getAllPending(): Promise<PendingRequest[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_REQUESTS, 'readonly')
    const store = tx.objectStore(STORES.PENDING_REQUESTS)
    const index = store.index('createdAt')
    const req = index.getAll()
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result || [])
  })
}

export async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_REQUESTS, 'readwrite')
    const store = tx.objectStore(STORES.PENDING_REQUESTS)
    const r = store.delete(id)
    r.onerror = () => reject(r.error)
    r.onsuccess = () => resolve()
  })
}

export async function updateQueueItem(id: string, updates: Partial<PendingRequest>): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_REQUESTS, 'readwrite')
    const store = tx.objectStore(STORES.PENDING_REQUESTS)
    const getReq = store.get(id)
    getReq.onerror = () => reject(getReq.error)
    getReq.onsuccess = () => {
      const item = getReq.result
      if (!item) {
        resolve()
        return
      }
      const updated = { ...item, ...updates }
      const putReq = store.put(updated)
      putReq.onerror = () => reject(putReq.error)
      putReq.onsuccess = () => resolve()
    }
  })
}
