import { supabaseSelectFilter, supabaseUpsertMerge } from '@/lib/supabase-server'

export type Pp30SalesAdjustment = {
  id?: number
  tenant_id: string
  store_name: string
  tax_month: string
  exclude_cash: boolean
  exclude_card: boolean
  exclude_qr: boolean
  exclude_delivery_app: boolean
  exclude_other: boolean
  cash_ratio: number
  card_ratio: number
  qr_ratio: number
  delivery_ratio: number
  other_ratio: number
  memo?: string | null
  updated_at?: string
  updated_by?: string | null
}

export type Pp30SalesAdjustmentInput = {
  store_name: string
  tax_month: string
  exclude_cash?: boolean
  exclude_card?: boolean
  exclude_qr?: boolean
  exclude_delivery_app?: boolean
  exclude_other?: boolean
  cash_ratio?: number
  card_ratio?: number
  qr_ratio?: number
  delivery_ratio?: number
  other_ratio?: number
  memo?: string | null
}

const TABLE = 'pp30_sales_adjustments'

function clampRatio(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

export async function getPp30SalesAdjustment(
  tenantId: string,
  storeName: string,
  taxMonth: string
): Promise<Pp30SalesAdjustment | null> {
  const rows = (await supabaseSelectFilter(
    TABLE,
    `tenant_id=eq.${encodeURIComponent(tenantId)}&store_name=eq.${encodeURIComponent(storeName)}&tax_month=eq.${encodeURIComponent(taxMonth)}`,
    { select: '*', limit: 1 }
  )) as Pp30SalesAdjustment[] | null
  return rows?.[0] ?? null
}

export async function getPp30SalesAdjustmentsForMonth(
  tenantId: string,
  taxMonth: string
): Promise<Pp30SalesAdjustment[]> {
  const rows = (await supabaseSelectFilter(
    TABLE,
    `tenant_id=eq.${encodeURIComponent(tenantId)}&tax_month=eq.${encodeURIComponent(taxMonth)}`,
    { select: '*', limit: 1000 }
  )) as Pp30SalesAdjustment[] | null
  return rows ?? []
}

export async function savePp30SalesAdjustment(
  tenantId: string,
  input: Pp30SalesAdjustmentInput,
  actor?: string | null
): Promise<void> {
  await supabaseUpsertMerge(TABLE, 'tenant_id,store_name,tax_month', {
    tenant_id: tenantId,
    store_name: input.store_name,
    tax_month: input.tax_month.slice(0, 7),
    exclude_cash: !!input.exclude_cash,
    exclude_card: !!input.exclude_card,
    exclude_qr: !!input.exclude_qr,
    exclude_delivery_app: !!input.exclude_delivery_app,
    exclude_other: !!input.exclude_other,
    cash_ratio: clampRatio(input.cash_ratio),
    card_ratio: clampRatio(input.card_ratio),
    qr_ratio: clampRatio(input.qr_ratio),
    delivery_ratio: clampRatio(input.delivery_ratio),
    other_ratio: clampRatio(input.other_ratio),
    memo: input.memo ?? null,
    updated_at: new Date().toISOString(),
    updated_by: actor || null,
  })
}

export type ChannelSalesBreakdown = {
  cash: number
  card: number
  qr: number
  deliveryApp: number
  other: number
  total: number
}

export type DailyAdjustedSales = {
  date: string
  originalTotal: number
  adjustedTotal: number
  adjustedNet: number
  adjustedVat: number
}

export type Pp30AdjustmentResult = {
  original: ChannelSalesBreakdown
  adjusted: ChannelSalesBreakdown
  adjustedNet: number
  adjustedVat: number
  dailyBreakdown: DailyAdjustedSales[]
}

const VAT_RATE = 7

type OrderRowForAdjustment = {
  created_at?: string
  paid_at?: string
  total?: number
  subtotal?: number
  vat?: number
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_delivery_app?: number
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function splitVatInclusive(gross: number): { net: number; vat: number } {
  if (gross <= 0) return { net: 0, vat: 0 }
  const net = Math.round((gross * 100) / (100 + VAT_RATE) * 100) / 100
  const vat = Math.round((gross - net) * 100) / 100
  return { net, vat }
}

/**
 * POS 주문 행 + 조정 설정 → 채널별 매출 원본/조정 + 일별 비례 배분
 */
export function applyPp30SalesAdjustment(
  orders: OrderRowForAdjustment[],
  adj: Pp30SalesAdjustmentInput | Pp30SalesAdjustment | null,
  getBusinessDate: (row: OrderRowForAdjustment) => string
): Pp30AdjustmentResult {
  const original: ChannelSalesBreakdown = { cash: 0, card: 0, qr: 0, deliveryApp: 0, other: 0, total: 0 }
  const dailyOriginal = new Map<string, number>()
  const dailyChannels = new Map<string, ChannelSalesBreakdown>()

  for (const row of orders) {
    const date = getBusinessDate(row)
    const cash = num(row.payment_cash)
    const card = num(row.payment_card)
    const qr = num(row.payment_qr)
    const delivery = num(row.payment_delivery_app)
    const rowTotal = num(row.total)
    const otherCalc = Math.max(0, rowTotal - cash - card - qr - delivery)

    original.cash += cash
    original.card += card
    original.qr += qr
    original.deliveryApp += delivery
    original.other += otherCalc
    original.total += rowTotal

    dailyOriginal.set(date, (dailyOriginal.get(date) || 0) + rowTotal)
    const dc = dailyChannels.get(date) || { cash: 0, card: 0, qr: 0, deliveryApp: 0, other: 0, total: 0 }
    dc.cash += cash
    dc.card += card
    dc.qr += qr
    dc.deliveryApp += delivery
    dc.other += otherCalc
    dc.total += rowTotal
    dailyChannels.set(date, dc)
  }

  if (!adj) {
    const sv = splitVatInclusive(original.total)
    const dates = [...dailyOriginal.keys()].sort()
    return {
      original,
      adjusted: { ...original },
      adjustedNet: sv.net,
      adjustedVat: sv.vat,
      dailyBreakdown: dates.map((date) => {
        const t = dailyOriginal.get(date) || 0
        const d = splitVatInclusive(t)
        return { date, originalTotal: t, adjustedTotal: t, adjustedNet: d.net, adjustedVat: d.vat }
      }),
    }
  }

  const cashR = adj.exclude_cash ? 0 : clampRatio(adj.cash_ratio ?? 1)
  const cardR = adj.exclude_card ? 0 : clampRatio(adj.card_ratio ?? 1)
  const qrR = adj.exclude_qr ? 0 : clampRatio(adj.qr_ratio ?? 1)
  const delR = adj.exclude_delivery_app ? 0 : clampRatio(adj.delivery_ratio ?? 1)
  const othR = adj.exclude_other ? 0 : clampRatio(adj.other_ratio ?? 1)

  const adjusted: ChannelSalesBreakdown = {
    cash: Math.round(original.cash * cashR * 100) / 100,
    card: Math.round(original.card * cardR * 100) / 100,
    qr: Math.round(original.qr * qrR * 100) / 100,
    deliveryApp: Math.round(original.deliveryApp * delR * 100) / 100,
    other: Math.round(original.other * othR * 100) / 100,
    total: 0,
  }
  adjusted.total = Math.round((adjusted.cash + adjusted.card + adjusted.qr + adjusted.deliveryApp + adjusted.other) * 100) / 100

  const sv = splitVatInclusive(adjusted.total)

  const dates = [...dailyChannels.keys()].sort()
  const dailyBreakdown: DailyAdjustedSales[] = dates.map((date) => {
    const dc = dailyChannels.get(date)!
    const adjDay =
      Math.round(dc.cash * cashR * 100) / 100 +
      Math.round(dc.card * cardR * 100) / 100 +
      Math.round(dc.qr * qrR * 100) / 100 +
      Math.round(dc.deliveryApp * delR * 100) / 100 +
      Math.round(dc.other * othR * 100) / 100
    const adjDayRound = Math.round(adjDay * 100) / 100
    const d = splitVatInclusive(adjDayRound)
    return {
      date,
      originalTotal: dc.total,
      adjustedTotal: adjDayRound,
      adjustedNet: d.net,
      adjustedVat: d.vat,
    }
  })

  return { original, adjusted, adjustedNet: sv.net, adjustedVat: sv.vat, dailyBreakdown }
}
