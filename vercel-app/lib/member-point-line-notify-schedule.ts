import { after } from 'next/server'
import { notifyMemberPointLineForPaidOrder } from '@/lib/member-point-line-notify'

type PaidOrderNotifyParams = Parameters<typeof notifyMemberPointLineForPaidOrder>[0]

/** 결제 응답을 막지 않도록 after()로 보낸다. 요청 스코프가 아니면 기존처럼 기다린다. */
export async function scheduleNotifyMemberPointLineForPaidOrder(
  params: PaidOrderNotifyParams
): Promise<void> {
  const run = () =>
    notifyMemberPointLineForPaidOrder(params).catch((err) => {
      console.warn('member-point-line-notify: scheduled_failed', err)
    })
  try {
    after(run)
  } catch {
    await run()
  }
}
