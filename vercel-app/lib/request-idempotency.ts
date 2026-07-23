import { createHash } from 'node:crypto'
import { supabaseDeleteByFilter, supabaseInsert } from '@/lib/supabase-server'

type ReserveRequestKeyInput = {
  scope: string
  key: string
  payload?: unknown
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isDuplicateKeyError(msg: string): boolean {
  return /duplicate key value violates unique constraint|23505/i.test(msg)
}

function isMissingTableError(msg: string): boolean {
  return /relation .*api_request_idempotency_keys.* does not exist|42p01/i.test(msg)
}

/**
 * true: duplicate
 * false: reserved and should proceed
 *
 * 테이블 미배포 환경에서는 fail-open.
 */
export async function reserveRequestIdempotencyKey(
  input: ReserveRequestKeyInput
): Promise<boolean> {
  const scope = String(input.scope || '').trim().slice(0, 120)
  const key = String(input.key || '').trim()
  if (!scope || !key) return false

  const keyHash = sha256Hex(key)
  try {
    await supabaseInsert('api_request_idempotency_keys', {
      scope,
      key_hash: keyHash,
      key_preview: key.slice(0, 80),
      payload_json: input.payload ?? null,
    })
    return false
  } catch (e) {
    const msg = String(e || '')
    if (isDuplicateKeyError(msg)) return true
    if (isMissingTableError(msg)) {
      console.warn('[request-idempotency] table not ready, skip dedupe')
      return false
    }
    throw e
  }
}

/**
 * reserve 이후 본문 처리가 실패했을 때 키를 풀어 재시도가 noop 로 죽지 않게 함.
 * (타임아웃·22007 등으로 1차 실패 후 동일 x-idempotency-key 재전송 시나리오)
 */
export async function releaseRequestIdempotencyKey(input: {
  scope: string
  key: string
}): Promise<void> {
  const scope = String(input.scope || '').trim().slice(0, 120)
  const key = String(input.key || '').trim()
  if (!scope || !key) return

  const keyHash = sha256Hex(key)
  const filter = `scope=eq.${encodeURIComponent(scope)}&key_hash=eq.${encodeURIComponent(keyHash)}`
  try {
    await supabaseDeleteByFilter('api_request_idempotency_keys', filter)
  } catch (e) {
    const msg = String(e || '')
    if (isMissingTableError(msg)) return
    console.warn('[request-idempotency] release failed:', msg.slice(0, 200))
  }
}
