/**
 * ERP 조회 화면용 in-memory 스냅샷.
 * keep-alive remount 시 fiber state가 비어도 필터·결과를 복구한다.
 * (실시간 매출 등 keep-alive 제외 화면은 사용하지 않음)
 */

export type ErpQueryViewCacheApi<T> = {
  save: (snapshot: T) => void
  read: () => T | null
  clear: () => void
}

export function createErpQueryViewCache<T>(): ErpQueryViewCacheApi<T> {
  let cache: T | null = null
  return {
    save(snapshot) {
      cache = snapshot
    },
    read() {
      return cache
    },
    clear() {
      cache = null
    },
  }
}
