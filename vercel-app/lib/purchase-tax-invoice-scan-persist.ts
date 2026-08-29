const ACTIVE_KEY = 'cm_pti_scan_active'
const DB_NAME = 'cm-pti-scan'
const STORE = 'source-files'
const RECORD_KEY = 'current'
const MAX_STORE_BYTES = 80 * 1024 * 1024

export function markPurchaseTaxScanSession(active: boolean): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (active) sessionStorage.setItem(ACTIVE_KEY, '1')
    else sessionStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* ignore */
  }
}

export function isPurchaseTaxScanSessionActive(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(ACTIVE_KEY) === '1'
  } catch {
    return false
  }
}

export function documentWasDiscarded(): boolean {
  if (typeof document === 'undefined') return false
  return (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true
}

export function shouldAutoResumePurchaseTaxScan(opts: {
  sessionActive: boolean
  wasDiscarded?: boolean
  hasStoredFiles: boolean
  hasCheckpoint: boolean
}): boolean {
  if (!opts.hasStoredFiles || !opts.hasCheckpoint) return false
  return opts.sessionActive || opts.wasDiscarded === true
}

export function isPurchaseTaxScanAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  )
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('idb_open_failed'))
  })
}

export async function persistPurchaseTaxScanStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* ignore */
  }
}

export async function savePurchaseTaxScanFiles(files: File[]): Promise<void> {
  if (typeof indexedDB === 'undefined' || !files.length) return
  const bytes = files.reduce((n, f) => n + (f.size || 0), 0)
  if (bytes <= 0 || bytes > MAX_STORE_BYTES) return
  const db = await openDb()
  try {
    const payload = {
      files: files.map((f) => ({
        name: f.name,
        type: f.type,
        lastModified: f.lastModified,
        blob: f,
      })),
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('idb_put_failed'))
      tx.objectStore(STORE).put(payload, RECORD_KEY)
    })
  } finally {
    db.close()
  }
}

export async function loadPurchaseTaxScanFiles(): Promise<File[]> {
  if (typeof indexedDB === 'undefined') return []
  const db = await openDb()
  try {
    const payload = await new Promise<{ files?: Array<{ name: string; type: string; lastModified: number; blob: Blob }> } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(RECORD_KEY)
        req.onsuccess = () => resolve(req.result as { files?: Array<{ name: string; type: string; lastModified: number; blob: Blob }> })
        req.onerror = () => reject(req.error || new Error('idb_get_failed'))
      }
    )
    return (payload?.files || []).map(
      (f) => new File([f.blob], f.name, { type: f.type, lastModified: f.lastModified })
    )
  } catch {
    return []
  } finally {
    db.close()
  }
}

export async function clearPurchaseTaxScanFiles(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDb()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('idb_clear_failed'))
        tx.objectStore(STORE).delete(RECORD_KEY)
      })
    } finally {
      db.close()
    }
  } catch {
    /* ignore */
  }
}
