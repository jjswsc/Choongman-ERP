import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(request: NextRequest) {
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

    const title = String(body?.title ?? '').trim()
    const content = String(body?.content ?? '').trim()
    if (!title) {
      return NextResponse.json({ success: false, message: '제목을 입력해 주세요.' }, { headers })
    }

    const patch: Record<string, unknown> = { title, content }
    if (body?.isUrgent != null) patch.is_urgent = Boolean(body.isUrgent)
    if (body?.expiresAt != null) {
      const ex = String(body.expiresAt || '').trim()
      patch.expires_at = ex ? ex : null
    }

    const existing = (await supabaseSelectFilter('notices', `id=eq.${id}`, {
      limit: 1,
      select: 'id,sender',
    })) as { id?: number; sender?: string }[]
    if (!existing?.[0]) {
      return NextResponse.json({ success: false, message: '공지를 찾을 수 없습니다.' }, { headers })
    }

    try {
      await supabaseUpdateByFilter('notices', `id=eq.${id}`, patch)
    } catch (colErr) {
      const msg = colErr instanceof Error ? colErr.message : String(colErr)
      if (/is_urgent|expires_at|column.*does not exist/i.test(msg)) {
        delete patch.is_urgent
        delete patch.expires_at
        await supabaseUpdateByFilter('notices', `id=eq.${id}`, { title, content })
      } else {
        throw colErr
      }
    }

    return NextResponse.json({ success: true, message: '공지가 수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('updateNoticeAdmin:', e)
    return NextResponse.json({ success: false, message: '수정 실패' }, { status: 500, headers })
  }
}
