/**
 * 같은 인스턴스(Vercel Fluid 동시 요청 포함)에서 같은 키의 비동기 조회를 진행 중·직후 TTL 동안 공유한다.
 * 실패한 Promise는 즉시 버려 다음 호출이 다시 시도한다. 반환값은 호출자끼리 공유되므로 변경하지 않는다.
 */
export function createAsyncTtlShare<T>(ttlMs: number, maxEntries = 200) {
  const entries = new Map<string, { at: number; promise: Promise<T> }>()

  return function share(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const hit = entries.get(key)
    if (hit && now - hit.at < ttlMs) return hit.promise
    if (hit) entries.delete(key)

    if (entries.size >= maxEntries) {
      for (const [k, v] of entries) {
        if (now - v.at >= ttlMs) entries.delete(k)
      }
      while (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    }

    const promise = load()
    entries.set(key, { at: now, promise })
    promise.catch(() => {
      if (entries.get(key)?.promise === promise) entries.delete(key)
    })
    return promise
  }
}
