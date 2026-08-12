import { NextRequest, NextResponse } from 'next/server'
import { runAutoNotices } from '@/lib/auto-notice-runner'
import { cronAuthErrorResponse, isCronAuthorized } from '@/lib/verify-cron-auth'

/**
 * 자동 알림 cron — 매시 정각.
 * 실제 발송은 system_settings 규칙(방콕 시·월말 N일 전 등)으로 판정.
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const cronDenied = cronAuthErrorResponse(req, headers)
  if (cronDenied) return cronDenied
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ success: false, message: 'unauthorized' }, { status: 401, headers })
  }

  try {
    const result = await runAutoNotices()
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    console.error('auto-notices cron:', e)
    return NextResponse.json({ success: false, message: (e as Error).message }, { status: 500, headers })
  }
}
