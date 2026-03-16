import { NextRequest, NextResponse } from 'next/server'
import { supabaseStorageUpload } from '@/lib/supabase-server'

const BUCKET = 'pos-menu-images'

/** POS 메뉴 이미지 파일 업로드 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file || !file.size) {
      return NextResponse.json(
        { success: false, message: '파일을 선택해 주세요.' },
        { status: 400, headers }
      )
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, message: 'JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const timestamp = Date.now()
    const storagePath = `${timestamp}-${safeName}`

    const buffer = await file.arrayBuffer()
    const contentType = file.type || 'image/jpeg'

    const { publicUrl } = await supabaseStorageUpload(BUCKET, storagePath, buffer, {
      contentType,
      upsert: false,
    })

    return NextResponse.json({ success: true, message: '업로드되었습니다.', url: publicUrl }, { headers })
  } catch (e) {
    console.error('uploadPosMenuImage:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Bucket not found') || msg.includes('404') || msg.includes('does not exist')) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Supabase Storage 버킷 "pos-menu-images"를 먼저 생성하세요. (Supabase 대시보드 > Storage > New bucket)',
        },
        { status: 400, headers }
      )
    }
    return NextResponse.json(
      { success: false, message: '업로드 실패: ' + msg },
      { status: 500, headers }
    )
  }
}
