import { NextRequest, NextResponse } from 'next/server'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { STORAGE_SEGMENT_SAFE } from '@/lib/storage-filename-safe'
import { isMarketingMaterialStoreScopedRole } from '@/lib/marketing-material-store-scope'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { requireAuth } from '@/lib/verify-auth'

const BUCKET = 'marketing-material-install-photos'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

function slugSegment(val: string, max = 60): string {
  return String(val || '')
    .replace(STORAGE_SEGMENT_SAFE, '_')
    .slice(0, max)
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  try {
    const body = (await request.json()) as {
      storeName?: string
      materialId?: string
      campaignId?: string
      fileName?: string
      contentType?: string
      fileSize?: number
    }

    const storeName = String(body.storeName || '').trim()
    const materialId = String(body.materialId || '').trim()
    const campaignId = String(body.campaignId || '').trim()
    if (!storeName || !materialId) {
      return NextResponse.json(
        { success: false, message: '매장과 홍보물 ID가 필요합니다.' },
        { status: 400, headers }
      )
    }

    const userRole = String(auth.role || '')
    const userStore = String(auth.store || '').trim()
    const isStoreScoped = isMarketingMaterialStoreScopedRole(userRole)
    if (isStoreScoped) {
      if (!userStore || !storesMatchForGradeLookup(userStore, storeName)) {
        return NextResponse.json(
          { success: false, message: '본인 매장 사진만 업로드할 수 있습니다.' },
          { status: 403, headers }
        )
      }
    }

    const fileSize = Number(body.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    const ct = String(body.contentType || '').toLowerCase().split(';')[0].trim()
    if (!IMAGE_TYPES.has(ct)) {
      return NextResponse.json(
        { success: false, message: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400, headers }
      )
    }
    if (fileSize > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { success: false, message: '이미지는 5MB 이하여야 합니다.' },
        { status: 400, headers }
      )
    }

    const storeSlug = slugSegment(storeName)
    const matSlug = slugSegment(materialId, 24)
    const campSlug = campaignId ? slugSegment(campaignId, 24) : 'no-campaign'
    const safeName = String(body.fileName || 'install.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80)
    const storagePath = `${storeSlug}/${campSlug}/${matSlug}/${Date.now()}-${safeName}`

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
          file_size_limit: MAX_IMAGE_BYTES,
          allowed_mime_types: Array.from(IMAGE_TYPES),
        })
        ;({ signedUrl, publicUrl } = await issue())
      } else {
        throw firstErr
      }
    }

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath }, { headers })
  } catch (e) {
    console.error('uploadMarketingMaterialInstallPhoto/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json(
        {
          success: false,
          message: '설치 사진 저장소가 설정되지 않았습니다.',
        },
        { status: 400, headers }
      )
    }
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
