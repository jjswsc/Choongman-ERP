'use client'

import { useEffect, useRef, useState } from 'react'
import type { PosMenu } from '@/lib/api-client'
import { getErpCacheCachedAt } from '@/lib/offline/cache'
import { posMenusCatalogCacheKey } from '@/lib/offline/pos-catalog-offline'
import { warmPosMenuImagesFromMenuList } from '@/lib/offline/pos-menu-images-cache'

/**
 * IndexedDB에 메뉴 카탈로그가 백그라운드로 갱신되면(예: imageUrl 추가) POS 화면 state를 맞춤.
 * getPosMenus()는 캐시 히트 시 즉시 옛 배열을 반환하므로, 저장 완료 이벤트로 후속 반영.
 */
export function usePosMenusCatalogLiveRefresh(
  onUpdate: (menus: PosMenu[]) => void,
  storeCode?: string | null
) {
  const ref = useRef(onUpdate)
  ref.current = onUpdate
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState<number | null>(null)
  const cacheKey = posMenusCatalogCacheKey(storeCode || null)

  useEffect(() => {
    let cancelled = false
    void getErpCacheCachedAt(cacheKey).then((cachedAt) => {
      if (!cancelled && cachedAt != null) {
        setLastSyncedAtMs((prev) => (prev == null || cachedAt > prev ? cachedAt : prev))
      }
    })
    return () => {
      cancelled = true
    }
  }, [cacheKey])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ cacheKey?: string; data?: unknown }>
      if (ce.detail?.cacheKey !== cacheKey) return
      const list = ce.detail.data
      if (!Array.isArray(list)) return
      /** 백그라운드 동기화가 빈 배열을 주면(tenant 불일치 등) 화면을 비우지 않음 */
      if (list.length === 0) return
      const menus = list as PosMenu[]
      ref.current(menus)
      setLastSyncedAtMs(Date.now())
      void warmPosMenuImagesFromMenuList(menus, { concurrency: 3 })
    }
    window.addEventListener('cm-erp-pos-catalog-updated', handler as EventListener)
    return () => window.removeEventListener('cm-erp-pos-catalog-updated', handler as EventListener)
  }, [cacheKey])

  return {
    lastSyncedAtMs,
  }
}
