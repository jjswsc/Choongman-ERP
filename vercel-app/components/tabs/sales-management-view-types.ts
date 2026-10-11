import type { ERP_NUMERIC_CHART_TICK } from "@/lib/admin-ui-standards"
import type { mapPosSalesPeriodRowToChartRow } from "./sales-management-shared"

export type SalesUserSelection = {
  subMenu?: string
  topic?: string
  storesKey?: string
  periodGroup?: string
  dateRange?: string
  orderTypesKey?: string
  dowsKey?: string
  compare?: boolean
}

type SalesChartTick = typeof ERP_NUMERIC_CHART_TICK & { fontSize: number }

export type SalesPeriodBarXAxisProps =
  | { angle: number; textAnchor: "end"; tick: SalesChartTick; height: number; interval: number }
  | {
      tick: SalesChartTick
      angle?: undefined
      textAnchor?: undefined
      height?: undefined
      interval?: undefined
    }

export type SalesPeriodChartYAxisProps = { tick: SalesChartTick; tickFormatter: (v: number) => string }

export type SalesPeriodChartRow = ReturnType<typeof mapPosSalesPeriodRowToChartRow>

export type SalesStorePeriodFlatRow = SalesPeriodChartRow & { storeCode: string; storeDisplay: string }

export type SalesStoreDataRow = {
  storeName: string
  count: number
  subtotal: number
  vat: number
  discount?: number
  service?: number
  total: number
  guestSum?: number
  dineInOrderCount?: number
  dineInTotal?: number
  dineInGuestSum?: number
  salesPerDineInOrder?: number
  salesPerGuest?: number
  salesPerOrder?: number
}

export type SalesStoreChartRow = SalesStoreDataRow & {
  storeDisplayName: string
  axisLabel: string
  sales: number
}

export type SalesChannelChartRow = { axisLabel: string; channelKey: string; sales: number }

export type SalesMenuDataRow = { name: string; qty: number; sales: number }

export type SalesDeliveryAppItem = {
  channelKey: string
  sales: number
  pct: number
  platforms?: { code: string; sales: number; pct: number }[]
}

export type SalesDeliveryPieRow = SalesDeliveryAppItem & { axisLabel: string }

export type SalesDeliveryAppData = { items: SalesDeliveryAppItem[]; total: number }

export type SalesPaymentChartRow = { axisLabel: string; paymentKey: string; sales: number; label?: string }
