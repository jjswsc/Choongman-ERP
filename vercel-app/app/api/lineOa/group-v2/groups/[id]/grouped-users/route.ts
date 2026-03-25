import { NextRequest, NextResponse } from 'next/server'
import { getLineOaGroupV2Credentials, requestLineOaGroupV2GroupedUsersCsv } from '@/lib/line-oa-group-v2-server'
import { parseLineOaGroupId } from '@/lib/line-oa-group-server'

type RouteContext = { params: Promise<{ id: string }> }

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  return headers
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const headers = corsHeaders()
  const { id } = await context.params
  const parsedId = parseLineOaGroupId(id)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }
  try {
    const upstream = await requestLineOaGroupV2GroupedUsersCsv(parsedId.id)
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
    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
    const jobId = obj && typeof obj.id === 'string' ? obj.id : undefined
    return NextResponse.json(
      { success: true, groupId: parsedId.id, id: jobId, raw: body },
      { status: upstream.status, headers }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}
