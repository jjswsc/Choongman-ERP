import { NextRequest, NextResponse } from 'next/server'
import {
  MEMBER_PORTAL_IMAGE_MIME_TYPES,
  normalizeMemberPortalImageContentType,
} from '@/lib/member-portal-image-upload'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'
import { randomStorageObjectBasename } from '@/lib/storage-filename-safe'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = 'member-portal-content'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set<string>(MEMBER_PORTAL_IMAGE_MIME_TYPES)

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as { fileName?: string; contentType?: string; fileSize?: number }
    const fileName = String(body.fileName || 'image.jpg').trim()
    const contentType = normalizeMemberPortalImageContentType(body.contentType)
    const fileSize = Number(body.fileSize || 0)
    if (!ALLOWED_MIME.has(contentType)) {
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
        allowed_mime_types: [...MEMBER_PORTAL_IMAGE_MIME_TYPES],
      })
      const { signedUrl, publicUrl } = await issue()
      return NextResponse.json({ success: true, signedUrl, publicUrl, objectPath })
    }
  } catch (e) {
    console.error('uploadMemberPortalContentImage/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Supabase Storage 버킷 "member-portal-content"를 확인하세요. (Supabase 대시보드 > Storage)',
        },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, message: msg || '업로드 준비 실패' },
      { status: 500 }
    )
  }
}

