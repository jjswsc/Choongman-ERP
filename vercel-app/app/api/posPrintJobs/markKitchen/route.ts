import { NextRequest, NextResponse } from 'next/server'
import { markKitchenPrintJobFailed, markKitchenPrintJobPrinted } from '@/lib/pos-print-job-queue'
import { getVerifiedAuth } from '@/lib/verify-auth'

/** 주방 인쇄 큐 작업 완료/실패 마킹 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    await getVerifiedAuth(req)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const jobId = Math.floor(Number(body.jobId))
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ success: false, message: 'jobId is required' }, { status: 400, headers })
    }
    const status = String(body.status ?? '').trim().toLowerCase()
    if (status === 'printed') {
      await markKitchenPrintJobPrinted(jobId)
      return NextResponse.json({ success: true }, { headers })
    }
    const reason = String(body.reason ?? '').trim() || 'print_failed'
    await markKitchenPrintJobFailed(jobId, reason)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg.slice(0, 500) }, { status: 500, headers })
  }
}
