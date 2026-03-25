import { NextRequest, NextResponse } from 'next/server'
import {
  fetchLineOaGroupV2GroupedUsersResult,
  getLineOaGroupV2Credentials,
} from '@/lib/line-oa-group-v2-server'
import { parseLineOaGroupId, parseLineOaGroupRequestId } from '@/lib/line-oa-group-server'

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
  const parsedGroup = parseLineOaGroupId(rawId)
  if (!parsedGroup.ok) {
    return NextResponse.json({ success: false, message: parsedGroup.message }, { status: 400, headers })
  }
  const parsedReq = parseLineOaGroupRequestId(rawRequestId)
  if (!parsedReq.ok) {
    return NextResponse.json({ success: false, message: parsedReq.message }, { status: 400, headers })
  }
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }
  try {
    const upstream = await fetchLineOaGroupV2GroupedUsersResult(parsedGroup.id, parsedReq.requestId)
    const text = await upstream.text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }
    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, message: `LINE Group V2 API 오류 (${upstream.status})`, status: upstream.status, body },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, headers }
      )
    }
    const obj = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
    const exportStatus = obj && typeof obj.status === 'string' ? obj.status : undefined
    const url = obj && typeof obj.url === 'string' ? obj.url : undefined
    return NextResponse.json(
      {
        success: true,
        groupId: parsedGroup.id,
        requestId: parsedReq.requestId,
        status: exportStatus,
        url,
        raw: body,
      },
      { headers }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}
