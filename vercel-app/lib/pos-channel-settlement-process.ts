import {
  assertAccountingDateOpen,
  deleteJournalEntriesBySource,
  postPosChannelSettlementJournal,
  type PosChannelSettlementChannel,
} from '@/lib/accounting-posting'
import {
  deriveFeeFromGrossNet,
  normalizePosChannelSettlementChannel,
  roundSettlementMoney,
} from '@/lib/pos-channel-settlement'
import {
  assertBankDepositAllowedForChannelSettlement,
  BankSettlementGuardError,
} from '@/lib/bank-settlement-guards'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export type SaveChannelSettlementInput = {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  net: number
  fee?: number
  memo?: string | null
  feeSource?: string | null
  bankTransactionId?: number | null
  repost?: boolean
  postedBy?: string | null
}

export type SaveChannelSettlementResult =
  | {
      ok: true
      settlementId: number
      journalEntryId: number | null
      gross: number
      fee: number
      net: number
      alreadyPosted?: boolean
    }
  | { ok: false; code: string; settlementId?: number; message?: string; detail?: string }

export async function saveChannelSettlement(
  input: SaveChannelSettlementInput
): Promise<SaveChannelSettlementResult> {
  const storeCode = String(input.storeCode || '').trim()
  const settleDate = String(input.settleDate || '').slice(0, 10)
  const channel = normalizePosChannelSettlementChannel(input.channel)
  if (!storeCode || !/^\d{4}-\d{2}-\d{2}$/.test(settleDate) || !channel) {
    return { ok: false, code: 'INVALID_PARAMS' }
  }

  const gross = roundSettlementMoney(Number(input.gross) || 0)
  const net = roundSettlementMoney(Number(input.net) || 0)
  const fee =
    input.fee != null && input.fee !== undefined
      ? roundSettlementMoney(Number(input.fee))
      : deriveFeeFromGrossNet(gross, net)

  if (gross <= 0 || net < 0 || fee < 0) {
    return { ok: false, code: 'INVALID_AMOUNTS' }
  }
  if (Math.abs(gross - fee - net) > 0.02) {
    return { ok: false, code: 'GROSS_FEE_NET_MISMATCH' }
  }

  await assertAccountingDateOpen(settleDate, storeCode)

  const bankTransactionId =
    input.bankTransactionId != null && input.bankTransactionId > 0
      ? Math.floor(Number(input.bankTransactionId))
      : null
  if (bankTransactionId) {
    try {
      await assertBankDepositAllowedForChannelSettlement(bankTransactionId)
      const otherSettle = (await supabaseSelectFilter(
        'pos_channel_settlements',
        `bank_transaction_id=eq.${bankTransactionId}`,
        { select: 'id,store_code,settle_date,channel', limit: 5 }
      )) as { id?: number; store_code?: string; settle_date?: string; channel?: string }[] | null
      const conflict = (otherSettle || []).find(
        (r) =>
          !(
            String(r.store_code) === storeCode &&
            String(r.settle_date || '').slice(0, 10) === settleDate &&
            String(r.channel) === channel
          )
      )
      if (conflict?.id) {
        return {
          ok: false,
          code: 'BANK_ALREADY_LINKED_SETTLEMENT',
          message: `통장 입금이 다른 채널 정산(#${conflict.id})에 이미 연결되어 있습니다.`,
        }
      }
    } catch (e) {
      if (e instanceof BankSettlementGuardError) {
        return { ok: false, code: e.code, message: e.message }
      }
      throw e
    }
  }

  const repost = Boolean(input.repost)
  const existing = (await supabaseSelectFilter(
    'pos_channel_settlements',
    `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${encodeURIComponent(settleDate)}&channel=eq.${encodeURIComponent(channel)}`,
    { limit: 1, select: 'id,journal_entry_id,gross_amt,fee_amt,net_amt' }
  )) as {
    id?: number
    journal_entry_id?: number | null
    gross_amt?: number
    fee_amt?: number
    net_amt?: number
  }[] | null

  const prev = existing?.[0]
  const prevId = Math.floor(Number(prev?.id) || 0)
  if (prevId > 0 && prev?.journal_entry_id && !repost) {
    const same =
      Math.abs(Number(prev.gross_amt) - gross) < 0.01 &&
      Math.abs(Number(prev.fee_amt) - fee) < 0.01 &&
      Math.abs(Number(prev.net_amt) - net) < 0.01
    if (same) {
      return {
        ok: true,
        settlementId: prevId,
        journalEntryId: prev.journal_entry_id ?? null,
        gross,
        fee,
        net,
        alreadyPosted: true,
      }
    }
    return { ok: false, code: 'ALREADY_POSTED', settlementId: prevId }
  }

  if (prevId > 0 && repost) {
    await deleteJournalEntriesBySource('pos_channel_settlement', prevId)
  }

  const upserted = (await supabaseUpsert(
    'pos_channel_settlements',
    [
      {
        store_code: storeCode,
        settle_date: settleDate,
        channel,
        gross_amt: gross,
        fee_amt: fee,
        net_amt: net,
        fee_source: input.feeSource || null,
        memo: input.memo || null,
        bank_transaction_id:
          input.bankTransactionId && input.bankTransactionId > 0 ? input.bankTransactionId : null,
        updated_at: new Date().toISOString(),
      },
    ],
    'store_code,settle_date,channel'
  )) as { id?: number }[] | null

  let settlementId = Math.floor(Number(upserted?.[0]?.id || prevId) || 0)
  if (settlementId <= 0) {
    const again = (await supabaseSelectFilter(
      'pos_channel_settlements',
      `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${encodeURIComponent(settleDate)}&channel=eq.${encodeURIComponent(channel)}`,
      { limit: 1, select: 'id' }
    )) as { id?: number }[] | null
    settlementId = Math.floor(Number(again?.[0]?.id) || 0)
  }
  if (settlementId <= 0) {
    return { ok: false, code: 'UPSERT_FAILED' }
  }

  const journalEntryId = await postPosChannelSettlementJournal({
    settlementId,
    storeCode,
    settleDate,
    channel,
    gross,
    fee,
    net,
    memo: input.memo || undefined,
    postedBy: input.postedBy || undefined,
  })

  if (journalEntryId) {
    await supabaseUpsert(
      'pos_channel_settlements',
      [
        {
          id: settlementId,
          store_code: storeCode,
          settle_date: settleDate,
          channel,
          journal_entry_id: journalEntryId,
          updated_at: new Date().toISOString(),
        },
      ],
      'id'
    )
  }

  return {
    ok: true,
    settlementId,
    journalEntryId: journalEntryId ?? null,
    gross,
    fee,
    net,
  }
}
