import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const ZONE_BG_KEY = '__zone_bg__'

/** 프로젝트·존별 공유 배경 도면 설정 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const projectId = Number(request.nextUrl.searchParams.get('projectId') || 0)
  const zone = String(request.nextUrl.searchParams.get('zone') || '').trim()
  if (!projectId || Number.isNaN(projectId)) return NextResponse.json({}, { headers })
  if (zone !== 'kitchen' && zone !== 'hall') return NextResponse.json({}, { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_layout_editor_prefs',
      `project_id=eq.${projectId}&zone=eq.${encodeURIComponent(zone)}&user_key=eq.${encodeURIComponent(ZONE_BG_KEY)}`,
      {
        select: 'background_file_id,background_opacity,updated_at',
        limit: 1,
      }
    )) as Array<{
      background_file_id?: number | null
      background_opacity?: number | null
      updated_at?: string
    }>

    const row = rows?.[0]
    if (!row) return NextResponse.json({}, { headers })
    return NextResponse.json(
      {
        backgroundFileId: row.background_file_id ?? null,
        backgroundOpacity: Number(row.background_opacity ?? 0.35),
        updatedAt: row.updated_at ?? null,
      },
      { headers }
    )
  } catch (e) {
    console.error('getInteriorLayoutZoneBackground:', e)
    return NextResponse.json({}, { headers })
  }
}
