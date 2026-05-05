import { NextRequest, NextResponse } from 'next/server'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { STORAGE_SEGMENT_SAFE } from '@/lib/storage-filename-safe'
import { SUPABASE_STORAGE_SINGLE_FILE_MAX_BYTES } from '@/lib/supabase-storage-limits'

const BUCKET = 'store-repair-photos'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = SUPABASE_STORAGE_SINGLE_FILE_MAX_BYTES
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'])

const ALL_ALLOWED_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES])

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      store?: string
      fileName?: string
      contentType?: string
      fileSize?: number
    }
    const store = String(body.store || '').trim()
    if (!store) {
      return NextResponse.json({ success: false, message: '매장(store)이 필요합니다.' }, { status: 400, headers })
    }

    const fileSize = Number(body.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    const ct = String(body.contentType || '').toLowerCase().split(';')[0].trim()
    const maxForType = IMAGE_TYPES.has(ct) ? MAX_IMAGE_BYTES : VIDEO_TYPES.has(ct) ? MAX_VIDEO_BYTES : null
    if (maxForType == null) {
      return NextResponse.json(
        { success: false, message: '이미지 또는 동영상 파일만 업로드할 수 있습니다.' },
        { status: 400, headers }
      )
    }
    if (fileSize > maxForType) {
      const msg = VIDEO_TYPES.has(ct) ? '동영상은 50MB 이하여야 합니다.' : '이미지는 5MB 이하여야 합니다.'
      return NextResponse.json({ success: false, message: msg }, { status: 400, headers })
    }

    const storeSlug = store.replace(STORAGE_SEGMENT_SAFE, '_').slice(0, 60)
    const safeName = String(body.fileName || 'photo.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80)
    const storagePath = `${storeSlug}/${Date.now()}-${safeName}`

    const issue = async () => {
      const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: false })
      const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)
      return { signedUrl, publicUrl }
    }

    let signedUrl: string
    let publicUrl: string
    try {
      ;({ signedUrl, publicUrl } = await issue())
    } catch (firstErr) {
      const fm = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (looksLikeSupabaseStorageMissingBucketError(fm)) {
        await supabaseStorageCreateBucketIfNeeded(BUCKET, {
          public: true,
          file_size_limit: MAX_VIDEO_BYTES,
          allowed_mime_types: Array.from(ALL_ALLOWED_TYPES),
        })
        ;({ signedUrl, publicUrl } = await issue())
      } else {
        throw firstErr
      }
    }

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath }, { headers })
  } catch (e) {
    console.error('uploadStoreRepairPhoto/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json(
        {
          success: false,
          message: '수리 사진 저장소가 설정되지 않았습니다.',
        },
        { status: 400, headers }
      )
    }
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
