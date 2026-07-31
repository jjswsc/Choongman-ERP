import { NextRequest, NextResponse } from 'next/server'
import {
  fileForCustomerDisplayMediaUpload,
  isCustomerDisplayImageContentType,
  isCustomerDisplayVideoContentType,
} from '@/lib/customer-display-media-upload'
import { supabaseStoragePublicUrl, supabaseStorageUpload } from '@/lib/supabase-server'

export const runtime = 'nodejs'

const BUCKET = 'pos-menu-images'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** Vercel body 한도 내로 서버 폴백은 이미지만 (동영상은 signed PUT) */
const MAX_SERVER_UPLOAD_BYTES = MAX_IMAGE_BYTES

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const form = await request.formData()
    const storeCode = String(form.get('storeCode') || '').trim()
    const preferredRaw = String(form.get('preferredKind') || '').trim().toLowerCase()
    const preferredKind: 'image' | 'video' | undefined =
      preferredRaw === 'video' ? 'video' : preferredRaw === 'image' ? 'image' : undefined
    const raw = form.get('file')
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode가 필요합니다.' }, { status: 400, headers })
    }
    if (!(raw instanceof File) || raw.size <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (raw.size > MAX_SERVER_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          message: '이미지는 4MB 이하만 업로드할 수 있습니다.',
        },
        { status: 400, headers }
      )
    }

    const prepared = fileForCustomerDisplayMediaUpload(raw, preferredKind)
    if (!prepared) {
      return NextResponse.json(
        {
          success: false,
          message: 'JPG, PNG, GIF, WebP 이미지 또는 MP4, WebM 동영상만 업로드할 수 있습니다.',
        },
        { status: 400, headers }
      )
    }
    const { file, contentType } = prepared
    if (!isCustomerDisplayImageContentType(contentType)) {
      return NextResponse.json(
        {
          success: false,
          message:
            isCustomerDisplayVideoContentType(contentType)
              ? '동영상은 직접 업로드(서명 URL)만 지원합니다. 다시 시도해 주세요.'
              : 'JPG, PNG, GIF, WebP 이미지만 서버 업로드할 수 있습니다.',
        },
        { status: 400, headers }
      )
    }

    const safeStore = storeCode.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'store'
    let safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!/\.(jpe?g|png|gif|webp)$/i.test(safeName)) {
      safeName +=
        contentType === 'image/png'
          ? '.png'
          : contentType === 'image/gif'
            ? '.gif'
            : contentType === 'image/webp'
              ? '.webp'
              : '.jpg'
    }
    const storagePath = `customer-display/${safeStore}/${Date.now()}-${safeName}`
    const bytes = await file.arrayBuffer()
    await supabaseStorageUpload(BUCKET, storagePath, bytes, {
      contentType,
      upsert: false,
    })
    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)
    return NextResponse.json({ success: true, url: publicUrl, storagePath, contentType }, { headers })
  } catch (e) {
    console.error('uploadCustomerDisplayMedia:', e)
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
    return NextResponse.json({ success: false, message: '업로드 실패: ' + msg }, { status: 500, headers })
  }
}
