import 'server-only'

import { sendFcmToRecipients } from '@/lib/firebase-admin'
import { getNotificationSettings } from '@/lib/notification-settings-server'
import { getManagersByStore, type NoticeRecipient } from '@/lib/send-notice-util'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { resolveWorkLogEmployeeById } from '@/lib/work-log-name-server'

export async function resolveWorkLogNoticeRecipient(
  employeeId: number | null | undefined,
  employeeName: string
): Promise<NoticeRecipient | null> {
  if (employeeId != null && employeeId > 0) {
    const emp = await resolveWorkLogEmployeeById(employeeId)
    if (emp?.store && emp.name) return { store: emp.store, name: emp.name }
  }
  if (!employeeName?.trim()) return null
  const rows = (await supabaseSelectFilter('employees', `name=eq.${encodeURIComponent(employeeName.trim())}`, {
    limit: 1,
    select: 'store,name',
  })) as { store?: string; name?: string }[]
  const r = rows?.[0]
  if (r?.store && r?.name) return { store: String(r.store).trim(), name: String(r.name).trim() }
  return null
}

/** 관리자 검토 결과 → 작성자에게 FCM(푸시 설정 ON일 때). notices에는 넣지 않음(발송 내역 제외). */
export async function notifyWorkLogReviewResult(params: {
  employeeId?: number | null
  employeeName: string
  managerCheck: string
  managerComment?: string
  logDate: string
  contentPreview?: string
  sender?: string
}): Promise<void> {
  const recipient = await resolveWorkLogNoticeRecipient(params.employeeId, params.employeeName)
  if (!recipient) return

  const statusLabel =
    params.managerCheck === '승인'
      ? '확인'
      : params.managerCheck === '보류'
        ? '보류'
        : params.managerCheck === '반려'
          ? '반려'
          : params.managerCheck

  const preview = (params.contentPreview || '').trim().slice(0, 80)
  const comment = (params.managerComment || '').trim()
  const body = [
    `날짜: ${params.logDate}`,
    preview ? `업무: ${preview}` : '',
    `검토: ${statusLabel}`,
    comment && !comment.startsWith('⚡') ? `첨언: ${comment.slice(0, 120)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const settings = await getNotificationSettings()
  if (!settings.pushNoticeEnabled) return

  sendFcmToRecipients({
    title: `[업무일지] ${statusLabel}`,
    body: preview || body.slice(0, 100),
    recipients: [recipient],
  }).catch((e) => console.error('FCM workLogReview:', e))
}

/** 미작성 리마인더 — 직원 본인 + (선택) 매장 매니저 */
export async function notifyWorkLogMissingDaily(params: {
  employeeStore: string
  employeeName: string
  logDate: string
  notifyManager?: boolean
}): Promise<void> {
  const recipients: NoticeRecipient[] = [
    { store: params.employeeStore, name: params.employeeName },
  ]
  if (params.notifyManager) {
    const mgrs = await getManagersByStore(params.employeeStore)
    for (const m of mgrs) {
      if (m.name !== params.employeeName) recipients.push(m)
    }
  }

  const unique = recipients.filter(
    (r, i, arr) => arr.findIndex((x) => x.store === r.store && x.name === r.name) === i
  )

  // notices에는 넣지 않음(공지「발송 내역」제외). FCM만.
  const settings = await getNotificationSettings()
  if (!settings.pushNoticeEnabled) return
  sendFcmToRecipients({
    title: '[업무일지] 작성 알림',
    body: `${params.logDate} 업무일지를 작성해 주세요.`,
    recipients: unique,
  }).catch((e) => console.error('FCM workLogReminder:', e))
}
