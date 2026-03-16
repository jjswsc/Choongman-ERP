import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { processLineCrmImport } from '@/lib/line-crm-import'

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  try {
    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, message: 'multipart/form-data 형식이 필요합니다.' }, { headers })
    }
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ success: false, message: 'file 필드가 필요합니다.' }, { headers })
    }

    const result = await processLineCrmImport({
      fileName: file.name,
      fileBuffer: await file.arrayBuffer(),
      createdBy: String(authRes.auth?.name || '').trim() || undefined,
    })

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('POST /api/members/line-import:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'LINE CRM 파일 가져오기에 실패했습니다.',
      },
      { headers }
    )
  }
}
