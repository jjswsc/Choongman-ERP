import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'

type PosHealthEventType = 'hybrid_print_mapping_mismatch' | 'offline_dead_letter_detected'

function asEventType(raw: unknown): PosHealthEventType | null {
  const v = String(raw || '').trim()
  if (v === 'hybrid_print_mapping_mismatch') return v
  if (v === 'offline_dead_letter_detected') return v
  return null
}

function bangkokIsoNow() {
  return new Date().toLocaleString('sv-SE', {
    timeZone: 'Asia/Bangkok',
    hour12: false,
  })
}

async function postWebhook(url: string, payload: Record<string, unknown>): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse

  let body: { eventType?: unknown; payload?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ success: false, message: 'invalid_json' }, { status: 400, headers })
  }

  const eventType = asEventType(body.eventType)
  if (!eventType) {
    return NextResponse.json({ success: false, message: 'invalid_event_type' }, { status: 400, headers })
  }

  const payload =
    body.payload && typeof body.payload === 'object'
      ? (body.payload as Record<string, unknown>)
      : {}

  const event = {
    eventType,
    atBangkok: bangkokIsoNow(),
    actor: {
      store: String(authRes.auth.store || '').trim() || null,
      name: String(authRes.auth.name || '').trim() || null,
      role: String(authRes.auth.role || '').trim() || null,
    },
    payload,
  }

  console.warn('[pos-health-alert]', JSON.stringify(event))

  const webhookUrl = String(process.env.POS_HEALTH_ALERT_WEBHOOK_URL || '').trim()
  let forwarded = false
  if (webhookUrl) {
    forwarded = await postWebhook(webhookUrl, {
      source: 'cm-erp-pos-health',
      text: `[${event.eventType}] store=${event.actor.store || '-'} role=${event.actor.role || '-'} at=${event.atBangkok}`,
      event,
    })
  }

  return NextResponse.json({ success: true, forwarded }, { headers })
}
