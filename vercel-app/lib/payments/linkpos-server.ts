import {
  buildHypercomV1Frame,
  fromHex,
  parseHypercomFrame,
  toHex,
} from '@/lib/payments/hypercom-v2'
import type {
  LinkposPayRequest,
  LinkposProviderResult,
  LinkposSettlementRequest,
  LinkposVoidRequest,
} from '@/lib/payments/types'

function normalizeAmount12(amount: number): string {
  const cents = Math.round(Math.max(0, amount) * 100)
  return String(cents).padStart(12, '0')
}

async function postRelay(payloadHex: string, timeoutMs: number): Promise<{ ok: boolean; responseHex?: string; error?: string }> {
  const relayUrl = String(process.env.LINKPOS_RELAY_URL || '').trim()
  if (!relayUrl) return { ok: false, error: 'relay_not_configured' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(800, timeoutMs))
  try {
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payloadHex, protocol: 'hypercom' }),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: `relay_http_${res.status}` }
    const json = (await res.json().catch(() => null)) as { success?: boolean; responseHex?: string; error?: string } | null
    if (!json) return { ok: false, error: 'relay_invalid_json' }
    if (!json.success) return { ok: false, error: json.error || 'relay_failed' }
    return { ok: true, responseHex: String(json.responseHex || '') }
  } catch (e) {
    return { ok: false, error: String(e) }
  } finally {
    clearTimeout(timer)
  }
}

function successFromParsed(txCode: '20' | '26' | '50', requestHex: string, responseHex: string) {
  const parsed = parseHypercomFrame(fromHex(responseHex))
  const responseCode = String(parsed.responseCode || '').trim()
  const approved = responseCode === '00'
  return {
    ok: approved,
    txCode,
    responseCode,
    responseText: parsed.fields['02'],
    approvalCode: parsed.fields['01'],
    traceNo: parsed.fields['65'],
    refNo: parsed.fields['D3'],
    terminalId: parsed.fields['16'],
    merchantId: parsed.fields['D1'],
    fields: parsed.fields,
    rawRequestHex: requestHex,
    rawResponseHex: responseHex,
    errorCode: approved ? undefined : 'declined',
    errorMessage: approved ? undefined : (parsed.fields['02'] || 'declined'),
  } satisfies LinkposProviderResult
}

export async function runHypercomSaleOnRelay(req: LinkposPayRequest): Promise<LinkposProviderResult> {
  const frame = buildHypercomV1Frame({
    txCode: '20',
    fields: [
      { type: '40', data: normalizeAmount12(req.amount) },
      { type: 'R1', data: req.reference1.slice(0, 20) },
      ...(req.reference2 ? [{ type: 'R2', data: req.reference2.slice(0, 20) }] : []),
      { type: 'J6', data: String(req.bankId || '').slice(0, 3) },
    ],
  })
  const requestHex = toHex(frame)
  const relay = await postRelay(requestHex, req.timeoutMs ?? 12000)
  if (!relay.ok || !relay.responseHex) {
    return {
      ok: false,
      txCode: '20',
      responseCode: 'ND',
      rawRequestHex: requestHex,
      errorCode: 'relay_error',
      errorMessage: relay.error || 'relay_error',
    }
  }
  try {
    return successFromParsed('20', requestHex, relay.responseHex)
  } catch (e) {
    return {
      ok: false,
      txCode: '20',
      responseCode: 'ND',
      rawRequestHex: requestHex,
      rawResponseHex: relay.responseHex,
      errorCode: 'parse_error',
      errorMessage: String(e),
    }
  }
}

export async function runHypercomVoidOnRelay(req: LinkposVoidRequest): Promise<LinkposProviderResult> {
  const frame = buildHypercomV1Frame({
    txCode: '26',
    fields: [
      { type: '65', data: req.traceNo.slice(0, 6) },
      { type: 'J6', data: String(req.bankId || '').slice(0, 3) },
    ],
  })
  const requestHex = toHex(frame)
  const relay = await postRelay(requestHex, req.timeoutMs ?? 12000)
  if (!relay.ok || !relay.responseHex) {
    return {
      ok: false,
      txCode: '26',
      responseCode: 'ND',
      rawRequestHex: requestHex,
      errorCode: 'relay_error',
      errorMessage: relay.error || 'relay_error',
    }
  }
  try {
    return successFromParsed('26', requestHex, relay.responseHex)
  } catch (e) {
    return {
      ok: false,
      txCode: '26',
      responseCode: 'ND',
      rawRequestHex: requestHex,
      rawResponseHex: relay.responseHex,
      errorCode: 'parse_error',
      errorMessage: String(e),
    }
  }
}

export async function runHypercomSettlementOnRelay(req: LinkposSettlementRequest): Promise<LinkposProviderResult> {
  const frame = buildHypercomV1Frame({
    txCode: '50',
    fields: [
      { type: 'HN', data: req.nii.slice(0, 3) },
      { type: 'J6', data: String(req.bankId || '').slice(0, 3) },
    ],
  })
  const requestHex = toHex(frame)
  const relay = await postRelay(requestHex, req.timeoutMs ?? 12000)
  if (!relay.ok || !relay.responseHex) {
    return {
      ok: false,
      txCode: '50',
      responseCode: 'ND',
      rawRequestHex: requestHex,
      errorCode: 'relay_error',
      errorMessage: relay.error || 'relay_error',
    }
  }
  try {
    return successFromParsed('50', requestHex, relay.responseHex)
  } catch (e) {
    return {
      ok: false,
      txCode: '50',
      responseCode: 'ND',
      rawRequestHex: requestHex,
      rawResponseHex: relay.responseHex,
      errorCode: 'parse_error',
      errorMessage: String(e),
    }
  }
}
