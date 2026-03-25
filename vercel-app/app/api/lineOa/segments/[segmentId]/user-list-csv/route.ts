import { NextRequest, NextResponse } from 'next/server'
import { parseLineOaSegmentPathId, requestLineOaSegmentUserListCsv } from '@/lib/line-oa-segment-server'

type RouteContext = { params: Promise<{ segmentId: string }> }

export async function POST(_request: NextRequest, context: RouteContext) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const { segmentId } = await context.params
  const parsedId = parseLineOaSegmentPathId(segmentId)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }

  try {
    const upstream = await requestLineOaSegmentUserListCsv(parsedId.segmentId)
    const text = await upstream.text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          success: false,
          message: `LINE Segment API 오류 (${upstream.status})`,
          status: upstream.status,
          body,
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, headers }
      )
    }

    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
    const id = obj && typeof obj.id === 'string' ? obj.id : undefined
    return NextResponse.json(
      {
        success: true,
        segmentId: parsedId.segmentId,
        id,
        raw: body,
      },
      { status: upstream.status, headers }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message }, { status: 500, headers })
  }
}
