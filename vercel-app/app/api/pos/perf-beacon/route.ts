import { NextRequest, NextResponse } from 'next/server'
import { normalizePosPerfEntries, summarizePosPerfEntries } from '@/lib/pos-perf-summary'

const MAX_BODY_BYTES = 16 * 1024

/**
 * POS 체감 지연 계측 수신 — DB 저장 없이 Vercel 런타임 로그에 한 줄 요약만 남긴다.
 * 로그 검색: `pos_perf`
 */
export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    if (!text || text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 })
    const body = JSON.parse(text) as { storeCode?: unknown; entries?: unknown }
    const entries = normalizePosPerfEntries(body?.entries)
    if (entries.length === 0) return new NextResponse(null, { status: 204 })
    const storeCode = String(body?.storeCode ?? '').trim().slice(0, 40)
    console.log(
      JSON.stringify({ tag: 'pos_perf', storeCode, summary: summarizePosPerfEntries(entries) })
    )
  } catch {
    /* 잘못된 본문 — 무시 */
  }
  return new NextResponse(null, { status: 204 })
}
