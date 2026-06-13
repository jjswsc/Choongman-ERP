import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { sendFcmToRecipients } from '@/lib/firebase-admin'
import { getNotificationSettings } from '@/lib/notification-settings-server'
import { requireAuth } from '@/lib/verify-auth'
import { unreadRecipientKeysFromDetail, type NoticeEmpRow } from '@/lib/notice-recipient-estimate'
import { parseTargetRecipientKeys } from '@/lib/broadcast-notice-target'
import { employeeReceivesBroadcast } from '@/lib/broadcast-notice-target'

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

    const noticeRows = (await supabaseSelectFilter('notices', `id=eq.${id}`, {
      limit: 1,
      select:
        'id,title,content,target_store,target_role,target_permission_group,target_recipients',
    })) as {
      id: number
      title?: string
      content?: string
      target_store?: string
      target_role?: string
      target_permission_group?: string | null
      target_recipients?: string | null
    }[]
    const notice = noticeRows?.[0]
    if (!notice) {
      return NextResponse.json({ success: false, message: '공지를 찾을 수 없습니다.' }, { headers })
    }

    const readRows = (await supabaseSelectFilter('notice_reads', `notice_id=eq.${id}`, {
      limit: 10000,
      select: 'store,name,status',
    })) as { store?: string; name?: string; status?: string }[]

    const specific = parseTargetRecipientKeys(notice.target_recipients)
    let allKeys: string[] = []
    if (specific.length > 0) {
      allKeys = specific.map((t) => `${t.store}|${t.name}`)
    } else {
      const empRows = (await supabaseSelect('employees', {
        order: 'id.asc',
        select: 'store,name,job,role,resign_date',
      })) as {
        store?: string
        name?: string
        job?: string
        role?: string
        resign_date?: string
      }[]
      const employees: NoticeEmpRow[] = (empRows || []).map((e) => ({
        store: String(e.store || '').trim(),
        name: String(e.name || '').trim(),
        job: String(e.job || '').trim(),
        role: String(e.role || '').trim(),
        resignDate: String(e.resign_date || '').trim(),
      }))
      const row = {
        target_store: notice.target_store,
        target_role: notice.target_role,
        target_permission_group: notice.target_permission_group,
        target_recipients: notice.target_recipients,
      }
      for (const e of employees) {
        if (!e.name || e.resignDate) continue
        if (
          employeeReceivesBroadcast(
            { store: e.store, name: e.name, job: e.job, role: e.role },
            row
          )
        ) {
          allKeys.push(`${e.store}|${e.name}`)
        }
      }
    }

    const unreadKeys = unreadRecipientKeysFromDetail(allKeys, readRows || [])
    if (unreadKeys.length === 0) {
      return NextResponse.json({
        success: true,
        message: '미확인 수신자가 없습니다.',
        reminded: 0,
      }, { headers })
    }

    const settings = await getNotificationSettings()
    if (!settings.pushNoticeEnabled) {
      return NextResponse.json({
        success: false,
        message: '푸시 알림이 비활성화되어 있습니다. 시스템 설정에서 켜 주세요.',
        reminded: 0,
      }, { headers })
    }

    const recipients = unreadKeys.map((k) => {
      const [store, name] = k.split('|')
      return { store: store || '', name: name || '' }
    })

    const title = `[재알림] ${String(notice.title || '').trim()}`
    const bodyText = String(notice.content || '').trim().slice(0, 100)
    const fcmResult = await sendFcmToRecipients({
      title,
      body: bodyText,
      recipients,
    })

    return NextResponse.json({
      success: true,
      message: `미확인 ${unreadKeys.length}명에게 재알림을 발송했습니다. (푸시 성공 ${fcmResult.sent}명)`,
      reminded: unreadKeys.length,
      fcmSent: fcmResult.sent,
      fcmFailed: fcmResult.failed,
    }, { headers })
  } catch (e) {
    console.error('remindNoticeUnread:', e)
    return NextResponse.json({ success: false, message: '재알림 실패' }, { status: 500, headers })
  }
}
