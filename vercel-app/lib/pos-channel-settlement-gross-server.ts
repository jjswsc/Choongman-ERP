import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import type { PosChannelGrossRow, PosChannelSettlementChannel } from '@/lib/pos-channel-settlement'

const COMPLETED = new Set(['paid', 'preparing', 'cooking', 'ready', 'completed'])

function isGrabCode(code: string): boolean {
  return code.includes('grab')
}

function isLinemanCode(code: string): boolean {
  const c = code.toLowerCase()
  return c.includes('line') || c.includes('lineman')
}

function isShopeeCode(code: string): boolean {
  return code.includes('shopee')
}

function aggregateGrossFallback(
  rows: {
    payment_card?: number
    payment_delivery_app?: number
    delivery_app_code?: string | null
    card_fee_amt?: number
  }[],
  channel: PosChannelSettlementChannel
): PosChannelGrossRow {
  let gross = 0
  let cardFeeTotal = 0
  for (const r of rows) {
    const card = Math.max(0, Number(r.payment_card) || 0)
    const del = Math.max(0, Number(r.payment_delivery_app) || 0)
    const code = String(r.delivery_app_code ?? '')
      .trim()
      .toLowerCase()
    if (channel === 'card') {
      gross += card
      cardFeeTotal += Math.max(0, Number(r.card_fee_amt) || 0)
    } else if (channel === 'delivery_all') {
      gross += del
    } else if (channel === 'grab' && del > 0 && isGrabCode(code)) {
      gross += del
    } else if (channel === 'lineman' && del > 0 && isLinemanCode(code)) {
      gross += del
    } else if (channel === 'shopee' && del > 0 && isShopeeCode(code)) {
      gross += del
    }
  }
  return {
    gross: Math.round(gross * 100) / 100,
    orderCount: rows.length,
    cardFeeTotal: Math.round(cardFeeTotal * 100) / 100,
  }
}

export async function fetchPosChannelSettlementGross(params: {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
}): Promise<PosChannelGrossRow> {
  const storeCode = String(params.storeCode || '').trim()
  const settleDate = String(params.settleDate || '').slice(0, 10)
  const channel = params.channel

  try {
    const rpcRows = await supabaseRpc<
      { gross?: number; order_count?: number; card_fee_total?: number }[]
    >('get_pos_channel_settlement_gross', {
      p_store_code: storeCode,
      p_settle_date: settleDate,
      p_channel: channel,
    })
    const row = rpcRows?.[0]
    if (row) {
      return {
        gross: Math.max(0, Number(row.gross) || 0),
        orderCount: Math.max(0, Number(row.order_count) || 0),
        cardFeeTotal: Math.max(0, Number(row.card_fee_total) || 0),
      }
    }
  } catch (e) {
    console.warn('fetchPosChannelSettlementGross RPC fallback:', e)
  }

  const start = `${settleDate}T00:00:00+07:00`
  const end = `${settleDate}T23:59:59+07:00`
  const filter = `store_code=eq.${encodeURIComponent(storeCode)}&created_at=gte.${encodeURIComponent(start)}&created_at=lte.${encodeURIComponent(end)}`
  const orders = (await supabaseSelectFilter('pos_orders', filter, {
    select: 'payment_card,payment_delivery_app,delivery_app_code,card_fee_amt,status',
    limit: 50000,
    order: 'id.asc',
  })) as {
    payment_card?: number
    payment_delivery_app?: number
    delivery_app_code?: string | null
    card_fee_amt?: number
    status?: string
  }[] | null

  const completed = (orders || []).filter((o) =>
    COMPLETED.has(String(o.status ?? '').trim().toLowerCase())
  )
  return aggregateGrossFallback(completed, channel)
}
