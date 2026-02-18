/**
 * 오프라인 요청 큐 - 추가/조회/삭제
 */

import { getDB, STORES } from './db'

export interface PendingRequest {
  id: string
  api: string
  method: string
  body?: string
  headers?: Record<string, string>
  createdAt: number
  retryCount: number
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
