import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { verifyLineSignature } from '@/lib/line-signature'
import { createMemberEvent, registerLineMember, setLineIdentityStatus } from '@/lib/members-server'
import { getLineUserProfile } from '@/lib/line-messaging-server'

type LineWebhookEvent = {
  type?: string
  timestamp?: number
  webhookEventId?: string
  source?: { userId?: string; type?: string }
  replyToken?: string
  message?: { id?: string; type?: string; text?: string }
}

function buildEventId(event: LineWebhookEvent): string {
  const raw = [
    String(event.webhookEventId || ''),
    String(event.type || ''),
    String(event.timestamp || ''),
    String(event.source?.userId || ''),
    String(event.message?.id || ''),
  ].join('|')
  if (String(event.webhookEventId || '').trim()) return String(event.webhookEventId)
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
}

async function handleEvent(event: LineWebhookEvent) {
  const lineUserId = String(event.source?.userId || '').trim()
  const eventType = String(event.type || 'unknown')
  const eventId = buildEventId(event)

  const inserted = await createMemberEvent({
    eventId,
    eventType,
    payload: event,
    status: 'received',
  })
  if (!inserted) return

  try {
    let memberId: number | undefined
    if (lineUserId && (eventType === 'follow' || eventType === 'message' || eventType === 'postback')) {
      let displayName = ''
      let pictureUrl = ''
      try {
        const profile = await getLineUserProfile(lineUserId)
        displayName = profile.displayName
        pictureUrl = profile.pictureUrl
      } catch (profileError) {
        console.warn('LINE profile fetch failed:', profileError)
      }
      if (!displayName) {
        console.warn('LINE displayName is empty. skip register:', lineUserId)
      } else {
      const member = await registerLineMember({
        lineUserId,
        displayName,
        pictureUrl,
        name: displayName,
      })
      memberId = member.id
      }
    } else if (lineUserId && eventType === 'unfollow') {
      await setLineIdentityStatus(lineUserId, 'inactive')
    }

    await createMemberEvent({
      eventId: `${eventId}:processed`,
      eventType,
      payload: { sourceEventId: eventId },
      status: 'processed',
      memberId,
    })
  } catch (e) {
    await createMemberEvent({
      eventId: `${eventId}:failed`,
      eventType,
      payload: { sourceEventId: eventId },
      status: 'failed',
      errorMessage: e instanceof Error ? e.message : 'unknown error',
    })
    throw e
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const bodyText = await req.text()
  const signature = req.headers.get('x-line-signature')
  const channelSecret = String(process.env.LINE_CHANNEL_SECRET || '').trim()

  if (!channelSecret) {
    return NextResponse.json({ success: false, message: 'LINE_CHANNEL_SECRET가 설정되지 않았습니다.' }, { status: 500, headers })
  }
  if (!verifyLineSignature(bodyText, signature, channelSecret)) {
    return NextResponse.json({ success: false, message: 'Invalid LINE signature' }, { status: 401, headers })
  }

  try {
    const payload = JSON.parse(bodyText) as { events?: LineWebhookEvent[] }
    const events = Array.isArray(payload.events) ? payload.events : []
    for (const event of events) {
      await handleEvent(event)
    }
    return NextResponse.json({ success: true, processed: events.length }, { headers })
  } catch (e) {
    console.error('POST /api/line/webhook:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'LINE webhook 처리 실패',
      },
      { status: 500, headers }
    )
  }
}
