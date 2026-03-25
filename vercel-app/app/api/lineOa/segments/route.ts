import { NextRequest, NextResponse } from 'next/server'
import {
  fetchLineOaSegmentList,
  getLineOaSegmentCredentials,
  parseLineOaSegmentListQuery,
} from '@/lib/line-oa-segment-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const { searchParams } = new URL(request.url)
  const parsed = parseLineOaSegmentListQuery(searchParams)
  if (!parsed.ok) {
    return NextResponse.json(
      { success: false, message: parsed.message, code: parsed.code },
      { status: 400, headers }
    )
  }

  const cred = getLineOaSegmentCredentials()
  if ('error' in cred) {
    return NextResponse.json({ success: false, message: cred.error }, { status: 503, headers })
  }

  try {
    const upstream = await fetchLineOaSegmentList(parsed.params)
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
