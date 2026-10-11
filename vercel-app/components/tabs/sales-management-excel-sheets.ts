import {
  combinedKindLabel,
  combinedLayerLabel,
  paymentDiscountRowLabel,
  paymentKindLabel,
  promoKindLabel,
} from "@/lib/sales-discount-analytics-labels"
import { salesExcelCol, type SalesExcelSheet } from "@/lib/sales-management-excel-export"
import { translateDeliveryAppCode } from "@/lib/sales-analytics-labels"
import type {
  PosCardReconcileResult,
  PosCashReconcileResult,
  PosDeliveryAppReconcileResult,
  PosKbankQrReconcileResult,
  PosSalesByPromoResult,
} from "@/lib/api-client"
import {
  parseYearFromYmd,
  type MomDayCompareRow,
  type SalesForecastSummary,
  type YoyMonthCompareRow,
} from "@/lib/pos-sales-forecast-compare"
import type { AnalyticsView, PeriodGroupValue } from "@/components/tabs/sales-management-ia"
import { PERIOD_PAYMENT_COLUMNS, periodPaymentAmount } from "@/components/tabs/sales-management-shared"
import type {
  SalesChannelChartRow,
  SalesDeliveryPieRow,
  SalesMenuDataRow,
  SalesPeriodChartRow,
  SalesStoreChartRow,
  SalesStoreDataRow,
  SalesStorePeriodFlatRow,
} from "@/components/tabs/sales-management-view-types"

export interface SalesExcelSheetsInput {
  periodGroupUi: PeriodGroupValue
  tr: (key: string, fallback: string) => string
  selectedView: AnalyticsView | null
  periodChartRows: SalesPeriodChartRow[]
  storeByPeriodFlatRows: SalesStorePeriodFlatRow[]
  scopedStoreData: SalesStoreDataRow[]
  posStoreDisplayName: (code: string) => string
  channelChartRows: SalesChannelChartRow[]
  menuData: SalesMenuDataRow[]
  promoBundleData: PosSalesByPromoResult
  deliveryPieRows: SalesDeliveryPieRow[]
  deliveryAppReconcileData: PosDeliveryAppReconcileResult
  kbankQrReconcileData: PosKbankQrReconcileResult
  cardReconcileData: PosCardReconcileResult
  cashReconcileData: PosCashReconcileResult
  deliveryPaymentChannelRows: SalesChannelChartRow[]
  creditPaymentChannelRows: SalesChannelChartRow[]
  storeChartRows: SalesStoreChartRow[]
  yoyCompareRows: YoyMonthCompareRow[]
  endStr: string
  momCompareRows: MomDayCompareRow[]
  forecastSummary: SalesForecastSummary | null
}

/** 매출 관리 화면에서 보고 있는 주제(selectedView)의 엑셀 시트 목록. 데이터가 없으면 빈 배열 */
export function buildSalesExcelSheets({
  periodGroupUi,
  tr,
  selectedView,
  periodChartRows,
  storeByPeriodFlatRows,
  scopedStoreData,
  posStoreDisplayName,
  channelChartRows,
  menuData,
  promoBundleData,
  deliveryPieRows,
  deliveryAppReconcileData,
  kbankQrReconcileData,
  cardReconcileData,
  cashReconcileData,
  deliveryPaymentChannelRows,
  creditPaymentChannelRows,
  storeChartRows,
  yoyCompareRows,
  endStr,
  momCompareRows,
  forecastSummary,
}: SalesExcelSheetsInput): SalesExcelSheet[] {
  const numCell = (n: number) => Math.round(Number(n || 0) * 100) / 100
  const periodCol =
    periodGroupUi === "hour" ? tr("salesPeriodHourColumn", "시간대") : tr("salesPeriod", "기간")
  const paymentColFormats = PERIOD_PAYMENT_COLUMNS.map(() => salesExcelCol.money)
  const sheets: SalesExcelSheet[] = []

  if (selectedView === "period" && periodChartRows.length > 0) {
    sheets.push({
      name: tr("salesExportSheetSummary", "매출 요약"),
      headers: [
        periodCol,
        tr("salesAmount", "매출액"),
        ...PERIOD_PAYMENT_COLUMNS.map((c) => tr(c.labelKey, c.fallback)),
      ],
      rows: periodChartRows.map((r) => [
        r.axisLabel,
        numCell(r.total),
        ...PERIOD_PAYMENT_COLUMNS.map((c) => numCell(periodPaymentAmount(r, c.field))),
      ]),
      colFormats: [salesExcelCol.text, salesExcelCol.money, ...paymentColFormats],
    })
    sheets.push({
      name: tr("salesExportSheetDetail", "상세"),
      headers: [
        periodCol,
        tr("salesOccupancy", "주문건수"),
        tr("salesGuestCount", "손님 수(홀)"),
        tr("salesHallPerOrder", "홀 건당"),
        tr("salesHallPerGuest", "홀 1인당"),
        tr("salesPerOrderInScope", "건당"),
        tr("salesSupplyAmount", "공급가액"),
        tr("salesTax", "세금"),
        tr("salesDiscountAmount", "할인 금액"),
        tr("salesServiceAmount", "서비스처리 금액"),
        tr("salesAmount", "매출액"),
        ...PERIOD_PAYMENT_COLUMNS.map((c) => tr(c.labelKey, c.fallback)),
      ],
      rows: periodChartRows.map((r) => [
        r.axisLabel,
        r.count,
        r.hallGuestSum,
        r.dineInOrderCount > 0 ? numCell(r.salesPerDineInOrder) : "",
        r.hallGuestSum > 0 ? numCell(r.salesPerGuestHall) : "",
        r.count > 0 ? numCell(r.salesPerOrder) : "",
        numCell(r.subtotal),
        numCell(r.vat),
        numCell(r.discount),
        numCell(r.service ?? 0),
        numCell(r.total),
        ...PERIOD_PAYMENT_COLUMNS.map((c) => numCell(periodPaymentAmount(r, c.field))),
      ]),
      colFormats: [
        salesExcelCol.text,
        salesExcelCol.int,
        salesExcelCol.int,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        ...paymentColFormats,
      ],
    })
  } else if (selectedView === "store-period" && storeByPeriodFlatRows.length > 0) {
    sheets.push({
      name: tr("salesExportSheetDetail", "상세"),
      headers: [
        tr("salesStoreName", "매장명"),
        periodCol,
        tr("salesOccupancy", "주문건수"),
        tr("salesAmount", "매출액"),
        ...PERIOD_PAYMENT_COLUMNS.map((c) => tr(c.labelKey, c.fallback)),
      ],
      rows: storeByPeriodFlatRows.map((r) => [
        r.storeDisplay,
        r.axisLabel,
        r.count,
        numCell(r.total),
        ...PERIOD_PAYMENT_COLUMNS.map((c) => numCell(periodPaymentAmount(r, c.field))),
      ]),
      colFormats: [
        salesExcelCol.text,
        salesExcelCol.text,
        salesExcelCol.int,
        salesExcelCol.money,
        ...paymentColFormats,
      ],
    })
  } else if (selectedView === "store" && scopedStoreData.length > 0) {
    sheets.push({
      name: tr("salesByStore", "매장별"),
      headers: [
        tr("salesStoreName", "매장명"),
        tr("salesOccupancy", "주문건수"),
        tr("salesSupplyAmount", "공급가액"),
        tr("salesTax", "세금"),
        tr("salesDiscountAmount", "할인 금액"),
        tr("salesServiceAmount", "서비스처리 금액"),
        tr("salesAmount", "매출액"),
      ],
      rows: scopedStoreData.map((r) => [
        posStoreDisplayName(r.storeName),
        r.count,
        numCell(r.subtotal),
        numCell(r.vat),
        numCell(r.discount ?? 0),
        numCell(r.service ?? 0),
        numCell(r.total),
      ]),
      colFormats: [
        salesExcelCol.text,
        salesExcelCol.int,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
        salesExcelCol.money,
      ],
    })
  } else if (selectedView === "channel" && channelChartRows.length > 0) {
    sheets.push({
      name: tr("salesChannel", "채널"),
      headers: [tr("salesChannel", "채널"), tr("pL_sales", "매출")],
      rows: channelChartRows.map((r) => [r.axisLabel, numCell(r.sales)]),
      colFormats: [salesExcelCol.text, salesExcelCol.money],
    })
  } else if (selectedView === "menu" && menuData.length > 0) {
    sheets.push({
      name: tr("salesMenu", "메뉴"),
      headers: [tr("salesMenu", "메뉴"), tr("salesQuantity", "수량"), tr("pL_sales", "매출")],
      rows: menuData.map((r) => [r.name, r.qty, numCell(r.sales)]),
      colFormats: [salesExcelCol.text, salesExcelCol.int, salesExcelCol.money],
    })
  } else if (
    (selectedView === "promo-bundle" ||
      selectedView === "payment-discount" ||
      selectedView === "discount-all") &&
    (promoBundleData.rows.length > 0 ||
      (promoBundleData.payment?.rows.length ?? 0) > 0 ||
      (promoBundleData.combined?.byKind.length ?? 0) > 0)
  ) {
    if (selectedView === "promo-bundle") {
      const t = promoBundleData.totals
      sheets.push({
        name: tr("salesBundleDiscountAnalyticsTitle", "세트 할인 영향 분석"),
        headers: [tr("salesMenu", "메뉴"), tr("pL_sales", "매출")],
        rows: [
          [tr("salesPromoPeriodGrossSales", "기간 총매출"), numCell(t.periodGrossSales)],
          [tr("salesPromoLineSaleShare", "세트 판매 비중"), t.promoLineSaleSharePct / 100],
          [tr("salesPromoSaleAmount", "판매액"), numCell(t.saleAmount)],
          [tr("salesPromoBundleDiscount", "세트 할인"), numCell(t.bundleDiscount)],
          [tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"), t.bundleDiscountPctOfGross / 100],
          [tr("salesPromoSaleQty", "세트 판매 수량"), t.qty],
          [tr("salesPromoRegularAmount", "정가 합계"), numCell(t.regularAmount)],
        ],
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
      if ((promoBundleData.byKind ?? []).length > 0) {
        sheets.push({
          name: tr("salesPromoKindBreakdown", "유형별 분석"),
          headers: [
            tr("salesPromoKindBreakdown", "유형별 분석"),
            tr("salesQuantity", "수량"),
            tr("salesPromoSaleAmount", "판매액"),
            tr("salesPromoBundleDiscount", "세트 내재 할인"),
            tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
            tr("salesPromoBundleDiscountShare", "내재 할인 비중"),
          ],
          rows: (promoBundleData.byKind ?? []).map((k) => [
            promoKindLabel(k.kind, tr),
            k.qty,
            numCell(k.saleAmount),
            numCell(k.bundleDiscount),
            k.bundleDiscountPctOfGross / 100,
            k.bundleDiscountSharePct / 100,
          ]),
          colFormats: [
            salesExcelCol.text,
            salesExcelCol.int,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.pct,
            salesExcelCol.pct,
          ],
        })
      }
    }
    if (selectedView === "promo-bundle" && promoBundleData.rows.length > 0) {
      sheets.push({
        name: tr("salesTopicPromoBundleReport", "세트 할인"),
        headers: [
          tr("salesMenu", "메뉴"),
          tr("salesPromoCode", "프로모 코드"),
          tr("salesDiscountKindColumn", "유형"),
          tr("salesQuantity", "수량"),
          tr("salesPromoRegularAmount", "정가 합계"),
          tr("salesPromoSaleAmount", "판매액"),
          tr("salesPromoBundleDiscount", "세트 내재 할인"),
          tr("salesPromoDiscountPct", "할인율"),
          tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
          tr("salesPromoLineSaleShare", "세트·프로모 판매 비중"),
        ],
        rows: promoBundleData.rows.map((r) => [
          r.name,
          r.promoCode || r.promoId,
          promoKindLabel(r.kind, tr),
          r.qty,
          numCell(r.regularAmount),
          numCell(r.saleAmount),
          numCell(r.bundleDiscount),
          r.discountPct / 100,
          r.discountPctOfGross / 100,
          r.saleSharePctOfGross / 100,
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.text,
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.pct,
          salesExcelCol.pct,
          salesExcelCol.pct,
        ],
      })
    }
    if (selectedView === "payment-discount" && (promoBundleData.payment?.rows.length ?? 0) > 0) {
      const pt = promoBundleData.payment!.totals
      sheets.push({
        name: tr("salesPaymentDiscountAnalyticsTitle", "결제 할인 영향 분석"),
        headers: [tr("salesMenu", "메뉴"), tr("pL_sales", "매출")],
        rows: [
          [tr("salesPromoPeriodGrossSales", "기간 총매출"), numCell(pt.periodGrossSales)],
          [tr("salesPromoPaymentDiscount", "결제 할인(기간)"), numCell(pt.discountAmount)],
          [tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"), pt.discountPctOfGross / 100],
        ],
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
      sheets.push({
        name: tr("salesTopicPaymentDiscountReport", "결제 할인"),
        headers: [
          tr("salesPaymentDiscountReason", "할인 사유"),
          tr("salesPromoCode", "프로모 코드"),
          tr("salesDiscountKindColumn", "유형"),
          tr("salesOccupancy", "주문건수"),
          tr("salesPromoPaymentDiscount", "결제 할인(기간)"),
          tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
        ],
        rows: (promoBundleData.payment?.rows ?? []).map((r) => [
          paymentDiscountRowLabel(r, tr),
          r.code,
          paymentKindLabel(r.kind, tr),
          r.orderCount,
          numCell(r.discountAmount),
          r.discountPctOfGross / 100,
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.text,
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.pct,
        ],
      })
    }
    if (selectedView === "discount-all" && (promoBundleData.combined?.byKind.length ?? 0) > 0) {
      const ct = promoBundleData.combined!.totals
      sheets.push({
        name: tr("salesCombinedDiscountAnalyticsTitle", "통합 할인 영향 분석"),
        headers: [tr("salesMenu", "메뉴"), tr("pL_sales", "매출")],
        rows: [
          [tr("salesPromoPeriodGrossSales", "기간 총매출"), numCell(ct.periodGrossSales)],
          [tr("salesPromoBundleDiscount", "세트 내재 할인"), numCell(ct.bundleDiscount)],
          [tr("salesPromoPaymentDiscount", "결제 할인(기간)"), numCell(ct.paymentDiscount)],
          [tr("salesPromoTotalDiscount", "할인 합계"), numCell(ct.totalDiscount)],
          [tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"), ct.totalDiscountPctOfGross / 100],
        ],
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
      sheets.push({
        name: tr("salesTopicCombinedDiscountReport", "통합 할인"),
        headers: [
          tr("salesCombinedDiscountLayer", "할인 층"),
          tr("salesPromoKindBreakdown", "유형별 분석"),
          tr("salesPromoTotalDiscount", "할인 합계"),
          tr("salesPromoDiscountPctOfGross", "총매출 대비 할인"),
        ],
        rows: (promoBundleData.combined?.byKind ?? []).map((k) => [
          combinedLayerLabel(k.layer, tr),
          combinedKindLabel(k, tr),
          numCell(k.discountAmount),
          k.discountPctOfGross / 100,
        ]),
        colFormats: [salesExcelCol.text, salesExcelCol.text, salesExcelCol.money, salesExcelCol.pct],
      })
    }
  } else if (selectedView === "delivery" && deliveryPieRows.length > 0) {
    sheets.push({
      name: tr("salesDeliveryChannel", "배달앱/채널"),
      headers: [tr("salesDeliveryChannel", "배달앱/채널"), tr("pL_sales", "매출"), tr("salesRatio", "비율")],
      rows: deliveryPieRows.map((r) => [r.axisLabel, numCell(r.sales), r.pct / 100]),
      colFormats: [salesExcelCol.text, salesExcelCol.money, salesExcelCol.pct],
    })
  } else if (
    (selectedView === "channel-reconcile" || selectedView === "app-reconcile") &&
    (deliveryAppReconcileData.rows.length > 0 ||
      kbankQrReconcileData.rows.length > 0 ||
      cardReconcileData.rows.length > 0 ||
      cashReconcileData.rows.length > 0)
  ) {
    if (deliveryAppReconcileData.rows.length > 0) {
      sheets.push({
        name: tr("salesChannelReconcileDelivery", "배달앱"),
        headers: [
          tr("salesStoreName", "매장명"),
          tr("salesDeliveryChannel", "배달앱/채널"),
          tr("salesAppReconcileColDeliverySales", "배달 순매출"),
          tr("salesAppReconcileColDeliveryCount", "배달 건수"),
          tr("salesAppReconcileColInStoreSales", "매장앱결제"),
          tr("salesAppReconcileColInStoreCount", "매장앱 건수"),
          tr("salesAppReconcileColAppNet", "앱 합계 순매출"),
          tr("salesAppReconcileColFeePct", "수수료%"),
          tr("salesAppReconcileColSuggestedFee", "예상 수수료"),
          tr("salesAppReconcileColSuggestedPayout", "예상 입금"),
          tr("salesAppReconcileColSettledNet", "통장 입금"),
          tr("salesAppReconcileCsvDiff", "차이"),
          tr("salesAppReconcileColSettledFee", "결산 수수료"),
        ],
        rows: deliveryAppReconcileData.rows.map((r) => [
          posStoreDisplayName(r.storeCode),
          translateDeliveryAppCode(r.appCode, tr),
          numCell(r.deliverySales),
          r.deliveryCount,
          numCell(r.inStoreSales),
          r.inStoreCount,
          numCell(r.appNetSales),
          r.feeSource === "none" ? "" : r.feePct / 100,
          numCell(r.suggestedFee),
          numCell(r.suggestedPayout),
          r.bankDepositAmt == null && r.settledNet == null
            ? ""
            : numCell(r.bankDepositAmt ?? r.settledNet ?? 0),
          r.bankDepositAmt == null && r.settledNet == null
            ? ""
            : numCell((r.bankDepositAmt ?? r.settledNet ?? 0) - r.suggestedPayout),
          r.settledFee == null ? "" : numCell(r.settledFee),
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.text,
          salesExcelCol.money,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.pct,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
        ],
      })
      const deliveryDayRows = deliveryAppReconcileData.rows.flatMap((r) =>
        r.days.map((d) => [
          posStoreDisplayName(r.storeCode),
          translateDeliveryAppCode(r.appCode, tr),
          d.date,
          numCell(d.deliverySales),
          numCell(d.inStoreSales),
          numCell(d.suggestedPayout ?? 0),
          d.bankDepositAmt == null ? "" : numCell(d.bankDepositAmt),
          d.bankDepositAmt == null
            ? ""
            : numCell((d.bankDepositAmt ?? 0) - (d.suggestedPayout ?? 0)),
        ])
      )
      if (deliveryDayRows.length > 0) {
        sheets.push({
          name: tr("salesChannelReconcileDeliveryDays", "배달앱 일자"),
          headers: [
            tr("salesStoreName", "매장명"),
            tr("salesDeliveryChannel", "배달앱/채널"),
            tr("salesPeriodDay", "일별"),
            tr("salesAppReconcileColDeliverySales", "배달 순매출"),
            tr("salesAppReconcileColInStoreSales", "매장앱결제"),
            tr("salesAppReconcileColSuggestedPayout", "예상 입금"),
            tr("salesAppReconcileColSettledNet", "통장 입금"),
            tr("salesAppReconcileCsvDiff", "차이"),
          ],
          rows: deliveryDayRows,
          colFormats: [
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.money,
          ],
        })
      }
    }
    if (kbankQrReconcileData.rows.length > 0) {
      sheets.push({
        name: tr("salesChannelReconcileKbankQr", "KBank QR"),
        headers: [
          tr("salesStoreName", "매장명"),
          tr("salesKbankQrColCount", "건수"),
          tr("salesKbankQrColSales", "POS QR"),
          tr("salesKbankQrColBank", "통장 QR"),
          tr("salesKbankQrColDiff", "차이"),
        ],
        rows: kbankQrReconcileData.rows.map((r) => [
          posStoreDisplayName(r.storeCode),
          r.orderCount,
          numCell(r.qrSales),
          r.bankDepositAmt == null ? "" : numCell(r.bankDepositAmt),
          r.bankDepositAmt == null ? "" : numCell(r.bankDepositAmt - r.qrSales),
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
        ],
      })
      const qrDayRows = kbankQrReconcileData.rows.flatMap((r) =>
        r.days.map((d) => [
          posStoreDisplayName(r.storeCode),
          d.date,
          d.orderCount,
          numCell(d.qrSales),
          d.bankDepositAmt == null ? "" : numCell(d.bankDepositAmt),
          d.bankDepositAmt == null ? "" : numCell(d.bankDepositAmt - d.qrSales),
        ])
      )
      if (qrDayRows.length > 0) {
        sheets.push({
          name: tr("salesChannelReconcileKbankQrDays", "KBank QR 일자"),
          headers: [
            tr("salesStoreName", "매장명"),
            tr("salesPeriodDay", "일별"),
            tr("salesKbankQrColCount", "건수"),
            tr("salesKbankQrColSales", "POS QR"),
            tr("salesKbankQrColBank", "통장 QR"),
            tr("salesKbankQrColDiff", "차이"),
          ],
          rows: qrDayRows,
          colFormats: [
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.int,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.money,
          ],
        })
      }
    }
    if (cardReconcileData.rows.length > 0) {
      sheets.push({
        name: tr("salesChannelReconcileCard", "카드"),
        headers: [
          tr("salesStoreName", "매장명"),
          tr("salesCardColCount", "건수"),
          tr("salesCardColSales", "POS 카드"),
          tr("salesCardColBank", "통장 카드"),
          tr("salesCardColDiff", "차이"),
        ],
        rows: cardReconcileData.rows.map((r) => [
          posStoreDisplayName(r.storeCode),
          r.orderCount,
          numCell(r.cardSales),
          r.bankDepositAmt == null ? "" : numCell(r.bankDepositAmt),
          r.bankDepositAmt == null ? "" : numCell(r.bankDepositAmt - r.cardSales),
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
        ],
      })
      const cardDayRows = cardReconcileData.rows.flatMap((r) =>
        r.days.map((d) => [
          posStoreDisplayName(r.storeCode),
          d.date,
          d.orderCount,
          numCell(d.cardSales),
          d.bankDepositAmt == null ? "" : numCell(d.bankDepositAmt),
          d.bankDepositAmt == null ? "" : numCell(d.bankDepositAmt - d.cardSales),
        ])
      )
      if (cardDayRows.length > 0) {
        sheets.push({
          name: tr("salesChannelReconcileCardDays", "카드 일자"),
          headers: [
            tr("salesStoreName", "매장명"),
            tr("salesPeriodDay", "일별"),
            tr("salesCardColCount", "건수"),
            tr("salesCardColSales", "POS 카드"),
            tr("salesCardColBank", "통장 카드"),
            tr("salesCardColDiff", "차이"),
          ],
          rows: cardDayRows,
          colFormats: [
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.int,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.money,
          ],
        })
      }
    }
    if (cashReconcileData.rows.length > 0) {
      sheets.push({
        name: tr("salesChannelReconcileCash", "현금"),
        headers: [
          tr("salesStoreName", "매장명"),
          tr("salesCashColCount", "건수"),
          tr("salesCashColPos", "POS 현금"),
          tr("salesCashColBank", "통장 현금입금"),
          tr("salesCashColDiff", "차이"),
        ],
        rows: cashReconcileData.rows.map((r) => [
          posStoreDisplayName(r.storeCode),
          r.orderCount,
          numCell(r.cashSales),
          r.bankDepositAmt == null ? "" : numCell(r.bankDepositAmt),
          r.bankDepositAmt == null ? "" : numCell(r.bankDepositAmt - r.cashSales),
        ]),
        colFormats: [
          salesExcelCol.text,
          salesExcelCol.int,
          salesExcelCol.money,
          salesExcelCol.money,
          salesExcelCol.money,
        ],
      })
      const cashDayRows = cashReconcileData.rows.flatMap((r) =>
        r.days.map((d) => [
          posStoreDisplayName(r.storeCode),
          d.date,
          d.orderCount,
          numCell(d.cashSales),
          d.bankDepositAmt == null ? "" : numCell(d.bankDepositAmt),
          d.bankDepositAmt == null ? "" : numCell(d.bankDepositAmt - d.cashSales),
        ])
      )
      if (cashDayRows.length > 0) {
        sheets.push({
          name: tr("salesChannelReconcileCashDays", "현금 일자"),
          headers: [
            tr("salesStoreName", "매장명"),
            tr("salesPeriodDay", "일별"),
            tr("salesCashColCount", "건수"),
            tr("salesCashColPos", "POS 현금"),
            tr("salesCashColBank", "통장 현금입금"),
            tr("salesCashColDiff", "차이"),
          ],
          rows: cashDayRows,
          colFormats: [
            salesExcelCol.text,
            salesExcelCol.text,
            salesExcelCol.int,
            salesExcelCol.money,
            salesExcelCol.money,
            salesExcelCol.money,
          ],
        })
      }
    }
  } else if (selectedView === "payment") {
    if (deliveryPaymentChannelRows.length > 0) {
      sheets.push({
        name: tr("salesPaymentBreakdownDeliveryTitle", "결제수단별 매출 — 배달"),
        headers: [tr("salesPaymentMethod", "결제수단"), tr("pL_sales", "매출")],
        rows: deliveryPaymentChannelRows.map((r) => [r.axisLabel, numCell(r.sales)]),
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
    }
    if (creditPaymentChannelRows.length > 0) {
      sheets.push({
        name: tr("salesPaymentBreakdownCreditTitle", "결제수단별 매출 — 카드/지갑"),
        headers: [tr("salesPaymentMethod", "결제수단"), tr("pL_sales", "매출")],
        rows: creditPaymentChannelRows.map((r) => [r.axisLabel, numCell(r.sales)]),
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
    }
  } else if (selectedView === "store-category") {
    if (storeChartRows.length > 0) {
      sheets.push({
        name: tr("salesByStore", "매장별"),
        headers: [tr("salesStoreName", "매장명"), tr("salesQuantity", "수량"), tr("salesSalesAmount", "판매 금액")],
        rows: storeChartRows.map((r) => [r.storeDisplayName, r.count, numCell(r.total)]),
        colFormats: [salesExcelCol.text, salesExcelCol.int, salesExcelCol.money],
      })
    }
    if (channelChartRows.length > 0) {
      sheets.push({
        name: tr("salesByCategory", "분류별 (채널)"),
        headers: [tr("salesCategoryName", "분류명"), tr("salesSalesAmount", "판매 금액")],
        rows: channelChartRows.map((r) => [r.axisLabel, numCell(r.sales)]),
        colFormats: [salesExcelCol.text, salesExcelCol.money],
      })
    }
  } else if (selectedView === "yoy-compare" && yoyCompareRows.length > 0) {
    sheets.push({
      name: tr("salesTopicCompareMonthYear", "전년대비표"),
      headers: [
        tr("salesCompareMonthColumn", "월"),
        tr("salesAmount", "매출액") + ` (${parseYearFromYmd(endStr) - 1})`,
        tr("salesAmount", "매출액") + ` (${parseYearFromYmd(endStr)})`,
        tr("salesCompareYoyPct", "전년대비(%)"),
      ],
      rows: yoyCompareRows.map((r) => [
        r.month,
        numCell(r.prevYear.total),
        numCell(r.currYear.total),
        r.changePct.total ?? "",
      ]),
      colFormats: [salesExcelCol.int, salesExcelCol.money, salesExcelCol.money, salesExcelCol.money],
    })
  } else if (selectedView === "mom-compare" && momCompareRows.length > 0) {
    sheets.push({
      name: tr("salesTopicCompareMonthMom", "전월대비표"),
      headers: [
        tr("salesCompareDayColumn", "일자"),
        `${tr("salesAmount", "매출액")} (${tr("salesCompareExcelPrevMonth", "전월")})`,
        `${tr("salesAmount", "매출액")} (${tr("salesCompareExcelCurrMonth", "당월")})`,
        tr("salesCompareMomPct", "전월대비(%)"),
      ],
      rows: momCompareRows.map((r) => [
        r.dayLabel,
        numCell(r.prevMonth.total),
        numCell(r.currMonth.total),
        r.changePct.total ?? "",
      ]),
      colFormats: [salesExcelCol.text, salesExcelCol.money, salesExcelCol.money, salesExcelCol.money],
    })
  } else if (selectedView === "forecast" && forecastSummary) {
    sheets.push({
      name: tr("salesTopicForecastMonthly", "예상 매출"),
      headers: [tr("salesCompareWeekdayColumn", "요일"), tr("salesForecastDowAvgSales", "요일 평균 매출")],
      rows: [0, 1, 2, 3, 4, 5, 6].map((dow) => [
        tr(
          ["salesWeekdaySun", "salesWeekdayMon", "salesWeekdayTue", "salesWeekdayWed", "salesWeekdayThu", "salesWeekdayFri", "salesWeekdaySat"][dow]!,
          "—"
        ),
        numCell(forecastSummary.dowAverages[dow] ?? 0),
      ]),
      colFormats: [salesExcelCol.text, salesExcelCol.money],
    })
  }
  return sheets
}
