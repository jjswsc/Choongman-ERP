'use client'

import { useEffect, useRef } from 'react'
import type { PosMenu } from '@/lib/api-client'
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
  const cacheKey = posMenusCatalogCacheKey(storeCode || null)

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ cacheKey?: string; data?: unknown }>
      if (ce.detail?.cacheKey !== cacheKey) return
      const list = ce.detail.data
      if (!Array.isArray(list)) return
      const menus = list as PosMenu[]
      ref.current(menus)
      void warmPosMenuImagesFromMenuList(menus, { concurrency: 3 })
    }
    window.addEventListener('cm-erp-pos-catalog-updated', handler as EventListener)
    return () => window.removeEventListener('cm-erp-pos-catalog-updated', handler as EventListener)
  }, [cacheKey])
}
