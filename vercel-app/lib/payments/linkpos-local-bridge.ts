import { toHex } from '@/lib/payments/hypercom-v2'

const LOCAL_LINKPOS_ENDPOINTS = [
  'http://127.0.0.1:18181/linkpos/send',
  'http://localhost:18181/linkpos/send',
  'http://127.0.0.1:17888/linkpos/send',
  'http://localhost:17888/linkpos/send',
]

export type LocalBridgeSendResult = {
  ok: boolean
  endpoint?: string
  responseHex?: string
  error?: string
}

async function postJsonWithTimeout(url: string, body: Record<string, unknown>, timeoutMs: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const json = (await res.json().catch(() => null)) as { success?: boolean; responseHex?: string; error?: string } | null
    if (!json) return { ok: false, error: 'invalid_json' }
    if (!json.success) return { ok: false, error: json.error || 'bridge_failed' }
    return { ok: true, responseHex: String(json.responseHex || '').trim() }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    clearTimeout(timer)
  }
}

export async function sendLinkposFrameViaLocalBridge(params: {
  frame: Uint8Array
  timeoutMs?: number
  preferredEndpoint?: string
}): Promise<LocalBridgeSendResult> {
  const timeoutMs = Math.max(600, Number(params.timeoutMs || 8000))
  const request = {
    payloadHex: toHex(params.frame),
    protocol: 'hypercom',
  }
  const endpoints = params.preferredEndpoint
    ? [params.preferredEndpoint, ...LOCAL_LINKPOS_ENDPOINTS.filter((x) => x !== params.preferredEndpoint)]
    : LOCAL_LINKPOS_ENDPOINTS
  for (const endpoint of endpoints) {
    const r = await postJsonWithTimeout(endpoint, request, timeoutMs)
    if (r.ok) return { ok: true, endpoint, responseHex: r.responseHex }
  }
  return { ok: false, error: 'all_local_linkpos_endpoints_failed' }
}
