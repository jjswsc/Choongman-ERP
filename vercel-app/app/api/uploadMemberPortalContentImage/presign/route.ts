import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { randomStorageObjectBasename } from '@/lib/storage-filename-safe'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = 'member-portal-content'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as { fileName?: string; contentType?: string; fileSize?: number }
    const fileName = String(body.fileName || 'image.jpg').trim()
    const contentType = String(body.contentType || '').trim().toLowerCase()
    const fileSize = Number(body.fileSize || 0)
    if (!ALLOWED_MIME.includes(contentType)) {
      return NextResponse.json({ success: false, message: 'JPG/PNG/WebP/GIF 이미지만 업로드할 수 있습니다.' }, { status: 400 })
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_BYTES) {
      return NextResponse.json({ success: false, message: '이미지는 5MB 이하만 업로드할 수 있습니다.' }, { status: 400 })
    }
    const objectPath = `content/${randomStorageObjectBasename(fileName)}`
    const issue = async () => {
      const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, objectPath, { upsert: false })
      return { signedUrl, publicUrl: supabaseStoragePublicUrl(BUCKET, objectPath) }
    }
    try {
      const { signedUrl, publicUrl } = await issue()
      return NextResponse.json({ success: true, signedUrl, publicUrl, objectPath })
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (!looksLikeSupabaseStorageMissingBucketError(msg)) throw firstErr
      await supabaseStorageCreateBucketIfNeeded(BUCKET, {
        public: true,
        file_size_limit: MAX_BYTES,
        allowed_mime_types: ALLOWED_MIME,
      })
      const { signedUrl, publicUrl } = await issue()
      return NextResponse.json({ success: true, signedUrl, publicUrl, objectPath })
    }
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '업로드 준비 실패' },
      { status: 500 }
    )
  }
}

