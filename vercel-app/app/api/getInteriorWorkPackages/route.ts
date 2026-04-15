import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

type WorkPackageRow = {
  id?: number
  project_id?: number
  part_type?: string
  title?: string
  description?: string
  start_date?: string
  end_date?: string
  status?: string
  progress_pct?: number
  color?: string
  sort_order?: number
}

type LegacyScheduleRow = {
  id?: number
  project_id?: number
  work_detail?: string
  start_date?: string
  end_date?: string
  sort_order?: number
}

/** 프로젝트 공정 패키지 조회 (신규 테이블 우선 + 기존 일정 fallback) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_work_packages',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'sort_order.asc,id.asc', limit: 500 }
    )) as WorkPackageRow[]

    const mapped = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      partType: String(r.part_type || '').trim(),
      title: String(r.title || '').trim(),
      description: String(r.description || '').trim(),
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
      status: String(r.status || 'planned'),
      progressPct: Number(r.progress_pct ?? 0),
      color: String(r.color || '').trim(),
      sortOrder: Number(r.sort_order ?? 0),
    }))

    if (mapped.length > 0) return NextResponse.json(mapped, { headers })

    const legacyRows = (await supabaseSelectFilter(
      'interior_schedule_items',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'sort_order.asc,item_no.asc,id.asc', limit: 500 }
    )) as LegacyScheduleRow[]

    const fallback = (legacyRows || []).map((r) => ({
      id: undefined,
      legacyId: r.id,
      projectId: r.project_id,
      partType: '기타',
      title: String(r.work_detail || '').trim(),
      description: '',
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : null,
      endDate: r.end_date ? String(r.end_date).slice(0, 10) : null,
      status: 'planned',
      progressPct: 0,
      color: '',
      sortOrder: Number(r.sort_order ?? 0),
      isLegacy: true,
    }))

    return NextResponse.json(fallback, { headers })
  } catch (e) {
    console.error('getInteriorWorkPackages:', e)
    return NextResponse.json([], { headers })
  }
}
