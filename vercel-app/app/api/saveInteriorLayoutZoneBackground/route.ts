import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantContext,
} from '@/lib/interior-tenant-guard'
import { stampSaasTenantId } from '@/lib/saas-tenant-scope'

const ZONE_BG_KEY = '__zone_bg__'

/** 프로젝트·존별 공유 배경 도면 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const guard = await requireInteriorTenantContext(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    guard.errorResponse.headers.set('Content-Type', 'application/json')
    return guard.errorResponse
  }

  try {
    const body = (await request.json()) as {
      projectId?: number
      zone?: string
      backgroundFileId?: number | null
      backgroundOpacity?: number
    }
    const projectId = Number(body.projectId ?? 0)
    const zone = String(body.zone ?? '').trim()
    const backgroundFileId =
      body.backgroundFileId != null && Number.isFinite(Number(body.backgroundFileId)) && Number(body.backgroundFileId) > 0
        ? Math.floor(Number(body.backgroundFileId))
        : null
    const backgroundOpacity = Math.min(1, Math.max(0.05, Number(body.backgroundOpacity ?? 0.35) || 0.35))

    if (!projectId || Number.isNaN(projectId)) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (zone !== 'kitchen' && zone !== 'hall') {
      return NextResponse.json({ success: false, message: 'zone 값이 유효하지 않습니다.' }, { status: 400, headers })
    }

    const access = await assertInteriorProjectAccess(projectId, guard.scope)
    if (access !== 'ok') return interiorForbiddenResponse(headers)

    await supabaseUpsert(
      'interior_layout_editor_prefs',
      [
        stampSaasTenantId(
          {
            project_id: projectId,
            zone,
            user_key: ZONE_BG_KEY,
            user_store: '',
            user_name: 'zone-bg',
            employee_id: null,
            duplicate_offset_x: 0.5,
            duplicate_offset_y: 0.5,
            snap_enabled: true,
            snap_step: 0.5,
            nudge_small: 0.1,
            nudge_medium: 0.5,
            nudge_large: 1.0,
            background_file_id: backgroundFileId,
            background_opacity: backgroundOpacity,
            updated_at: new Date().toISOString(),
          },
          guard.scope,
          'interior_layout_editor_prefs'
        ),
      ],
      'project_id,zone,user_key'
    )

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('saveInteriorLayoutZoneBackground:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
