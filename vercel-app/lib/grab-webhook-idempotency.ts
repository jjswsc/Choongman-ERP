import { supabaseInsert } from '@/lib/supabase-server'

type ReserveGrabWebhookEventInput = {
  eventKind: string
  uniqueKey: string
  requestId?: string
  jobId?: string
  orderId?: string
  merchantId?: string
  partnerMerchantId?: string
  payload?: unknown
}

function truncate(value: string, max: number): string {
  return String(value || '').slice(0, max)
}

function isDuplicateKeyError(msg: string): boolean {
  return /duplicate key value violates unique constraint|23505/i.test(msg)
}

function isMissingTableError(msg: string): boolean {
  return /relation .*pos_grab_webhook_events.* does not exist|42p01/i.test(msg)
}

/**
 * true 반환: 이미 처리된 중복 이벤트
 * false 반환: 신규 이벤트(처리 진행)
 *
 * 테이블이 아직 배포되지 않은 환경에서는 fail-open(신규로 간주) 처리.
 */
export async function reserveGrabWebhookEvent(
  input: ReserveGrabWebhookEventInput
): Promise<boolean> {
  const eventKind = truncate(input.eventKind.trim(), 80)
  const uniqueKey = truncate(input.uniqueKey.trim(), 300)
  if (!eventKind || !uniqueKey) return false

  try {
    await supabaseInsert('pos_grab_webhook_events', {
      event_kind: eventKind,
      unique_key: uniqueKey,
      request_id: truncate(input.requestId || '', 120) || null,
      job_id: truncate(input.jobId || '', 120) || null,
      order_id: truncate(input.orderId || '', 120) || null,
      merchant_id: truncate(input.merchantId || '', 120) || null,
      partner_merchant_id: truncate(input.partnerMerchantId || '', 120) || null,
      payload_json: input.payload ?? null,
    })
    return false
  } catch (e) {
    const msg = String(e || '')
    if (isDuplicateKeyError(msg)) return true
    if (isMissingTableError(msg)) {
      console.warn('[grab-webhook-idempotency] table not ready, skip dedupe')
      return false
    }
    throw e
  }
}

