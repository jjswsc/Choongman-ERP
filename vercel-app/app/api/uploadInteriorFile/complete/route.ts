import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseStoragePublicUrl } from '@/lib/supabase-server'

const BUCKET = 'interior-files'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      projectId?: string | number
      fileType?: string
      fileName?: string
      fileSize?: number
      storagePath?: string
    }
    const projectId = String(body.projectId ?? '').trim()
    const fileType = String(body.fileType ?? 'drawing').trim() || 'drawing'
    const fileName = String(body.fileName ?? '').trim()
    const storagePath = String(body.storagePath ?? '').trim()
    const fileSize = Number(body.fileSize)

    if (!projectId) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!fileName) {
      return NextResponse.json({ success: false, message: '파일명이 필요합니다.' }, { status: 400, headers })
    }
    if (!storagePath || !storagePath.startsWith(`${projectId}/`)) {
      return NextResponse.json({ success: false, message: '유효하지 않은 저장 경로입니다.' }, { status: 400, headers })
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }

    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)

    await supabaseInsert('interior_project_files', {
      project_id: Number(projectId),
      file_type: fileType,
      file_name: fileName,
      file_path: publicUrl,
      file_size: fileSize,
    })

    return NextResponse.json({ success: true, message: '업로드되었습니다.', url: publicUrl }, { headers })
  } catch (e) {
    console.error('uploadInteriorFile/complete:', e)
    return NextResponse.json(
      { success: false, message: '저장 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
