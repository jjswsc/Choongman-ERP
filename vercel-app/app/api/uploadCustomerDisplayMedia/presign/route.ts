import { NextRequest, NextResponse } from 'next/server'
import {
  CUSTOMER_DISPLAY_MEDIA_ERR,
  isCustomerDisplayImageContentType,
  isCustomerDisplayVideoContentType,
  normalizeCustomerDisplayMediaContentType,
} from '@/lib/customer-display-media-upload'
import {
  supabaseCreateSignedUploadUrl,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = 'pos-menu-images'
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      storeCode?: string
      fileName?: string
      contentType?: string
      fileSize?: number
    }
    const storeCode = String(body.storeCode || '').trim()
    if (!storeCode) {
      return NextResponse.json(
        { success: false, message: CUSTOMER_DISPLAY_MEDIA_ERR.STORE_REQUIRED, code: 'store_required' },
        { status: 400, headers }
      )
    }
    const fileName = String(body.fileName || 'file').trim() || 'file'
    const contentType = normalizeCustomerDisplayMediaContentType(body.contentType || 'application/octet-stream')
    const fileSize = Number(body.fileSize)

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json(
        { success: false, message: CUSTOMER_DISPLAY_MEDIA_ERR.FILE_REQUIRED, code: 'file_required' },
        { status: 400, headers }
      )
    }

    const isImage = isCustomerDisplayImageContentType(contentType)
    const isVideo = isCustomerDisplayVideoContentType(contentType)
    if (!isImage && !isVideo) {
      return NextResponse.json(
        {
          success: false,
          message: CUSTOMER_DISPLAY_MEDIA_ERR.TYPE_INVALID,
          code: 'type_invalid',
        },
        { status: 400, headers }
      )
    }
    const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
    if (fileSize > maxBytes) {
      return NextResponse.json(
        {
          success: false,
          message: isVideo
            ? CUSTOMER_DISPLAY_MEDIA_ERR.VIDEO_TOO_LARGE
            : CUSTOMER_DISPLAY_MEDIA_ERR.IMAGE_TOO_LARGE,
          code: isVideo ? 'video_too_large' : 'image_too_large',
        },
        { status: 400, headers }
      )
    }

    const safeStore = storeCode.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'store'
    let safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    if (!/\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(safeName)) {
      safeName += isVideo
        ? contentType === 'video/webm'
          ? '.webm'
          : '.mp4'
        : contentType === 'image/png'
          ? '.png'
          : contentType === 'image/gif'
            ? '.gif'
            : contentType === 'image/webp'
              ? '.webp'
              : '.jpg'
    }
    const storagePath = `customer-display/${safeStore}/${Date.now()}-${safeName}`

    const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: false })
    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)

    return NextResponse.json(
      { success: true, signedUrl, publicUrl, storagePath, contentType },
      { headers }
    )
  } catch (e) {
    console.error('uploadCustomerDisplayMedia/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Bucket not found') || msg.includes('404') || msg.includes('does not exist')) {
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
      {
        success: false,
        message: `${CUSTOMER_DISPLAY_MEDIA_ERR.UPLOAD_FAILED} ${msg}`,
        code: 'presign_failed',
      },
      { status: 500, headers }
    )
  }
}
