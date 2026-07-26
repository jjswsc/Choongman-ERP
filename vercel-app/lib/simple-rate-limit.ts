const bucket = new Map<string, { count: number; resetAt: number }>()

/** 프로세스 메모리 기준 단순 rate limit (서버리스 인스턴스별). */
export function simpleRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now()
  const prev = bucket.get(key)
  if (!prev || now >= prev.resetAt) {
    bucket.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterMs: 0 }
  }
  if (prev.count >= max) {
    return { ok: false, retryAfterMs: Math.max(0, prev.resetAt - now) }
  }
  prev.count += 1
  bucket.set(key, prev)
  return { ok: true, retryAfterMs: 0 }
}
