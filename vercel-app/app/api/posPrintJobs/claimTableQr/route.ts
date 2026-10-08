import { NextRequest, NextResponse } from 'next/server'
import { claimQueuedTableQrPrintJob } from '@/lib/pos-print-job-queue'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 테이블 QR 슬립 인쇄 큐에서 다음 작업 1건 claim (메인 POS) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const auth = await getVerifiedAuth(req)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const storeCode = String(body.storeCode ?? auth?.store ?? '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode is required' }, { status: 400, headers })
    }
    const workerId =
      String(body.workerId ?? '').trim() ||
      `${String(auth?.store ?? storeCode).trim()}:${String(auth?.name ?? 'worker').trim()}`
    const job = await claimQueuedTableQrPrintJob({ storeCode, workerId })
    return NextResponse.json({ success: true, job }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 500) }, { status: 500, headers })
  }
}
