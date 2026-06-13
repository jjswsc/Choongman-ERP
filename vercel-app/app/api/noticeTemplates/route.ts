import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelect,
} from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const rows = (await supabaseSelect('notice_templates', {
      order: 'created_at.desc',
      limit: 50,
      select: 'id,title,content,created_by,created_at',
    })) as {
      id?: number
      title?: string
      content?: string
      created_by?: string
      created_at?: string
    }[]

    return NextResponse.json(
      {
        success: true,
        items: (rows || []).map((r) => ({
          id: Number(r.id),
          title: String(r.title || ''),
          content: String(r.content || ''),
          createdBy: String(r.created_by || ''),
          createdAt: r.created_at ? String(r.created_at) : '',
        })),
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/notice_templates|does not exist/i.test(msg)) {
      return NextResponse.json({ success: true, items: [] }, { headers })
    }
    console.error('noticeTemplates GET:', e)
    return NextResponse.json({ success: false, items: [] }, { status: 500, headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  try {
    const body = await request.json()
    const title = String(body?.title ?? '').trim()
    const content = String(body?.content ?? '').trim()
    if (!title) {
      return NextResponse.json({ success: false, message: '제목을 입력해 주세요.' }, { headers })
    }

    const id = Date.now()
    await supabaseInsert('notice_templates', {
      id,
      title,
      content,
      created_by: String(auth.name || '').trim(),
    })

    return NextResponse.json({ success: true, message: '템플릿이 저장되었습니다.', id }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/notice_templates|does not exist/i.test(msg)) {
      return NextResponse.json(
        { success: false, message: 'notice_templates 테이블이 없습니다. SQL 마이그레이션을 실행해 주세요.' },
        { headers }
      )
    }
    console.error('noticeTemplates POST:', e)
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500, headers })
  }
}

export async function DELETE(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const body = await request.json()
    const id = Number(body?.id)
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: 'Invalid id' }, { headers })
    }
    await supabaseDeleteByFilter('notice_templates', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('noticeTemplates DELETE:', e)
    return NextResponse.json({ success: false, message: '삭제 실패' }, { status: 500, headers })
  }
}
