import { NextRequest, NextResponse } from 'next/server'
import {
  fetchLineOaGroupUserOperation,
  getLineOaGroupCredentials,
  parseLineOaGroupId,
  parseLineOaGroupRequestId,
} from '@/lib/line-oa-group-server'

type RouteContext = { params: Promise<{ id: string; requestId: string }> }

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  return headers
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const headers = corsHeaders()
  const { id: rawId, requestId: rawRequestId } = await context.params
  const parsedId = parseLineOaGroupId(rawId)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }
  const parsedReq = parseLineOaGroupRequestId(rawRequestId)
  if (!parsedReq.ok) {
    return NextResponse.json({ success: false, message: parsedReq.message }, { status: 400, headers })
  }
  const cred = getLineOaGroupCredentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }
  try {
    const upstream = await fetchLineOaGroupUserOperation(parsedId.id, parsedReq.requestId)
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
    const data = obj && 'data' in obj ? obj.data : body
    return NextResponse.json(
      {
        success: true,
        groupId: parsedId.id,
        requestId: parsedReq.requestId,
        data,
        raw: body,
      },
      { headers }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}
