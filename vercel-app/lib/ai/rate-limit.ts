const bucket = new Map<string, { count: number; resetAt: number }>()

export function aiRateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
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

