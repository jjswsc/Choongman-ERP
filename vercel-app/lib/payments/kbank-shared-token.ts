import { supabaseRpc } from '@/lib/supabase-server'
import type { KbankTokenResponse } from '@/lib/payments/kbank-types'
import {
  getKbankRuntimeInstanceId,
  logKbankTokenMetric,
} from '@/lib/payments/kbank-token-metrics'

type SharedTokenHit = {
  hit: true
  token: KbankTokenResponse
  expiresAtMs: number
}

type SharedTokenMiss = { hit: false }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function parseGetResult(raw: unknown): SharedTokenHit | SharedTokenMiss {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!obj || obj.hit !== true) return { hit: false }
  const accessToken = String(obj.access_token || '').trim()
  if (!accessToken) return { hit: false }
  const expiresAtMs = Number(obj.expires_at_ms || 0)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return { hit: false }
  return {
    hit: true,
    expiresAtMs,
    token: {
      access_token: accessToken,
      token_type: String(obj.token_type || '').trim() || undefined,
      expires_in: Number(obj.expires_in || 0) || undefined,
      scope: String(obj.scope || '').trim() || undefined,
    },
  }
}

export async function readSharedKbankAccessToken(
  cacheKey: string,
  opts?: { quiet?: boolean }
): Promise<{ token: KbankTokenResponse; expiresAtMs: number } | null> {
  try {
    const raw = await supabaseRpc<unknown>('kbank_token_cache_get', {
      p_cache_key: cacheKey,
      p_now_ms: Date.now(),
    })
    const parsed = parseGetResult(raw)
    if (!parsed.hit) {
      if (!opts?.quiet) {
        logKbankTokenMetric({ event: 'token_cache_miss', cacheKey, reason: 'shared_miss' })
      }
      return null
    }
    if (!opts?.quiet) {
      logKbankTokenMetric({ event: 'token_cache_hit', cacheKey, reason: 'shared' })
    }
    return { token: parsed.token, expiresAtMs: parsed.expiresAtMs }
  } catch (err) {
    logKbankTokenMetric({
      event: 'token_shared_unavailable',
      cacheKey,
      reason: 'get_failed',
      detail: String((err as Error)?.message || err).slice(0, 180),
    })
    return null
  }
}

export async function writeSharedKbankAccessToken(
  cacheKey: string,
  token: KbankTokenResponse,
  expiresAtMs: number
): Promise<boolean> {
  try {
    await supabaseRpc('kbank_token_cache_put', {
      p_cache_key: cacheKey,
      p_access_token: token.access_token,
      p_token_type: token.token_type || null,
      p_expires_in: token.expires_in ?? null,
      p_scope: token.scope || null,
      p_expires_at_ms: expiresAtMs,
    })
    return true
  } catch (err) {
    logKbankTokenMetric({
      event: 'token_shared_unavailable',
      cacheKey,
      reason: 'put_failed',
      detail: String((err as Error)?.message || err).slice(0, 180),
    })
    return false
  }
}

export async function clearSharedKbankAccessToken(cacheKey: string): Promise<void> {
  try {
    await supabaseRpc('kbank_token_cache_clear', { p_cache_key: cacheKey })
    logKbankTokenMetric({ event: 'token_cleared', cacheKey, reason: 'shared_clear' })
  } catch (err) {
    logKbankTokenMetric({
      event: 'token_shared_unavailable',
      cacheKey,
      reason: 'clear_failed',
      detail: String((err as Error)?.message || err).slice(0, 180),
    })
  }
}

/** Try acquire distributed refresh lock. Returns lock holder id when acquired. */
export async function tryAcquireKbankTokenLock(
  cacheKey: string,
  ttlSeconds = 20
): Promise<string | null> {
  const holder = `${getKbankRuntimeInstanceId()}:${Date.now().toString(36)}`
  try {
    const ok = await supabaseRpc<boolean>('kbank_token_lock_try', {
      p_cache_key: cacheKey,
      p_lock_holder: holder,
      p_ttl_seconds: ttlSeconds,
    })
    if (ok === true) {
      logKbankTokenMetric({ event: 'token_lock_acquired', cacheKey, reason: holder })
      return holder
    }
    logKbankTokenMetric({ event: 'token_lock_wait', cacheKey, reason: 'busy' })
    return null
  } catch (err) {
    logKbankTokenMetric({
      event: 'token_shared_unavailable',
      cacheKey,
      reason: 'lock_failed',
      detail: String((err as Error)?.message || err).slice(0, 180),
    })
    // Fail open for this instance only — caller may still use in-process dedupe.
    return holder
  }
}

export async function releaseKbankTokenLock(cacheKey: string, lockHolder: string): Promise<void> {
  try {
    await supabaseRpc('kbank_token_lock_release', {
      p_cache_key: cacheKey,
      p_lock_holder: lockHolder,
    })
  } catch {
    /* noop */
  }
}

/** Wait until another instance writes a usable shared token (or timeout). */
export async function waitForSharedKbankAccessToken(
  cacheKey: string,
  timeoutMs = 12_000
): Promise<{ token: KbankTokenResponse; expiresAtMs: number } | null> {
  const deadline = Date.now() + Math.max(500, timeoutMs)
  while (Date.now() < deadline) {
    const hit = await readSharedKbankAccessToken(cacheKey, { quiet: true })
    if (hit) {
      logKbankTokenMetric({ event: 'token_cache_hit', cacheKey, reason: 'shared_wait' })
      return hit
    }
    await sleep(250)
  }
  return null
}
