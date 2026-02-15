import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await request.json()
    const title = String(body?.title || '').trim()
    const content = String(body?.content || '').trim()
    let targetStore = String(body?.targetStore ?? body?.target_store ?? '전체').trim()
    const targetRole = String(body?.targetRole ?? body?.target_role ?? '전체').trim()
    const sender = String(body?.sender || '').trim()
    const targetRecipients = body?.targetRecipients ?? body?.target_recipients
    const userStore = String(body?.userStore ?? body?.user_store ?? '').trim()
    const userRole = String(body?.userRole ?? body?.user_role ?? '').toLowerCase()

    if (!title) {
      return NextResponse.json(
        { success: false, message: '제목을 입력해 주세요.' },
        { headers }
      )
    }

    // 매장 매니저는 자기 매장에만 발송 가능
    const isManager = userRole === 'manager'
    if (isManager && userStore) {
      if (targetStore === '전체') targetStore = userStore
      const allowed = targetStore === userStore
      if (!allowed) {
        return NextResponse.json(
          { success: false, message: '매장 매니저는 해당 매장에만 공지를 보낼 수 있습니다.' },
          { headers }
        )
      }
    }

    const id = Date.now()
    const recipientList = Array.isArray(targetRecipients)
      ? targetRecipients
          .map((r: { store?: string; name?: string } | string) => {
            if (typeof r === 'string') return r.trim()
            const s = String(r?.store ?? '').trim()
            const n = String(r?.name ?? '').trim()
            return s && n ? `${s}|${n}` : ''
          })
          .filter(Boolean)
      : []
    const targetRecipientsStr = recipientList.length > 0 ? JSON.stringify(recipientList) : null

    await supabaseInsert('notices', {
      id,
      title,
      content,
      target_store: targetStore,
      target_role: targetRole,
      target_recipients: targetRecipientsStr,
      sender,
      attachments: '[]',
    })

    return NextResponse.json(
      { success: true, message: '공지사항이 등록되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('sendNotice:', e)
    return NextResponse.json(
      { success: false, message: '등록 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
