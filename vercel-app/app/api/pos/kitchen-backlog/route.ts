import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import { countKitchenPrintBacklog } from '@/lib/pos-print-job-queue'

/** 메인 POS 꺼짐·오프라인 동안 밀린 주방 job 수 — 복구 시 직원 확인용 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const storeCode = String(body.storeCode ?? '').trim()
    const gate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!gate.ok) return gate.response
    const count = await countKitchenPrintBacklog(storeCode)
    return NextResponse.json({ success: true, count }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 500) }, { status: 500, headers })
  }
}
