import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { sendFcmToRecipients, getRecipientsByTargetStoreRole } from '@/lib/firebase-admin'
import { getNotificationSettings } from '@/lib/notification-settings-server'

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
    let attachmentsStr = '[]'
    const rawAttachments = body?.attachments
    if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
      const sanitized = rawAttachments
        .filter((a: unknown) => a && typeof a === 'object' && 'name' in a && 'url' in a)
        .map((a: { name?: string; mime?: string; url?: string }) => ({
          name: String(a?.name ?? '').trim() || 'file',
          mime: String(a?.mime ?? '').trim() || 'application/octet-stream',
          url: String(a?.url ?? '').trim(),
        }))
        .filter((a) => a.url.length > 0)
      if (sanitized.length > 0) {
        attachmentsStr = JSON.stringify(sanitized)
      }
    }

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
      attachments: attachmentsStr,
    })

    // FCM 푸시 알림
    let fcmRecipients: { store: string; name: string }[] = []
    if (recipientList.length > 0) {
      fcmRecipients = recipientList.map((s) => {
        const [store, name] = s.split('|')
        return { store: store || '', name: name || '' }
      })
    } else {
      // 매장/역할만 지정된 경우: targetStore·targetRole에 해당하는 직원 조회 후 푸시
      fcmRecipients = await getRecipientsByTargetStoreRole(targetStore, targetRole)
    }
    if (fcmRecipients.length > 0) {
      const settings = await getNotificationSettings()
      if (settings.pushNoticeEnabled) {
        sendFcmToRecipients({
          title,
          body: content.slice(0, 100),
          recipients: fcmRecipients,
        }).catch((e) => console.error('sendNotice FCM:', e))
      }
    }

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
