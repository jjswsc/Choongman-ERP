import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseCreateSignedUploadUrl,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = 'interior-files'
/** 도면/PDF 등 — Vercel 경유 업로드 제한 완화용 상한 */
const MAX_BYTES = 40 * 1024 * 1024

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      projectId?: string | number
      fileName?: string
      fileSize?: number
      contentType?: string
    }
    const projectId = String(body.projectId ?? '').trim()
    if (!projectId) {
      return NextResponse.json({ success: false, message: 'projectId가 필요합니다.' }, { status: 400, headers })
    }

    const fileSize = Number(body.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (fileSize > MAX_BYTES) {
      return NextResponse.json(
        { success: false, message: `파일은 ${Math.floor(MAX_BYTES / (1024 * 1024))}MB 이하여야 합니다.` },
        { status: 400, headers }
      )
    }

    const safeName = String(body.fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${projectId}/${Date.now()}-${safeName}`

    const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: false })
    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath }, { headers })
  } catch (e) {
    console.error('uploadInteriorFile/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Bucket not found') || msg.includes('404') || msg.includes('does not exist')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Supabase Storage 버킷 "interior-files"를 먼저 생성하세요. (Supabase 대시보드 > Storage)',
        },
        { status: 400, headers }
      )
    }
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
