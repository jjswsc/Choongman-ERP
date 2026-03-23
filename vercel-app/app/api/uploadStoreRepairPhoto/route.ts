import { NextRequest, NextResponse } from 'next/server'
import { supabaseStorageUpload } from '@/lib/supabase-server'

const BUCKET = 'store-repair-photos'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])

/** 매장 수리 신고용 사진 업로드 (선택) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const formData = await request.formData()
    const store = String(formData.get('store') || '').trim()
    const file = formData.get('file') as File | null

    if (!store) {
      return NextResponse.json({ success: false, message: '매장(store)이 필요합니다.' }, { status: 400, headers })
    }
    if (!file || !file.size) {
      return NextResponse.json({ success: false, message: '파일을 선택하세요.' }, { status: 400, headers })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, message: '파일은 5MB 이하여야 합니다.' }, { status: 400, headers })
    }
    const ct = (file.type || '').toLowerCase().split(';')[0].trim()
    if (!ALLOWED.has(ct)) {
      return NextResponse.json({ success: false, message: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400, headers })
    }

    const storeSlug = store.replace(/[^a-zA-Z0-9._-가-힣]/g, '_').slice(0, 60)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const timestamp = Date.now()
    const storagePath = `${storeSlug}/${timestamp}-${safeName}`

    const buffer = await file.arrayBuffer()
    const { publicUrl } = await supabaseStorageUpload(BUCKET, storagePath, buffer, {
      contentType: ct || 'application/octet-stream',
      upsert: false,
    })

    return NextResponse.json({ success: true, url: publicUrl }, { headers })
  } catch (e) {
    console.error('uploadStoreRepairPhoto:', e)
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
    return NextResponse.json({ success: false, message: '업로드 실패: ' + msg }, { status: 500, headers })
  }
}
