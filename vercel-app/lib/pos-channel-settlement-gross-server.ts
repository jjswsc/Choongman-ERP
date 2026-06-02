import { supabaseRpc, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import type { PosChannelGrossRow, PosChannelSettlementChannel } from '@/lib/pos-channel-settlement'
import { resolvePosDeliveryAppSettlementGross } from '@/lib/pos-delivery-app-settlement-amount'

const COMPLETED = new Set(['paid', 'preparing', 'cooking', 'ready', 'completed'])
const POS_CHANNEL_SETTLEMENT_SCAN_MAX_ROWS = 1_000_000

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
    payment_cash?: number
    payment_other?: number
    delivery_app_code?: string | null
    order_type?: string | null
    total?: number
    subtotal?: number
    discount_amt?: number
    coupon_discount_amt?: number
    card_fee_amt?: number
  }[],
  channel: PosChannelSettlementChannel
): PosChannelGrossRow {
  let gross = 0
  let cardFeeTotal = 0
  for (const r of rows) {
    const card = Math.max(0, Number(r.payment_card) || 0)
    const delGross = resolvePosDeliveryAppSettlementGross(r)
    const code = String(r.delivery_app_code ?? '')
      .trim()
      .toLowerCase()
    if (channel === 'card') {
      gross += card
      cardFeeTotal += Math.max(0, Number(r.card_fee_amt) || 0)
    } else if (channel === 'delivery_all') {
      gross += delGross
    } else if (channel === 'grab' && delGross > 0 && isGrabCode(code)) {
      gross += delGross
    } else if (channel === 'lineman' && delGross > 0 && isLinemanCode(code)) {
      gross += delGross
    } else if (channel === 'shopee' && delGross > 0 && isShopeeCode(code)) {
      gross += delGross
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
  const orders = (await supabaseSelectFilterAllPages('pos_orders', filter, {
    select:
      'payment_card,payment_delivery_app,payment_cash,payment_other,delivery_app_code,order_type,total,subtotal,discount_amt,coupon_discount_amt,card_fee_amt,status',
    pageSize: 8000,
    maxRows: POS_CHANNEL_SETTLEMENT_SCAN_MAX_ROWS,
    order: 'id.asc',
  })) as {
    payment_card?: number
    payment_delivery_app?: number
    payment_cash?: number
    payment_other?: number
    delivery_app_code?: string | null
    order_type?: string | null
    total?: number
    subtotal?: number
    discount_amt?: number
    coupon_discount_amt?: number
    card_fee_amt?: number
    status?: string
  }[] | null

  const completed = (orders || []).filter((o) =>
    COMPLETED.has(String(o.status ?? '').trim().toLowerCase())
  )
  return aggregateGrossFallback(completed, channel)
}
