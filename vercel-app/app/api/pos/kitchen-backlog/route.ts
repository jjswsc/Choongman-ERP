import { NextRequest, NextResponse } from 'next/server'
import { countKitchenPrintBacklog } from '@/lib/pos-print-job-queue'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 자동 출력 시간(8분)을 넘겨 밀린 주방 job 수 — 메인 POS 가 직원 확인 후 출력 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getVerifiedAuth(req)
    if (!auth) return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401 })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const storeCode = String(body.storeCode ?? auth.store ?? '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode is required' }, { status: 400 })
    }
    const count = await countKitchenPrintBacklog(storeCode)
    return NextResponse.json({ success: true, count })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 500) }, { status: 500 })
  }
}
