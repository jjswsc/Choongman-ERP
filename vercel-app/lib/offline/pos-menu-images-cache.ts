/**
 * 하이브리드 POS: 메뉴 썸네일을 IndexedDB에 보관 (Electron 캐시 초기화는 cachestorage·HTTP만 비움)
 */

import {
  isPosMenuImageUrlCacheable,
  normalizePosMenuImageUrl,
  shouldProxyPosMenuImageForHybrid,
  toHybridProxiedMenuImageHref,
} from '@/lib/pos-menu-image-url'
import { getDB, STORES } from '@/lib/offline/db'

const MENU_IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_BYTES_PER_IMAGE = 3 * 1024 * 1024

export type MenuImageCacheRow = {
  key: string
  body: ArrayBuffer
  mime: string
  cachedAt: number
}

export async function hasMenuImageCache(normalizedUrl: string): Promise<boolean> {
  const db = await getDB()
  if (!db.objectStoreNames.contains(STORES.POS_MENU_IMAGES)) return false
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.POS_MENU_IMAGES, 'readonly')
    const req = tx.objectStore(STORES.POS_MENU_IMAGES).get(normalizedUrl)
    req.onsuccess = () => {
      const row = req.result as MenuImageCacheRow | undefined
      if (!row?.body) {
        resolve(false)
        return
      }
      if (Date.now() - row.cachedAt > MENU_IMAGE_TTL_MS) {
        resolve(false)
        return
      }
      resolve(true)
    }
    req.onerror = () => resolve(false)
  })
}

/** 캐시 히트 시 새 blob: URL — 호출측에서 revoke 필요 */
export async function getMenuImageBlobObjectUrl(normalizedUrl: string): Promise<string | null> {
  const db = await getDB()
  if (!db.objectStoreNames.contains(STORES.POS_MENU_IMAGES)) return null
  return new Promise((resolve) => {
    const tx = db.transaction(STORES.POS_MENU_IMAGES, 'readonly')
    const req = tx.objectStore(STORES.POS_MENU_IMAGES).get(normalizedUrl)
    req.onsuccess = () => {
      const row = req.result as MenuImageCacheRow | undefined
      if (!row?.body) {
        resolve(null)
        return
      }
      if (Date.now() - row.cachedAt > MENU_IMAGE_TTL_MS) {
        const delTx = db.transaction(STORES.POS_MENU_IMAGES, 'readwrite')
        delTx.objectStore(STORES.POS_MENU_IMAGES).delete(normalizedUrl)
        resolve(null)
        return
      }
      const blob = new Blob([row.body], { type: row.mime || 'image/jpeg' })
      resolve(URL.createObjectURL(blob))
    }
    req.onerror = () => resolve(null)
  })
}

export async function putMenuImageCache(normalizedUrl: string, body: ArrayBuffer, mime: string): Promise<void> {
  if (body.byteLength > MAX_BYTES_PER_IMAGE) return
  const db = await getDB()
  if (!db.objectStoreNames.contains(STORES.POS_MENU_IMAGES)) return
  const row: MenuImageCacheRow = {
    key: normalizedUrl,
    body,
    mime: mime || 'image/jpeg',
    cachedAt: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.POS_MENU_IMAGES, 'readwrite')
    tx.objectStore(STORES.POS_MENU_IMAGES).put(row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function buildMenuImageFetchUrl(normalizedUrl: string): string {
  if (typeof window === 'undefined') return normalizedUrl
  /** Supabase 직접 fetch는 CORS·Serwist와 충돌해 Network에서 fetch+ERR_FAILED/(canceled)가 난다. 동일 출처 프록시로만 받는다. */
  if (shouldProxyPosMenuImageForHybrid(normalizedUrl)) {
    return `${window.location.origin}${toHybridProxiedMenuImageHref(normalizedUrl)}`
  }
  return normalizedUrl
}

export async function fetchAndCacheMenuImage(normalizedUrl: string): Promise<boolean> {
  if (typeof window === 'undefined') return false
  const origin = window.location.origin
  if (!isPosMenuImageUrlCacheable(normalizedUrl, origin)) return false
  try {
    const fetchUrl = buildMenuImageFetchUrl(normalizedUrl)
    const res = await fetch(fetchUrl, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!res.ok) return false
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES_PER_IMAGE) return false
    const mime = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    await putMenuImageCache(normalizedUrl, buf, mime)
    return true
  } catch {
    return false
  }
}

/**
 * POS 워밍 시 메뉴 목록의 imageUrl을 순차 다운로드 (이미 있으면 스킵)
 */
export async function warmPosMenuImagesFromMenuList(
  menus: Array<{ imageUrl?: string | null }>,
  opts?: { concurrency?: number }
): Promise<void> {
  if (typeof window === 'undefined') return
  /**
   * https + Serwist 환경에서 백그라운드 fetch 워밍이 SW·다수 동시 요청과 겹쳐
   * Network 탭에 (canceled)/ERR_FAILED 만 쌓이고 UI 썸네일은 `<img src=/api/posMenuImageProxy>` 가 담당.
   * 오프라인 썸네일 IDB는 https PWA에서 생략(온라인 시 프록시로 충분).
   */
  if (window.location.protocol === 'https:') return
  const origin = window.location.origin
  const concurrency = Math.max(1, opts?.concurrency ?? 6)
  const seen = new Set<string>()
  const urls: string[] = []
  for (const m of menus) {
    const raw = String(m?.imageUrl ?? '').trim()
    if (!raw) continue
    const normalized = normalizePosMenuImageUrl(raw)
    if (!normalized || seen.has(normalized)) continue
    if (!isPosMenuImageUrlCacheable(normalized, origin)) continue
    seen.add(normalized)
    urls.push(normalized)
  }
  if (!urls.length) return

  let cursor = 0
  async function worker() {
    for (;;) {
      const idx = cursor++
      if (idx >= urls.length) break
      const url = urls[idx]
      if (await hasMenuImageCache(url)) continue
      await fetchAndCacheMenuImage(url)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()))
}
