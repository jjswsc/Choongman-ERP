/** 서버가 paid → ready 를 거절할 때 반환하는 문구와 맞춘다. */
export const POS_PAID_STATUS_DOWNGRADE_BLOCKED_MESSAGE =
  '결제 완료 주문은 취소/환불 상태로만 변경할 수 있습니다.'

export function isPaidStatusDowngradeBlockedMessage(message: string | undefined): boolean {
  return String(message || '').includes('결제 완료 주문은')
}

/**
 * 포장 완료 시 적용할 상태 순서.
 * 회원앱 선결제 주문은 이미 paid 라서 ready 로 되돌리면 API 가 거절하고 주문이 화면에 남는다.
 * 그 경우는 completed 만 보낸다.
 */
export function resolveTakeoutPackStatusSteps(params: {
  currentStatus: string
  alsoComplete: boolean
}): Array<'ready' | 'completed'> {
  const status = String(params.currentStatus || '').trim().toLowerCase()
  if (status === 'paid' || status === 'completed') return ['completed']
  if (params.alsoComplete) return ['ready', 'completed']
  return ['ready']
}
