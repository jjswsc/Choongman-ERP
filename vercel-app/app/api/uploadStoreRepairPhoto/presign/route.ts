import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseCreateSignedUploadUrl,
  supabaseStoragePublicUrl,
} from '@/lib/supabase-server'

const BUCKET = 'store-repair-photos'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      store?: string
      fileName?: string
      contentType?: string
      fileSize?: number
    }
    const store = String(body.store || '').trim()
    if (!store) {
      return NextResponse.json({ success: false, message: '매장(store)이 필요합니다.' }, { status: 400, headers })
    }

    const fileSize = Number(body.fileSize)
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: '파일 크기가 필요합니다.' }, { status: 400, headers })
    }
    if (fileSize > MAX_BYTES) {
      return NextResponse.json({ success: false, message: '파일은 5MB 이하여야 합니다.' }, { status: 400, headers })
    }

    const ct = String(body.contentType || '').toLowerCase().split(';')[0].trim()
    if (!ALLOWED.has(ct)) {
      return NextResponse.json({ success: false, message: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400, headers })
    }

    const storeSlug = store.replace(/[^a-zA-Z0-9._-가-힣]/g, '_').slice(0, 60)
    const safeName = String(body.fileName || 'photo.jpg')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80)
    const storagePath = `${storeSlug}/${Date.now()}-${safeName}`

    const { signedUrl } = await supabaseCreateSignedUploadUrl(BUCKET, storagePath, { upsert: false })
    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)

    return NextResponse.json({ success: true, signedUrl, publicUrl, storagePath }, { headers })
  } catch (e) {
    console.error('uploadStoreRepairPhoto/presign:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Bucket not found') || msg.includes('404') || msg.includes('does not exist')) {
      return NextResponse.json(
        {
          success: false,
          message: 'Supabase Storage 버킷 "store-repair-photos"를 먼저 생성하세요. (vercel-app/sql/store_repair_tickets.sql 안내)',
        },
        { status: 400, headers }
      )
    }
    return NextResponse.json({ success: false, message: '업로드 준비 실패: ' + msg }, { status: 500, headers })
  }
}
