import { supabaseDeleteByFilter, supabaseTryInsertOnConflict } from '@/lib/supabase-server'

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
    const inserted = await supabaseTryInsertOnConflict(
      'pos_grab_webhook_events',
      {
        event_kind: eventKind,
        unique_key: uniqueKey,
        request_id: truncate(input.requestId || '', 120) || null,
        job_id: truncate(input.jobId || '', 120) || null,
        order_id: truncate(input.orderId || '', 120) || null,
        merchant_id: truncate(input.merchantId || '', 120) || null,
        partner_merchant_id: truncate(input.partnerMerchantId || '', 120) || null,
        payload_json: input.payload ?? null,
      },
      'event_kind,unique_key'
    )
    return !inserted
  } catch (e) {
    const msg = String(e || '')
    if (isMissingTableError(msg)) {
      console.warn('[grab-webhook-idempotency] table not ready, skip dedupe')
      return false
    }
    throw e
  }
}

/**
 * 선점한 idempotency 키를 처리 실패 시 해제한다.
 * - 테이블 미배포(42P01) 환경에서는 무시
 * - 존재하지 않는 키 삭제도 성공으로 본다
 */
export async function releaseGrabWebhookEvent(input: {
  eventKind: string
  uniqueKey: string
}): Promise<void> {
  const eventKind = truncate(input.eventKind.trim(), 80)
  const uniqueKey = truncate(input.uniqueKey.trim(), 300)
  if (!eventKind || !uniqueKey) return
  const filter = `event_kind=eq.${encodeURIComponent(eventKind)}&unique_key=eq.${encodeURIComponent(uniqueKey)}`
  try {
    await supabaseDeleteByFilter('pos_grab_webhook_events', filter)
  } catch (e) {
    const msg = String(e || '')
    if (isMissingTableError(msg)) return
    throw e
  }
}

