import { NextRequest, NextResponse } from 'next/server'
import {
  getAutoNoticeSettings,
  saveAutoNoticeSettings,
} from '@/lib/auto-notice-settings-server'
import {
  normalizeAutoNoticeCustomRules,
  normalizeAutoNoticeStockTake,
  normalizeAutoNoticeWorkLog,
} from '@/lib/auto-notice-settings'

function corsHeaders(): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return headers
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

/** GET: 자동 알림 규칙 조회 */
export async function GET() {
  const headers = corsHeaders()
  try {
    const settings = await getAutoNoticeSettings()
    return NextResponse.json(settings, { headers })
  } catch (e) {
    console.error('getAutoNoticeSettings:', e)
    return NextResponse.json(
      { success: false, message: (e as Error).message },
      { status: 500, headers }
    )
  }
}

/** POST: 자동 알림 규칙 저장 (built-in + customRules 전체 목록) */
export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  try {
    const body = (await request.json().catch(() => ({}))) as {
      workLog?: unknown
      stockTake?: unknown
      customRules?: unknown
    }
    const patch: {
      workLog?: ReturnType<typeof normalizeAutoNoticeWorkLog>
      stockTake?: ReturnType<typeof normalizeAutoNoticeStockTake>
      customRules?: ReturnType<typeof normalizeAutoNoticeCustomRules>
    } = {}
    if (body.workLog != null && typeof body.workLog === 'object') {
      patch.workLog = normalizeAutoNoticeWorkLog(body.workLog)
    }
    if (body.stockTake != null && typeof body.stockTake === 'object') {
      patch.stockTake = normalizeAutoNoticeStockTake(body.stockTake)
    }
    if (body.customRules != null) {
      if (!Array.isArray(body.customRules)) {
        return NextResponse.json(
          { success: false, message: 'customRules는 배열이어야 합니다.' },
          { status: 400, headers }
        )
      }
      patch.customRules = normalizeAutoNoticeCustomRules(body.customRules)
    }
    if (!patch.workLog && !patch.stockTake && patch.customRules == null) {
      return NextResponse.json(
        { success: false, message: 'workLog, stockTake 또는 customRules가 필요합니다.' },
        { status: 400, headers }
      )
    }
    const settings = await saveAutoNoticeSettings(patch)
    return NextResponse.json({ success: true, ...settings }, { headers })
  } catch (e) {
    console.error('updateAutoNoticeSettings:', e)
    return NextResponse.json(
      { success: false, message: (e as Error).message },
      { status: 500, headers }
    )
  }
}
