import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  isAllowedCompanyDocContentType,
  maxBytesForCompanyDocMime,
  COMPANY_DOCUMENTS_BUCKET,
  slugifyStoreForCompanyDocPath,
} from '@/lib/company-hybrid-documents'
import { canAccessStoreForCompanyHybridDocs } from '@/lib/company-hybrid-documents-access'
import { STORAGE_FILENAME_SAFE } from '@/lib/storage-filename-safe'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = COMPANY_DOCUMENTS_BUCKET

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
      store?: string
      fileName?: string
      contentType?: string
      fileSize?: number
    }
    const store = String(body?.store || '').trim()
    if (!store) {
      return NextResponse.json({ success: false, message: '매장(store)이 필요합니다.' }, { status: 400, headers })
    }
    if (!canAccessStoreForCompanyHybridDocs(auth, store)) {
      return NextResponse.json(
        { success: false, message: '이 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const fileName = String(body?.fileName || 'file').trim() || 'file'
    const contentType = String(body?.contentType || '').toLowerCase().split(';')[0].trim()
    const fileSize = Number(body?.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (!isAllowedCompanyDocContentType(contentType)) {
      return NextResponse.json(
        { success: false, message: 'PDF, Word, 엑셀, 이미지, 텍스트, CSV만 업로드할 수 있습니다.' },
        { status: 400, headers }
      )
    }
    const maxB = maxBytesForCompanyDocMime(contentType)
    if (fileSize > maxB) {
      return NextResponse.json(
        { success: false, message: `파일은 ${Math.floor(maxB / (1024 * 1024))}MB 이하여야 합니다.` },
        { status: 400, headers }
      )
    }

    const storeSlug = slugifyStoreForCompanyDocPath(store)
    const safeName = fileName.replace(STORAGE_FILENAME_SAFE, '_').slice(0, 120) || 'file'
    const storagePath = `hybrid/${storeSlug}/${Date.now()}-${safeName}`

    const issue = async () => {
      const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: false })
      const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)
      return { signedUrl, publicUrl }
    }

    const ALLOWED_ARR: string[] = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ]

    let signedUrl: string
    let publicUrl: string
    try {
      ;({ signedUrl, publicUrl } = await issue())
    } catch (firstErr) {
      const fm = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (!looksLikeSupabaseStorageMissingBucketError(fm)) throw firstErr
      await supabaseStorageCreateBucketIfNeeded(BUCKET, {
        public: true,
        file_size_limit: maxB,
        allowed_mime_types: ALLOWED_ARR,
      })
      ;({ signedUrl, publicUrl } = await issue())
    }

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath, bucket: BUCKET }, { headers })
  } catch (e) {
    console.error('uploadCompanyHybridDocument/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json(
        { success: false, message: 'Storage 버킷(company-documents) 생성 또는 권한을 확인하세요.' },
        { status: 400, headers }
      )
    }
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
