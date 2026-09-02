/**
 * 통장 입금 저장 후 Grab/라인맨/카드 수수료 분개를 자동으로 붙인다.
 * 실패해도 통장 저장은 유지. QR·현금·폐유는 호출하지 않음.
 */
import { saveChannelSettlement } from '@/lib/pos-channel-settlement-process'
import { fetchPosChannelSettlementGross } from '@/lib/pos-channel-settlement-gross-server'
import { deriveFeeFromGrossNet, roundSettlementMoney } from '@/lib/pos-channel-settlement'
import {
  channelFeeSettleDateCandidates,
  inferPosBankChipKind,
  settlementChannelForPosBankChip,
} from '@/lib/pos-bank-chip-settlement'

export async function maybeAutoPostChannelFeeAfterBankDeposit(params: {
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
  const bankId = Math.floor(Number(params.bankTransactionId) || 0)
  if (bankId <= 0) return
  if (String(params.category || '').toLowerCase() !== 'receivable_receive') return
  const storeCode = String(params.storeCode || '').trim()
  if (!storeCode) return
  const channel = settlementChannelForPosBankChip(inferPosBankChipKind(params.memo, params.note))
  if (!channel) return
  const net = roundSettlementMoney(Math.abs(Number(params.netAmount) || 0))
  if (net <= 0) return

  const dates = channelFeeSettleDateCandidates({
    transDate: params.transDate,
    salesDate: params.salesDate,
  })
  for (const settleDate of dates) {
    try {
      const grossRow = await fetchPosChannelSettlementGross({ storeCode, settleDate, channel })
      const gross = roundSettlementMoney(Number(grossRow.gross) || 0)
      if (gross <= 0 || gross + 0.02 < net) continue
      const fee = deriveFeeFromGrossNet(gross, net)
      if (fee <= 0.02) return
      const out = await saveChannelSettlement({
        storeCode,
        settleDate,
        channel,
        gross,
        net,
        fee,
        memo: String(params.memo || params.note || '').trim() || null,
        feeSource: 'auto_bank_chip',
        bankTransactionId: bankId,
        postedBy: params.postedBy || null,
      })
      if (out.ok || out.code === 'ALREADY_POSTED' || out.code === 'BANK_ALREADY_LINKED_SETTLEMENT') {
        return
      }
    } catch (e) {
      console.warn('maybeAutoPostChannelFeeAfterBankDeposit:', e)
    }
  }
}
