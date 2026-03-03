import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 파일 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_project_files',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'uploaded_at.desc', limit: 100 }
    )) as {
      id?: number
      project_id?: number
      file_type?: string
      file_name?: string
      file_path?: string
      file_size?: number
      uploaded_at?: string
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      fileType: String(r.file_type || '').trim(),
      fileName: String(r.file_name || '').trim(),
      filePath: String(r.file_path || '').trim(),
      fileSize: r.file_size ?? 0,
      uploadedAt: r.uploaded_at ? String(r.uploaded_at) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorFiles:', e)
    return NextResponse.json([], { headers })
  }
}
