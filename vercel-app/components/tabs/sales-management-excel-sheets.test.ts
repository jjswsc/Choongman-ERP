import { describe, expect, it } from "vitest"
import {
  buildSalesExcelSheets,
  type SalesExcelSheetsInput,
} from "@/components/tabs/sales-management-excel-sheets"
import { EMPTY_POS_SALES_BY_PROMO } from "@/components/tabs/sales-management-shared"
import { EMPTY_POS_DELIVERY_APP_RECONCILE } from "@/components/tabs/sales-delivery-app-reconcile-panel"
import { EMPTY_POS_KBANK_QR_RECONCILE } from "@/components/tabs/sales-kbank-qr-reconcile-panel"
import { EMPTY_POS_CARD_RECONCILE } from "@/components/tabs/sales-card-reconcile-panel"
import { EMPTY_POS_CASH_RECONCILE } from "@/components/tabs/sales-cash-reconcile-panel"
import type { SalesPeriodChartRow } from "@/components/tabs/sales-management-view-types"

const tr = (_key: string, fallback: string) => fallback

function input(overrides: Partial<SalesExcelSheetsInput>): SalesExcelSheetsInput {
  return {
    periodGroupUi: "day",
    tr,
    selectedView: null,
    periodChartRows: [],
    storeByPeriodFlatRows: [],
    scopedStoreData: [],
    posStoreDisplayName: (code) => `name:${code}`,
    channelChartRows: [],
    menuData: [],
    promoBundleData: EMPTY_POS_SALES_BY_PROMO,
    deliveryPieRows: [],
    deliveryAppReconcileData: EMPTY_POS_DELIVERY_APP_RECONCILE,
    kbankQrReconcileData: EMPTY_POS_KBANK_QR_RECONCILE,
    cardReconcileData: EMPTY_POS_CARD_RECONCILE,
    cashReconcileData: EMPTY_POS_CASH_RECONCILE,
    deliveryPaymentChannelRows: [],
    creditPaymentChannelRows: [],
    storeChartRows: [],
    yoyCompareRows: [],
    endStr: "2026-10-09",
    momCompareRows: [],
    forecastSummary: null,
    ...overrides,
  }
}

const periodRow: SalesPeriodChartRow = {
  label: "2026-10-01",
  key: "2026-10-01",
  sales: 1000.456,
  count: 4,
  subtotal: 934.07,
  vat: 65.39,
  discount: 10,
  service: 0,
  total: 1000.456,
  guestSum: 6,
  hallGuestSum: 0,
  dineInOrderCount: 0,
  dineInTotal: 0,
  dineInGuestSum: 0,
  salesPerDineInOrder: 0,
  salesPerGuestHall: 0,
  salesPerOrder: 250.114,
  cashSales: 400,
  creditSales: 600.456,
  qrSales: 0,
  otherSales: 0,
  deliveryAppSales: 0,
  axisLabel: "10/01",
}

describe("buildSalesExcelSheets", () => {
  it("returns no sheets when no topic is selected", () => {
    expect(buildSalesExcelSheets(input({ selectedView: null, periodChartRows: [periodRow] }))).toEqual([])
  })

  it("returns no sheets when the selected topic has no rows", () => {
    expect(buildSalesExcelSheets(input({ selectedView: "period" }))).toEqual([])
    expect(buildSalesExcelSheets(input({ selectedView: "menu" }))).toEqual([])
  })

  it("builds summary and detail sheets for the period topic with rounded amounts", () => {
    const sheets = buildSalesExcelSheets(input({ selectedView: "period", periodChartRows: [periodRow] }))
    expect(sheets.map((s) => s.name)).toEqual(["매출 요약", "상세"])
    expect(sheets[0]!.headers.slice(0, 2)).toEqual(["기간", "매출액"])
    expect(sheets[0]!.rows[0]!.slice(0, 2)).toEqual(["10/01", 1000.46])
    const detail = sheets[1]!.rows[0]!
    expect(detail.slice(0, 6)).toEqual(["10/01", 4, 0, "", "", 250.11])
  })

  it("labels the period column as hour of day when grouped by hour", () => {
    const sheets = buildSalesExcelSheets(
      input({ selectedView: "period", periodGroupUi: "hour", periodChartRows: [periodRow] })
    )
    expect(sheets[0]!.headers[0]).toBe("시간대")
  })

  it("uses the store display name on the store sheet", () => {
    const sheets = buildSalesExcelSheets(
      input({
        selectedView: "store",
        scopedStoreData: [{ storeName: "S01", count: 2, subtotal: 93.46, vat: 6.54, total: 100 }],
      })
    )
    expect(sheets).toHaveLength(1)
    expect(sheets[0]!.rows).toEqual([["name:S01", 2, 93.46, 6.54, 0, 0, 100]])
  })

  it("exports menu quantity and sales", () => {
    const sheets = buildSalesExcelSheets(
      input({ selectedView: "menu", menuData: [{ name: "Fried chicken", qty: 3, sales: 597.005 }] })
    )
    expect(sheets[0]!.rows).toEqual([["Fried chicken", 3, 597.01]])
  })

  it("adds only the payment sheets that have rows", () => {
    const sheets = buildSalesExcelSheets(
      input({
        selectedView: "payment",
        creditPaymentChannelRows: [{ axisLabel: "Card", channelKey: "card", sales: 250 }],
      })
    )
    expect(sheets.map((s) => s.name)).toEqual(["결제수단별 매출 — 카드/지갑"])
  })
})
