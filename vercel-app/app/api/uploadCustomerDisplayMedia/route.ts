import { NextRequest, NextResponse } from 'next/server'
import {
  CUSTOMER_DISPLAY_IMAGE_MIME_TYPES,
  CUSTOMER_DISPLAY_MEDIA_ERR,
  CUSTOMER_DISPLAY_VIDEO_MIME_TYPES,
  isCustomerDisplayImageContentType,
  isCustomerDisplayVideoContentType,
  prepareCustomerDisplayMediaUpload,
} from '@/lib/customer-display-media-upload'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
  supabaseStorageUpload,
} from '@/lib/supabase-server'

export const runtime = 'nodejs'

const BUCKET = 'pos-menu-images'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
/** Vercel body 한도 내로 서버 폴백은 이미지만 (동영상은 signed PUT) */
const MAX_SERVER_UPLOAD_BYTES = MAX_IMAGE_BYTES
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const BUCKET_MIME_TYPES = [
  ...CUSTOMER_DISPLAY_IMAGE_MIME_TYPES,
  ...CUSTOMER_DISPLAY_VIDEO_MIME_TYPES,
]

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const form = await request.formData()
    const storeCode = String(form.get('storeCode') || '').trim()
    const preferredRaw = String(form.get('preferredKind') || '').trim().toLowerCase()
    const preferredKind: 'image' | 'video' | undefined =
      preferredRaw === 'video' ? 'video' : preferredRaw === 'image' ? 'image' : undefined
    const raw = form.get('file')
    if (!storeCode) {
      return NextResponse.json(
        { success: false, message: CUSTOMER_DISPLAY_MEDIA_ERR.STORE_REQUIRED, code: 'store_required' },
        { status: 400, headers }
      )
    }
    if (!(raw instanceof File) || raw.size <= 0) {
      return NextResponse.json(
        { success: false, message: CUSTOMER_DISPLAY_MEDIA_ERR.FILE_REQUIRED, code: 'file_required' },
        { status: 400, headers }
      )
    }
    if (raw.size > MAX_SERVER_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          message: CUSTOMER_DISPLAY_MEDIA_ERR.IMAGE_TOO_LARGE,
          code: 'image_too_large',
        },
        { status: 400, headers }
      )
    }

    const prepared = await prepareCustomerDisplayMediaUpload(raw, preferredKind)
    if (!prepared.ok) {
      return NextResponse.json(
        {
          success: false,
          message: prepared.message,
          code: prepared.code,
        },
        { status: 400, headers }
      )
    }
    const { file, contentType } = prepared
    if (!isCustomerDisplayImageContentType(contentType)) {
      return NextResponse.json(
        {
          success: false,
          message: isCustomerDisplayVideoContentType(contentType)
            ? CUSTOMER_DISPLAY_MEDIA_ERR.VIDEO_SERVER_UNSUPPORTED
            : CUSTOMER_DISPLAY_MEDIA_ERR.TYPE_INVALID,
          code: 'type_invalid',
        },
        { status: 400, headers }
      )
    }

    const safeStore = storeCode.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'store'
    let safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!/\.(jpe?g|png|gif|webp)$/i.test(safeName)) {
      safeName +=
        contentType === 'image/png'
          ? '.png'
          : contentType === 'image/gif'
            ? '.gif'
            : contentType === 'image/webp'
              ? '.webp'
              : '.jpg'
    }
    const storagePath = `customer-display/${safeStore}/${Date.now()}-${safeName}`
    const bytes = await file.arrayBuffer()
    const doUpload = () =>
      supabaseStorageUpload(BUCKET, storagePath, bytes, {
        contentType,
        upsert: false,
      })
    try {
      await doUpload()
    } catch (firstErr) {
      const fm = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (!looksLikeSupabaseStorageMissingBucketError(fm)) throw firstErr
      await supabaseStorageCreateBucketIfNeeded(BUCKET, {
        public: true,
        file_size_limit: MAX_VIDEO_BYTES,
        allowed_mime_types: [...BUCKET_MIME_TYPES],
      })
      await doUpload()
    }
    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)
    return NextResponse.json({ success: true, url: publicUrl, storagePath, contentType }, { headers })
  } catch (e) {
    console.error('uploadCustomerDisplayMedia:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json(
        {
          success: false,
          message: CUSTOMER_DISPLAY_MEDIA_ERR.BUCKET_MISSING,
          code: 'bucket_missing',
        },
        { status: 400, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: `${CUSTOMER_DISPLAY_MEDIA_ERR.UPLOAD_FAILED} ${msg}`, code: 'upload_failed' },
      { status: 500, headers }
    )
  }
}
