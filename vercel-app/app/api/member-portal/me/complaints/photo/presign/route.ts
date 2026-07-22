import { NextRequest, NextResponse } from 'next/server'
import {
  looksLikeSupabaseStorageMissingBucketError,
  supabaseCreateSignedUploadUrl,
  supabaseStorageCreateBucketIfNeeded,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'
import { requireMemberSessionWithTenant } from '@/lib/member-portal-session'
import { buildSaasStorageObjectPath } from '@/lib/saas-storage-path'

const BUCKET = 'complaint-photos'
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
  const session = await requireMemberSessionWithTenant(request)
  if (session.error) return session.error

  const memberId = Number(session.member?.id || 0)
  if (!memberId) {
    return NextResponse.json({ success: false, message: 'member_not_found' }, { status: 404 })
  }

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
    const storagePath = buildSaasStorageObjectPath({
      tenantId: session.tenantScope.tenantId,
      segments: ['member', String(memberId), `${Date.now()}-${safeName}`],
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

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath })
  } catch (e) {
    console.error('member-portal/me/complaints/photo/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (looksLikeSupabaseStorageMissingBucketError(msg)) {
      return NextResponse.json({ success: false, message: 'storage_not_configured' }, { status: 400 })
    }
    return NextResponse.json({ success: false, message: 'presign_failed' }, { status: 500 })
  }
}
