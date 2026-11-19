import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import {
  getNoticeUnreadAllowanceSettings,
  saveNoticeUnreadAllowanceSettings,
} from '@/lib/notice-unread-allowance-settings-server'
import { syncNoticeUnreadAllowanceExclusionsForMonth } from '@/lib/notice-unread-allowance-auto-sync'
import { bangkokTodayYmd } from '@/lib/bangkok-date'

function corsHeaders() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  return headers
}

/** GET — 공지 미확인 수당 제외 정책 */
export async function GET(request: NextRequest) {
  const headers = corsHeaders()
  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  try {
    const settings = await getNoticeUnreadAllowanceSettings()
    return NextResponse.json({ success: true, settings }, { headers })
  } catch (e) {
    console.error('notices/unread-allowance-settings GET:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

/**
 * POST — 정책 저장 및/또는 급여월 자동 동기화
 * body: { mode?, minUnreadDays?, minMissed?, syncMonth?, syncOnly? }
 */
export async function POST(request: NextRequest) {
  const headers = corsHeaders()
  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  const auth = authRes.auth
  const role = (auth.role || '').toLowerCase()
  const canEdit = isOfficeRole(role) || isAccountingRole(role)
  if (!canEdit) {
    return NextResponse.json(
      { success: false, message: '본사·회계 권한만 정책을 변경할 수 있습니다.' },
      { status: 403, headers }
    )
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      mode?: string
      minUnreadDays?: number
      minMissed?: number
      syncMonth?: string
      syncOnly?: boolean
    }

    let settings = await getNoticeUnreadAllowanceSettings()
    if (!body.syncOnly) {
      const patch: { mode?: 'manual' | 'auto'; minUnreadDays?: number; minMissed?: number } = {}
      if (body.mode === 'manual' || body.mode === 'auto') patch.mode = body.mode
      if (body.minUnreadDays != null) patch.minUnreadDays = Number(body.minUnreadDays)
      if (body.minMissed != null) patch.minMissed = Number(body.minMissed)
      if (Object.keys(patch).length > 0) {
        settings = await saveNoticeUnreadAllowanceSettings(patch)
      }
    }

    let sync = null as Awaited<ReturnType<typeof syncNoticeUnreadAllowanceExclusionsForMonth>> | null
    const syncMonth =
      String(body.syncMonth || '').trim().slice(0, 7) ||
      (settings.mode === 'auto' || body.syncOnly ? bangkokTodayYmd().slice(0, 7) : '')
    if (body.syncOnly || (settings.mode === 'auto' && body.mode === 'auto') || Boolean(body.syncMonth)) {
      if (syncMonth) {
        sync = await syncNoticeUnreadAllowanceExclusionsForMonth(syncMonth, { settings })
      }
    }

    return NextResponse.json({ success: true, settings, sync }, { headers })
  } catch (e) {
    console.error('notices/unread-allowance-settings POST:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
