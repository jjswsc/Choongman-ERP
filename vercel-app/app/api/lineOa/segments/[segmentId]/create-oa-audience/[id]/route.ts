import { NextRequest, NextResponse } from 'next/server'
import {
  fetchLineOaCreateAudienceResult,
  parseLineOaAudienceRequestId,
  parseLineOaSegmentPathId,
} from '@/lib/line-oa-segment-server'

type RouteContext = { params: { segmentId: string; id: string } }

export async function GET(_request: NextRequest, context: RouteContext) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const parsedSegmentId = parseLineOaSegmentPathId(context.params.segmentId)
  if (!parsedSegmentId.ok) {
    return NextResponse.json({ success: false, message: parsedSegmentId.message }, { status: 400, headers })
  }
  const parsedId = parseLineOaAudienceRequestId(context.params.id)
  if (!parsedId.ok) {
    return NextResponse.json({ success: false, message: parsedId.message }, { status: 400, headers })
  }

  try {
    const upstream = await fetchLineOaCreateAudienceResult(parsedSegmentId.segmentId, parsedId.id)
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
    const data = obj && 'data' in obj ? obj.data : body

    return NextResponse.json(
      {
        success: true,
        segmentId: parsedSegmentId.segmentId,
        id: parsedId.id,
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
