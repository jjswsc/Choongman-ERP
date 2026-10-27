/**
 * 통장 입금 저장 후 Grab/라인맨/카드 수수료 자동 분개.
 *
 * 2026-10: 회계 회의 후 월별 수기(지출관리 일괄 5528/5529)로 복귀.
 * 자동 post는 비활성 — 호출처는 유지해 재활성화 시 한곳만 켜면 됨.
 */
export async function maybeAutoPostChannelFeeAfterBankDeposit(_params: {
  bankTransactionId?: number | null
  storeCode?: string | null
  transDate?: string | null
  salesDate?: string | null
  netAmount: number
  category?: string | null
  memo?: string | null
  note?: string | null
  postedBy?: string | null
}): Promise<void> {
  return
}
