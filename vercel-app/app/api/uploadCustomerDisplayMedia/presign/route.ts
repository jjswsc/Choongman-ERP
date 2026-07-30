import { NextRequest, NextResponse } from 'next/server'
import {
  isCustomerDisplayImageContentType,
  isCustomerDisplayVideoContentType,
  normalizeCustomerDisplayMediaContentType,
} from '@/lib/customer-display-media-upload'
import {
  supabaseCreateSignedUploadUrl,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = 'pos-menu-images'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      storeCode?: string
      fileName?: string
      contentType?: string
      fileSize?: number
    }
    const storeCode = String(body.storeCode || '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode가 필요합니다.' }, { status: 400, headers })
    }
    const fileName = String(body.fileName || 'file').trim() || 'file'
    const contentType = normalizeCustomerDisplayMediaContentType(body.contentType || 'application/octet-stream')
    const fileSize = Number(body.fileSize)

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }

    const isImage = isCustomerDisplayImageContentType(contentType)
    const isVideo = isCustomerDisplayVideoContentType(contentType)
    if (!isImage && !isVideo) {
      return NextResponse.json(
        {
          success: false,
          message: 'JPG, PNG, GIF, WebP 이미지 또는 MP4, WebM 동영상만 업로드할 수 있습니다.',
        },
        { status: 400, headers }
      )
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (fileSize > maxBytes) {
      return NextResponse.json(
        {
          success: false,
          message: isVideo
            ? '동영상은 50MB 이하만 업로드할 수 있습니다.'
            : '이미지는 4MB 이하만 업로드할 수 있습니다.',
        },
        { status: 400, headers }
      )
    }

    const safeStore = storeCode.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'store'
    let safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!/\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(safeName)) {
      safeName += isVideo ? (contentType === 'video/webm' ? '.webm' : '.mp4') : contentType === 'image/png' ? '.png' : contentType === 'image/gif' ? '.gif' : contentType === 'image/webp' ? '.webp' : '.jpg'
    }
    const storagePath = `customer-display/${safeStore}/${Date.now()}-${safeName}`

    const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: false })
    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)

    return NextResponse.json(
      { success: true, signedUrl, publicUrl, storagePath, contentType },
      { headers }
    )
  } catch (e) {
    console.error('uploadCustomerDisplayMedia/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Bucket not found') || msg.includes('404') || msg.includes('does not exist')) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Supabase Storage 버킷 "pos-menu-images"를 먼저 생성하세요. (Supabase 대시보드 > Storage > New bucket)',
        },
        { status: 400, headers }
      )
    }
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
