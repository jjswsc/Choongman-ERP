/** Structured KBank token/inquiry metrics — never log access_token or secrets. */

export type KbankTokenMetricEvent =
  | 'token_cache_hit'
  | 'token_cache_miss'
  | 'token_shared_unavailable'
  | 'token_lock_acquired'
  | 'token_lock_wait'
  | 'token_endpoint_request'
  | 'token_endpoint_ok'
  | 'token_endpoint_error'
  | 'token_cleared'
  | 'inquiry_request'
  | 'inquiry_skip_rate_limit'
  | 'kbank_api_401_refresh'
  | 'kbank_api_429_no_retry'

export type KbankTokenMetricPayload = {
  event: KbankTokenMetricEvent
  cacheKey?: string
  reason?: string
  httpStatus?: number
  partnerTxnUidMasked?: string
  storeCode?: string
  api?: string
  detail?: string
}

let processInstanceId = ''

export function getKbankRuntimeInstanceId(): string {
  if (processInstanceId) return processInstanceId
  const region = String(process.env.VERCEL_REGION || '').trim() || 'local'
  const deploy = String(process.env.VERCEL_DEPLOYMENT_ID || '')
    .trim()
    .slice(0, 12)
  const rand = Math.random().toString(36).slice(2, 8)
  processInstanceId = `kbank:${region}:${deploy || 'dev'}:${rand}`
  return processInstanceId
}

export function maskKbankPartnerTxnUid(uid: unknown): string {
  const s = String(uid || '').trim()
  if (!s) return ''
  if (s.length <= 10) return `${s.slice(0, 4)}***`
  return `${s.slice(0, 8)}***${s.slice(-4)}`
}

export function logKbankTokenMetric(payload: KbankTokenMetricPayload): void {
  try {
    console.info(
      JSON.stringify({
        src: 'kbank_metrics',
        ts: new Date().toISOString(),
        instanceId: getKbankRuntimeInstanceId(),
        ...payload,
      })
    )
  } catch {
    /* noop */
  }
}
