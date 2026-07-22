import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantRead,
} from '@/lib/interior-tenant-guard'
import { isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'

function buildUserKey(userStore: string, userName: string, employeeId?: number | null) {
  if (employeeId && Number.isFinite(employeeId) && employeeId > 0) return `eid:${Math.floor(employeeId)}`
  return `store:${userStore}::user:${userName}`
}

/** 프로젝트/존/사용자별 레이아웃 편집 기본값 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const guard = await requireInteriorTenantRead(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return guard.errorResponse
  }

  const auth = guard.auth
  const projectId = Number(request.nextUrl.searchParams.get('projectId') || 0)
  const zone = String(request.nextUrl.searchParams.get('zone') || '').trim()
  const userStore = String(auth.store || '').trim()
  const userName = String(auth.name || '').trim()
  const employeeIdFromAuth = Number((auth as { employeeId?: unknown }).employeeId)
  const employeeId = Number.isFinite(employeeIdFromAuth) ? employeeIdFromAuth : null

  if (!projectId || Number.isNaN(projectId)) return NextResponse.json({}, { headers })
  if (zone !== 'kitchen' && zone !== 'hall') return NextResponse.json({}, { headers })
  if (!userStore || !userName) return NextResponse.json({}, { headers })
  if (isSaasTenantQueryBlocked(guard.scope, 'interior_projects')) return NextResponse.json({}, { headers })

  const access = await assertInteriorProjectAccess(projectId, guard.scope)
  if (access === 'forbidden') return interiorForbiddenResponse(headers)
  if (access === 'not_found') return NextResponse.json({}, { headers })

  const userKey = buildUserKey(userStore, userName, employeeId)
  try {
    const rows = (await supabaseSelectFilter(
      'interior_layout_editor_prefs',
      `project_id=eq.${projectId}&zone=eq.${encodeURIComponent(zone)}&user_key=eq.${encodeURIComponent(userKey)}`,
      {
        select: 'duplicate_offset_x,duplicate_offset_y,snap_enabled,snap_step,nudge_small,nudge_medium,nudge_large,updated_at',
        limit: 1,
      }
    )) as Array<{
      duplicate_offset_x?: number
      duplicate_offset_y?: number
      snap_enabled?: boolean
      snap_step?: number
      nudge_small?: number
      nudge_medium?: number
      nudge_large?: number
      updated_at?: string
    }>

    const row = rows?.[0]
    if (!row) return NextResponse.json({}, { headers })
    return NextResponse.json(
      {
        duplicateOffsetX: Number(row.duplicate_offset_x ?? 0.5),
        duplicateOffsetY: Number(row.duplicate_offset_y ?? 0.5),
        snapEnabled: row.snap_enabled !== false,
        snapStep: Number(row.snap_step ?? 0.5),
        nudgeSmall: Number(row.nudge_small ?? 0.1),
        nudgeMedium: Number(row.nudge_medium ?? 0.5),
        nudgeLarge: Number(row.nudge_large ?? 1.0),
        updatedAt: row.updated_at ?? null,
      },
      { headers }
    )
  } catch (e) {
    console.error('getInteriorLayoutEditorPrefs:', e)
    return NextResponse.json({}, { headers })
  }
}
