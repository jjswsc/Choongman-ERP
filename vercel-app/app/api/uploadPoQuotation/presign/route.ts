import { NextRequest, NextResponse } from 'next/server'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { STORAGE_FILENAME_SAFE } from '@/lib/storage-filename-safe'
import { requireAuth } from '@/lib/verify-auth'

const BUCKET = 'po-quotation-files'
const MAX_FILE_BYTES = 20 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = (await request.json()) as {
      fileName?: string
      contentType?: string
      fileSize?: number
    }

    const fileName = String(body.fileName || 'quotation').trim() || 'quotation'
    const contentType = String(body.contentType || '').toLowerCase().split(';')[0].trim()
    const fileSize = Number(body.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (fileSize > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, message: '첨부 파일은 20MB 이하여야 합니다.' },
        { status: 400, headers }
      )
    }
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { success: false, message: 'PDF, Word, 이미지, 엑셀, CSV만 업로드할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    const u =
      (auth.employeeId != null ? `e${auth.employeeId}` : '') ||
      `u_${String(auth.name || 'user')
        .replace(STORAGE_FILENAME_SAFE, '_')
        .slice(0, 40) || 'user'}`
    const safeName = fileName.replace(STORAGE_FILENAME_SAFE, '_').slice(0, 90) || 'quotation'
    const storagePath = `${u}/${Date.now()}-${safeName}`

    const issue = async () => {
      const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: true })
      const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)
      return { signedUrl, publicUrl }
    }

    let signedUrl: string
    let publicUrl: string
    try {
      ;({ signedUrl, publicUrl } = await issue())
    } catch (firstErr) {
      const fm = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (!looksLikeSupabaseStorageMissingBucketError(fm)) throw firstErr
      await supabaseStorageCreateBucketIfNeeded(BUCKET, {
        public: true,
        file_size_limit: MAX_FILE_BYTES,
        allowed_mime_types: Array.from(ALLOWED_TYPES),
      })
      ;({ signedUrl, publicUrl } = await issue())
    }

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath }, { headers })
  } catch (e) {
    console.error('uploadPoQuotation/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, message: '업로드 준비 실패: ' + msg },
      { status: 500, headers }
    )
  }
}
