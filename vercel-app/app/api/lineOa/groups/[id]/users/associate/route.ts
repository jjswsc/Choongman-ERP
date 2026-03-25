import { NextRequest, NextResponse } from 'next/server'
import {
  associateLineOaGroupUsers,
  getLineOaGroupCredentials,
  parseAssociateLineOaGroupBody,
  parseLineOaGroupId,
} from '@/lib/line-oa-group-server'

type RouteContext = { params: { id: string } }

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  return headers
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const headers = corsHeaders()
  const parsedId = parseLineOaGroupId(context.params.id)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }
  const raw = await readJsonBody(request)
  const parsed = parseAssociateLineOaGroupBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message, code: parsed.code }, { status: 400, headers })
  }
  try {
    const upstream = await associateLineOaGroupUsers(parsedId.id, parsed.body)
    const text = await upstream.text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, message: `LINE Group API 오류 (${upstream.status})`, status: upstream.status, body },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, headers }
      )
    }
    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
    const requestId = obj && typeof obj.requestId === 'string' ? obj.requestId : undefined
    return NextResponse.json({ success: true, groupId: parsedId.id, requestId, raw: body }, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}
