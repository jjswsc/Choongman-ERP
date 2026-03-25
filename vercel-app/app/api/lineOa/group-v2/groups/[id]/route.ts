import { NextRequest, NextResponse } from 'next/server'
import {
  deleteLineOaGroupV2,
  fetchLineOaGroupV2ById,
  getLineOaGroupV2Credentials,
  patchLineOaGroupV2,
} from '@/lib/line-oa-group-v2-server'
import { parseLineOaGroupId, parsePatchLineOaGroupBody } from '@/lib/line-oa-group-server'

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

export async function GET(_request: NextRequest, context: RouteContext) {
  const headers = corsHeaders()
  const parsedId = parseLineOaGroupId(context.params.id)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }
  try {
    const upstream = await fetchLineOaGroupV2ById(parsedId.id)
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
    const data = obj && 'data' in obj ? obj.data : body
    return NextResponse.json({ success: true, id: parsedId.id, data, raw: body }, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const headers = corsHeaders()
  const parsedId = parseLineOaGroupId(context.params.id)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }
  const raw = await readJsonBody(request)
  const parsed = parsePatchLineOaGroupBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message, code: parsed.code }, { status: 400, headers })
  }
  try {
    const upstream = await patchLineOaGroupV2(parsedId.id, parsed.body as Record<string, unknown>)
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
    const data = obj && 'data' in obj ? obj.data : body
    return NextResponse.json({ success: true, id: parsedId.id, data, raw: body }, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const headers = corsHeaders()
  const parsedId = parseLineOaGroupId(context.params.id)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }
  try {
    const upstream = await deleteLineOaGroupV2(parsedId.id)
    if (upstream.status === 204) {
      return new NextResponse(null, { status: 204, headers })
    }
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
    return NextResponse.json({ success: true, id: parsedId.id, raw: body }, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}
