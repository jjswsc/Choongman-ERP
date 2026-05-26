/**
 * 오프라인 저장용 IndexedDB 초기화
 */

const DB_NAME = 'cm_offline'
const DB_VERSION = 4
const OPEN_DB_TIMEOUT_MS = 4_000
const STORES = {
  PENDING_REQUESTS: 'pending_requests',
  POS_ORDER_LOCAL: 'pos_order_local',
  /** 주문/영수증 캐시 (getPosOrders 응답, 최대 ~30일) */
  POS_ORDERS_CACHE: 'pos_orders_cache',
  /** 매출 요약 캐시 (getPosTodaySales 등, 최대 ~30일) */
  POS_SALES_CACHE: 'pos_sales_cache',
  /** 시재 입출금 캐시 (로컬 입력 이력, 최대 ~30일) */
  POS_CASH_CACHE: 'pos_cash_cache',
  /** ERP 핵심 데이터 캐시 (매장/직원/거래처/점검항목 - 오프라인 시 사용) */
  ERP_CACHE: 'erp_cache',
  /** 하이브리드 POS 메뉴 썸네일 바이너리 (SW/HTTP 캐시 초기화 후에도 표시용) */
  POS_MENU_IMAGES: 'pos_menu_images',
} as const

let dbInstance: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported'))
  }
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    let settled = false
    const finish = (done: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      done()
    }
    const timeoutId = setTimeout(() => {
      finish(() => reject(new Error('IndexedDB open timed out')))
    }, OPEN_DB_TIMEOUT_MS)
    req.onerror = () => finish(() => reject(req.error ?? new Error('IndexedDB open failed')))
    req.onblocked = () => finish(() => reject(new Error('IndexedDB open blocked')))
    req.onsuccess = () => {
      finish(() => {
        dbInstance = req.result
        dbInstance.onversionchange = () => {
          if (dbInstance === req.result) dbInstance = null
          req.result.close()
        }
        resolve(dbInstance)
      })
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
      if (!db.objectStoreNames.contains(STORES.POS_ORDERS_CACHE)) {
        const store = db.createObjectStore(STORES.POS_ORDERS_CACHE, { keyPath: 'cacheKey' })
        store.createIndex('cachedAt', 'cachedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.POS_SALES_CACHE)) {
        const store = db.createObjectStore(STORES.POS_SALES_CACHE, { keyPath: 'cacheKey' })
        store.createIndex('cachedAt', 'cachedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.POS_CASH_CACHE)) {
        const store = db.createObjectStore(STORES.POS_CASH_CACHE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.ERP_CACHE)) {
        const store = db.createObjectStore(STORES.ERP_CACHE, { keyPath: 'cacheKey' })
        store.createIndex('cachedAt', 'cachedAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORES.POS_MENU_IMAGES)) {
        db.createObjectStore(STORES.POS_MENU_IMAGES, { keyPath: 'key' })
      }
    }
  })
}

export async function getDB(): Promise<IDBDatabase> {
  return openDB()
}

export { STORES }
