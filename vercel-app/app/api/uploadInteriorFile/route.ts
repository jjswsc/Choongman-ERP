import { NextRequest, NextResponse } from 'next/server'
import { supabaseStorageUpload, supabaseInsert } from '@/lib/supabase-server'

const BUCKET = 'interior-files'

/** 도면/견적서 파일 업로드 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const formData = await request.formData()
    const projectId = formData.get('projectId')?.toString()?.trim()
    const fileType = (formData.get('fileType')?.toString() || 'drawing').trim()
    const file = formData.get('file') as File | null

    if (!projectId) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }
    if (!file || !file.size) {
      return NextResponse.json({ success: false, message: '파일을 선택하세요.' }, { status: 400, headers })
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const timestamp = Date.now()
    const storagePath = `${projectId}/${timestamp}-${safeName}`

    const buffer = await file.arrayBuffer()
    const contentType = file.type || 'application/octet-stream'

    const { publicUrl } = await supabaseStorageUpload(BUCKET, storagePath, buffer, {
      contentType,
      upsert: false,
    })

    await supabaseInsert('interior_project_files', {
      project_id: Number(projectId),
      file_type: fileType,
      file_name: file.name,
      file_path: publicUrl,
      file_size: file.size,
    })

    return NextResponse.json({ success: true, message: '업로드되었습니다.', url: publicUrl }, { headers })
  } catch (e) {
    console.error('uploadInteriorFile:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Bucket not found') || msg.includes('404') || msg.includes('does not exist')) {
      return NextResponse.json(
        { success: false, message: 'Supabase Storage 버킷 "interior-files"를 먼저 생성하세요. (Supabase 대시보드 > Storage)' },
        { status: 400, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: '업로드 실패: ' + msg },
      { status: 500, headers }
    )
  }
}
