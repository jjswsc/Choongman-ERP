import { NextRequest, NextResponse } from 'next/server'
import {
  createLineOaGroupV2,
  fetchLineOaGroupV2List,
  getLineOaGroupV2Credentials,
  parseLineOaGroupV2ListQuery,
} from '@/lib/line-oa-group-v2-server'
import { parseCreateLineOaGroupBody } from '@/lib/line-oa-group-server'

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

export async function GET(request: NextRequest) {
  const headers = corsHeaders()
  const { searchParams } = new URL(request.url)
  const parsed = parseLineOaGroupV2ListQuery(searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message, code: parsed.code }, { status: 400, headers })
  }

  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }

  try {
    const upstream = await fetchLineOaGroupV2List(parsed.params)
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
    const total = obj && typeof obj.total === 'number' ? obj.total : undefined
    return NextResponse.json(
      {
        success: true,
        page: parsed.params.page,
        size: parsed.params.size,
        sort: parsed.params.sort,
        data,
        total,
        raw: body,
      },
      { headers }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  const cred = getLineOaGroupV2Credentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }

  const raw = await readJsonBody(request)
  const parsed = parseCreateLineOaGroupBody(raw)
  if (!parsed.ok) {
    return NextResponse.json({ success: false, message: parsed.message, code: parsed.code }, { status: 400, headers })
  }

  try {
    const upstream = await createLineOaGroupV2(parsed.body)
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
    return NextResponse.json({ success: true, data, raw: body }, { status: upstream.status, headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}
