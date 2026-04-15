import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

function buildUserKey(userStore: string, userName: string, employeeId?: number | null) {
  if (employeeId && Number.isFinite(employeeId) && employeeId > 0) return `eid:${Math.floor(employeeId)}`
  return `store:${userStore}::user:${userName}`
}

/** 프로젝트/존/사용자별 레이아웃 편집 기본값 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const projectId = Number(body.projectId ?? 0)
    const zone = String(body.zone ?? '').trim()
    const userStore = String(body.userStore ?? '').trim()
    const userName = String(body.userName ?? '').trim()
    const employeeIdRaw = body.employeeId
    const employeeId = employeeIdRaw != null && employeeIdRaw !== '' ? Number(employeeIdRaw) : null
    const duplicateOffsetX = Number(body.duplicateOffsetX ?? 0.5)
    const duplicateOffsetY = Number(body.duplicateOffsetY ?? 0.5)
    const snapEnabled = body.snapEnabled !== false
    const snapStep = Number(body.snapStep ?? 0.5)
    const nudgeSmall = Number(body.nudgeSmall ?? 0.1)
    const nudgeMedium = Number(body.nudgeMedium ?? 0.5)
    const nudgeLarge = Number(body.nudgeLarge ?? 1.0)

    if (!projectId || Number.isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (zone !== 'kitchen' && zone !== 'hall') {
      return NextResponse.json({ success: false, message: 'zone 값이 유효하지 않습니다.' }, { status: 400, headers })
    }
    if (!userStore || !userName) {
      return NextResponse.json({ success: false, message: '사용자 정보가 필요합니다.' }, { status: 400, headers })
    }

    const userKey = buildUserKey(userStore, userName, employeeId)
    await supabaseUpsert(
      'interior_layout_editor_prefs',
      [
        {
          project_id: projectId,
          zone,
          user_key: userKey,
          user_store: userStore,
          user_name: userName,
          employee_id: employeeId && !Number.isNaN(employeeId) ? Math.floor(employeeId) : null,
          duplicate_offset_x: Number.isFinite(duplicateOffsetX) ? duplicateOffsetX : 0.5,
          duplicate_offset_y: Number.isFinite(duplicateOffsetY) ? duplicateOffsetY : 0.5,
          snap_enabled: snapEnabled,
          snap_step: Number.isFinite(snapStep) ? Math.max(0.1, snapStep) : 0.5,
          nudge_small: Number.isFinite(nudgeSmall) ? Math.max(0.01, nudgeSmall) : 0.1,
          nudge_medium: Number.isFinite(nudgeMedium) ? Math.max(0.01, nudgeMedium) : 0.5,
          nudge_large: Number.isFinite(nudgeLarge) ? Math.max(0.01, nudgeLarge) : 1.0,
          updated_at: new Date().toISOString(),
        },
      ],
      'project_id,zone,user_key'
    )

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('saveInteriorLayoutEditorPrefs:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
