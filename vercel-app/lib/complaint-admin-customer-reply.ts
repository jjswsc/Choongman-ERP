import { appAlert, appConfirm } from '@/lib/app-message'

export function isMemberPortalComplaint(sourceChannel?: string, memberId?: number | null): boolean {
  return String(sourceChannel || '').trim() === 'member_portal' || (memberId != null && Number(memberId) > 0)
}

/** 회원앱 건: 내부 조치만 채워진 경우 고객 답변으로 복사할지 확인 */
export async function resolveComplaintCustomerReplyForSave(
  customerReply: string,
  action: string,
  isMemberPortal: boolean,
  t: (key: string) => string
): Promise<string | null> {
  const reply = String(customerReply || '').trim()
  const act = String(action || '').trim()
  if (!isMemberPortal || reply) return customerReply
  if (!act) return customerReply

  const copy = await appConfirm(t('complaint_confirm_copy_action_to_reply'))
  if (copy) return act

  await appAlert(t('complaint_warn_use_customer_reply_field'))
  return null
}
