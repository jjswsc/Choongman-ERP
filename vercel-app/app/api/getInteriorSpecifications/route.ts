import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 사양서 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_specifications',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'id.asc', limit: 200 }
    )) as {
      id?: number
      project_id?: number
      description?: string
      code?: string
      size?: string
      supplier_code?: string
      location?: string
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      description: String(r.description || '').trim(),
      code: String(r.code || '').trim(),
      size: String(r.size || '').trim(),
      supplierCode: String(r.supplier_code || '').trim(),
      location: String(r.location || '').trim(),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorSpecifications:', e)
    return NextResponse.json([], { headers })
  }
}
