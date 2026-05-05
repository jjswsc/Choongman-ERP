import { NextRequest, NextResponse } from 'next/server'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { STORAGE_SEGMENT_SAFE } from '@/lib/storage-filename-safe'
import { canCreateRegistryForStore } from '@/lib/warning-letter-registry-permissions'

const BUCKET = 'employee-warning-letters'
const MAX_FILE_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

function slugStore(s: string): string {
  return String(s || '')
    .trim()
    .replace(STORAGE_SEGMENT_SAFE, '_')
    .slice(0, 80) || 'unknown'
}

/** 직접 등록 경고서 첨부 — 서명 URL 발급 후 클라이언트가 PUT 업로드 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request)
    if (!auth) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401, headers })
    }

    const body = (await request.json()) as {
      storeName?: string
      store_name?: string
      fileName?: string
      contentType?: string
      fileSize?: number
    }

    const storeName = String(body.storeName || body.store_name || '').trim()
    if (!storeName) {
      return NextResponse.json({ success: false, message: 'storeName required' }, { status: 400, headers })
    }
    if (!canCreateRegistryForStore(auth, storeName)) {
      return NextResponse.json({ success: false, message: '해당 매장에 첨부할 권한이 없습니다.' }, { status: 403, headers })
    }

    const fileName = String(body.fileName || 'attachment').trim() || 'attachment'
    const contentType = String(body.contentType || '').toLowerCase().split(';')[0].trim()
    const fileSize = Number(body.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (fileSize > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, message: '첨부 파일은 15MB 이하여야 합니다.' },
        { status: 400, headers }
      )
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { success: false, message: 'PDF 또는 이미지(JPEG, PNG, WebP, GIF)만 업로드할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90) || 'file'
    const objectPath = `${slugStore(storeName)}/${Date.now()}-${safeName}`

    const issue = async () => {
      const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, objectPath, { upsert: false })
      const publicUrl = supabaseStoragePublicUrl(BUCKET, objectPath)
      return { signedUrl, publicUrl, storagePath: objectPath }
    }

    let signedUrl: string
    let publicUrl: string
    let storagePath: string
    try {
      ;({ signedUrl, publicUrl, storagePath } = await issue())
    } catch (firstErr) {
      const fm = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (!looksLikeSupabaseStorageMissingBucketError(fm)) throw firstErr
      await supabaseStorageCreateBucketIfNeeded(BUCKET, {
        public: true,
        file_size_limit: MAX_FILE_BYTES,
        allowed_mime_types: Array.from(ALLOWED_TYPES),
      })
      ;({ signedUrl, publicUrl, storagePath } = await issue())
    }

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath }, { headers })
  } catch (e) {
    console.error('uploadWarningLetterRegistry/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
