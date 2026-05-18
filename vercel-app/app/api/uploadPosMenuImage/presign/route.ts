import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseCreateSignedUploadUrl,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { buildPosMenuImageStorageObjectName } from '@/lib/pos-menu-image-storage-path'

const BUCKET = 'pos-menu-images'
const MAX_FILE_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      fileName?: string
      contentType?: string
      fileSize?: number
      /** 있으면 Storage 파일명에 포함 → 나중에 메뉴 id 로 복구·검증 가능 */
      menuId?: number | string
    }
    const fileName = String(body.fileName || 'image.jpg').trim() || 'image.jpg'
    const contentType = String(body.contentType || 'image/jpeg').toLowerCase().split(';')[0].trim()
    const fileSize = Number(body.fileSize)

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (fileSize > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          message:
            '파일이 너무 큽니다. 4MB 이하 이미지를 사용하거나 URL로 등록해 주세요. (자동 압축 후 다시 시도해 주세요)',
        },
        { status: 400, headers }
      )
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { success: false, message: 'JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    const menuIdNum = Math.floor(Number(body.menuId))
    const storagePath =
      Number.isFinite(menuIdNum) && menuIdNum > 0
        ? buildPosMenuImageStorageObjectName(menuIdNum, fileName)
        : `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

    const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: false })
    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)

    return NextResponse.json(
      { success: true, signedUrl, publicUrl, storagePath },
      { headers }
    )
  } catch (e) {
    console.error('uploadPosMenuImage/presign:', e)
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
