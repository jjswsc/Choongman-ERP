import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  isAllowedNoticeContentType,
  maxBytesForNoticeMime,
  MAX_NOTICE_NON_VIDEO_BYTES,
  MAX_NOTICE_VIDEO_BYTES,
} from '@/lib/notice-attachments'
import { randomStorageObjectBasename, STORAGE_SEGMENT_SAFE } from '@/lib/storage-filename-safe'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = 'notice-attachments'

const ALL_ALLOWED_MIME: string[] = (() => {
  const s = new Set<string>()
  s.add('image/jpeg')
  s.add('image/png')
  s.add('image/gif')
  s.add('image/webp')
  s.add('image/heic')
  s.add('image/heif')
  s.add('application/pdf')
  s.add('application/msword')
  s.add('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  s.add('application/vnd.ms-excel')
  s.add('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  s.add('text/plain')
  s.add('text/csv')
  s.add('video/mp4')
  s.add('video/quicktime')
  s.add('video/webm')
  s.add('video/3gpp')
  s.add('video/x-msvideo')
  s.add('video/mpeg')
  s.add('video/ogg')
  s.add('application/octet-stream')
  return Array.from(s)
})()

function slugifyStore(store: string) {
  return String(store || '')
    .replace(STORAGE_SEGMENT_SAFE, '_')
    .slice(0, 60)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      const er = authResult.errorResponse
      er.headers.set('Access-Control-Allow-Origin', '*')
      return er
    }
    const body = (await request.json()) as {
      fileName?: string
      contentType?: string
      fileSize?: number
    }
    const fileName = String(body?.fileName || 'file')
    const contentType = String(body?.contentType || '')
    const fileSize = Number(body?.fileSize)

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json(
        { success: false, message: '파일 크기가 필요합니다.' },
        { status: 400, headers }
      )
    }

    if (!isAllowedNoticeContentType(contentType)) {
      return NextResponse.json(
        { success: false, message: '이미지·PDF·문서·동영상만 첨부할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    const maxB = maxBytesForNoticeMime(contentType)
    if (fileSize > maxB) {
      const m = contentType.toLowerCase().split(';')[0].trim()
      const msg = m.startsWith('video/')
        ? '동영상은 50MB 이하여야 합니다.'
        : '이미지·PDF·문서는 파일당 5MB 이하여야 합니다.'
      return NextResponse.json({ success: false, message: msg }, { status: 400, headers })
    }

    const storeSlug = slugifyStore(authResult.auth.store)
    const storagePath = `notices/${storeSlug}/${randomStorageObjectBasename(fileName)}`

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
          file_size_limit: Math.max(MAX_NOTICE_NON_VIDEO_BYTES, MAX_NOTICE_VIDEO_BYTES),
          allowed_mime_types: ALL_ALLOWED_MIME,
        })
        ;({ signedUrl, publicUrl } = await issue())
      } else {
        throw firstErr
      }
    }

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath }, { headers })
  } catch (e) {
    console.error('uploadNoticeAttachment/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json(
        { success: false, message: '공지 첨부 저장소가 설정되지 않았습니다. 관리자에게 문의하세요.' },
        { status: 400, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: '업로드 준비 실패: ' + msg },
      { status: 500, headers }
    )
  }
}
