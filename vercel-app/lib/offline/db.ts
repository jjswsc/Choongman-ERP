/**
 * 오프라인 저장용 IndexedDB 초기화
 */

const DB_NAME = 'cm_offline'
const DB_VERSION = 1
const STORES = {
  PENDING_REQUESTS: 'pending_requests',
  POS_ORDER_LOCAL: 'pos_order_local',
} as const

let dbInstance: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported'))
  }
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      dbInstance = req.result
      resolve(dbInstance)
    }
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORES.PENDING_REQUESTS)) {
        const store = db.createObjectStore(STORES.PENDING_REQUESTS, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.POS_ORDER_LOCAL)) {
        const store = db.createObjectStore(STORES.POS_ORDER_LOCAL, { keyPath: 'localId' })
        store.createIndex('synced', 'synced', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
  })
}

export async function getDB(): Promise<IDBDatabase> {
  return openDB()
}

export { STORES }
