import { notifyMemberPointLineForPaidOrder } from '@/lib/member-point-line-notify'

type PaidOrderNotifyParams = Parameters<typeof notifyMemberPointLineForPaidOrder>[0]

/**
 * LINE push는 응답을 반환하기 전에 끝낸다.
 * next/server `after()`는 onClose 이후에만 실행되는데, Vercel에서는 그 콜백이
 * 함수 종료와 함께 버려져 포인트는 적립되고 알림만 안 나갔다.
 */
export async function scheduleNotifyMemberPointLineForPaidOrder(
  params: PaidOrderNotifyParams
): Promise<void> {
  try {
    await notifyMemberPointLineForPaidOrder(params)
  } catch (err) {
    console.warn('member-point-line-notify: scheduled_failed', err)
  }
}
