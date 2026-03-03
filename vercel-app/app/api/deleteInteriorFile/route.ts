import { NextRequest, NextResponse } from 'next/server'
import { supabaseStorageDelete, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const BUCKET = 'interior-files'

/** 파일 삭제 (DB 레코드 + Storage 객체) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter(
      'interior_project_files',
      `id=eq.${id}`,
      { limit: 1 }
    )) as { id?: number; file_path?: string; project_id?: number }[]

    const row = rows?.[0]
    if (row?.file_path) {
      try {
        const url = row.file_path
        const match = url.match(/\/object\/public\/[^/]+\/(.+)$/)
        const objectPath = match ? decodeURIComponent(match[1]) : null
        if (objectPath) {
          await supabaseStorageDelete(BUCKET, objectPath)
        }
      } catch (_) {
        // Storage 삭제 실패해도 DB는 삭제
      }
    }

    await supabaseDeleteByFilter('interior_project_files', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteInteriorFile:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
