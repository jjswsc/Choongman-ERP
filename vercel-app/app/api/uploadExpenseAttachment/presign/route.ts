import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { randomStorageObjectBasename } from '@/lib/storage-filename-safe'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { buildSaasStorageObjectPath } from '@/lib/saas-storage-path'
import { normalizeTenantId } from '@/lib/tenant-context'

const BUCKET = 'expense-attachments'
const MAX_FILE_BYTES = 1.5 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

function effectiveMime(fileName: string, contentType: string): string {
  const raw = String(contentType || '')
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (raw && ALLOWED_TYPES.has(raw)) return raw
  const n = String(fileName || '').toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (/\.(jpe?g)$/.test(n)) return 'image/jpeg'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.gif')) return 'image/gif'
  return raw || 'application/octet-stream'
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
    const fileName = String(body?.fileName || 'attachment').trim() || 'attachment'
    const mime = effectiveMime(fileName, String(body?.contentType || ''))
    const fileSize = Number(body?.fileSize)

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (fileSize > MAX_FILE_BYTES) {
      return NextResponse.json(
        { success: false, message: '첨부 파일은 1.5MB 이하여야 합니다.' },
        { status: 400, headers }
      )
    }
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        { success: false, message: '이미지·PDF만 첨부할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    const storagePath = buildSaasStorageObjectPath({
      tenantId: normalizeTenantId(authResult.auth.tenantId),
      segments: ['accruals', authResult.auth.store || 'office', randomStorageObjectBasename(fileName)],
    })

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
    console.error('uploadExpenseAttachment/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
