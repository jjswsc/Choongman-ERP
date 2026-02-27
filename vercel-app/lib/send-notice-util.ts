/**
 * 앱 내 공지 자동 발송 유틸
 * - 주문 승인/보류/반려, 강제 출고 등 변동 시 발주 직원·매장 매니저에게 알림
 * - FCM 푸시 알림(휴대폰)도 함께 발송 (Firebase Admin 설정 시, push_order_approval_enabled일 때)
 */
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'
import { sendFcmToRecipients } from '@/lib/firebase-admin'
import { getNotificationSettings } from '@/lib/notification-settings-server'

export interface NoticeRecipient {
  store: string
  name: string
}

/**
 * target_recipients(store|name) 형식으로 지정된 수신자에게만 공지 발송
 * getMyNotices에서 store|name 매칭으로 해당 사용자만 조회됨
 */
export async function sendNoticeToRecipients(params: {
  title: string
  content: string
  recipients: NoticeRecipient[]
  sender?: string
}): Promise<void> {
  const { title, content, recipients, sender = '시스템' } = params
  if (!title?.trim()) return
  const list = recipients
    .filter((r) => r.store?.trim() && r.name?.trim())
    .map((r) => `${String(r.store).trim()}|${String(r.name).trim()}`)
  const unique = [...new Set(list)]
  if (unique.length === 0) return

  const id = Date.now()
  await supabaseInsert('notices', {
    id,
    title: title.trim(),
    content: (content || '').trim(),
    target_store: '전체',
    target_role: '전체',
    target_recipients: JSON.stringify(unique),
    sender: sender.trim() || '시스템',
    attachments: '[]',
  })

  // FCM 푸시 알림 (시스템 설정 > 알림 > 주문/승인 상태 푸시가 활성일 때)
  const settings = await getNotificationSettings()
  if (!settings.pushOrderApprovalEnabled) return

  const recipientsList = unique.map((s) => {
    const [store, name] = s.split('|')
    return { store: store || '', name: name || '' }
  })
  sendFcmToRecipients({
    title: title.trim(),
    body: (content || '').trim().slice(0, 100),
    recipients: recipientsList,
  }).catch((e) => console.error('FCM sendNotice:', e))
}

/**
 * 매장별 매니저 조회 (role에 manager 포함)
 */
export async function getManagersByStore(store: string): Promise<NoticeRecipient[]> {
  if (!store?.trim()) return []
  const rows = (await supabaseSelectFilter('employees', `store=ilike.${encodeURIComponent(store.trim())}`, {
    select: 'store,name,role',
    limit: 50,
  })) as { store?: string; name?: string; role?: string }[] | null
  if (!rows?.length) return []
  return rows
    .filter((r) => {
      const role = String(r.role || '').toLowerCase()
      return role.includes('manager')
    })
    .map((r) => ({ store: String(r.store || '').trim(), name: String(r.name || '').trim() }))
    .filter((r) => r.store && r.name)
}
