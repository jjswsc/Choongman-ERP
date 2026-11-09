import { NextRequest, NextResponse } from 'next/server'
import { runGrabMenuAvailabilityCron } from '@/lib/grab-menu-availability-sync'
import { cronAuthErrorResponse, isCronAuthorized } from '@/lib/verify-cron-auth'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * 5분마다 — 배달 판매시간·품절이 바뀐 Grab 품목만 PUT /partner/v1/menu.
 * 방콕 시각 기준으로 열림/닫힘을 맞추고, 마지막에 성공한 상태와 같으면 다시 보내지 않는다.
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
    const result = await runGrabMenuAvailabilityCron()
    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (error) {
    console.error('grab-menu-availability cron:', error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500, headers }
    )
  }
}
