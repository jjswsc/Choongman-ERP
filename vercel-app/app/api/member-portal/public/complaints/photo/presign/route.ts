import { NextRequest, NextResponse } from 'next/server'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { PUBLIC_COMPLAINT_PHOTO_BUCKET } from '@/lib/member-portal-public-complaint'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileName?: string
      contentType?: string
      fileSize?: number
    }

    const fileSize = Number(body.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: 'file_size_required' }, { status: 400 })
    }

    const ct = String(body.contentType || '').toLowerCase().split(';')[0].trim()
    if (!IMAGE_TYPES.has(ct)) {
      return NextResponse.json({ success: false, message: 'image_only' }, { status: 400 })
    }
    if (fileSize > MAX_IMAGE_BYTES) {
      return NextResponse.json({ success: false, message: 'file_too_large' }, { status: 400 })
    }

    const safeName = String(body.fileName || 'photo.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80)
    const storagePath = `public/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`

    const issue = async () => {
      const { signedUrl } = await supabaseCreateSignedUploadUrl(PUBLIC_COMPLAINT_PHOTO_BUCKET, storagePath, {
        upsert: false,
      })
      const publicUrl = supabaseStoragePublicUrl(PUBLIC_COMPLAINT_PHOTO_BUCKET, storagePath)
      return { signedUrl, publicUrl }
    }

    let signedUrl: string
    let publicUrl: string
    try {
      ;({ signedUrl, publicUrl } = await issue())
    } catch (firstErr) {
      const fm = firstErr instanceof Error ? firstErr.message : String(firstErr)
      if (looksLikeSupabaseStorageMissingBucketError(fm)) {
        await supabaseStorageCreateBucketIfNeeded(PUBLIC_COMPLAINT_PHOTO_BUCKET, {
          public: true,
          file_size_limit: MAX_IMAGE_BYTES,
          allowed_mime_types: Array.from(IMAGE_TYPES),
        })
        ;({ signedUrl, publicUrl } = await issue())
      } else {
        throw firstErr
      }
    }

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath })
  } catch (e) {
    console.error('member-portal/public/complaints/photo/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json({ success: false, message: 'storage_not_configured' }, { status: 400 })
    }
    return NextResponse.json({ success: false, message: 'presign_failed' }, { status: 500 })
  }
}
