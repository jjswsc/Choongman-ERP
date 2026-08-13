export type AnalyticsView =
  | "period"
  | "delivery"
  | "channel"
  | "menu"
  | "promo-bundle"
  | "payment-discount"
  | "discount-all"
  | "payment"
  | "store"
  | "store-category"
  | "store-period"
  | "yoy-compare"
  | "mom-compare"
  | "forecast"
  | "overview"
  | "app-reconcile"
  | null

export type PeriodGroupValue = "year" | "month" | "week" | "day" | "hour" | "dow"

/** 집계 기간 UI·상단 추이 차트를 공유하는 리포트 주제 (실시간 운영 제외) */
export const PERIOD_GROUP_TOPIC_VIEWS: Exclude<AnalyticsView, null>[] = [
  "period",
  "store-period",
  "channel",
  "menu",
  "delivery",
  "store-category",
  "payment",
]

export type SalesTopicConfig = {
  id: string
  labelKey: string
  hintKey?: string
  view: AnalyticsView
}

export type SalesSubMenuConfig = {
  id: string
  labelKey: string
  fallbackLabel: string
  topics: SalesTopicConfig[]
}

export const SALES_IA: SalesSubMenuConfig[] = [
  {
    id: "sales-analysis",
    labelKey: "salesManagementSubmenuQuickSales",
    fallbackLabel: "실적 분석",
    topics: [
      {
        id: "analysis-period",
        labelKey: "salesTopicExplorePeriod",
        hintKey: "salesTopicExplorePeriodHint",
        view: "period",
      },
      {
        id: "analysis-channel",
        labelKey: "salesTopicExploreChannel",
        hintKey: "salesTopicExploreChannelHint",
        view: "channel",
      },
      {
        id: "analysis-payment",
        labelKey: "salesTopicExplorePayment",
        hintKey: "salesTopicExplorePaymentHint",
        view: "payment",
      },
      {
        id: "analysis-menu",
        labelKey: "salesTopicExploreMenu",
        hintKey: "salesTopicExploreMenuHint",
        view: "menu",
      },
      {
        id: "analysis-delivery",
        labelKey: "salesTopicExploreDelivery",
        hintKey: "salesTopicExploreDeliveryHint",
        view: "delivery",
      },
    ],
  },
  {
    id: "sales-compare",
    labelKey: "salesManagementSubmenuAggregateInfo",
    fallbackLabel: "매장 비교",
    topics: [
      {
        id: "compare-store-summary",
        labelKey: "salesTopicPivotStoreSummary",
        hintKey: "salesTopicPivotStoreSummaryHint",
        view: "store",
      },
      {
        id: "compare-store-by-period",
        labelKey: "salesTopicPivotStoreByPeriod",
        hintKey: "salesTopicPivotStoreByPeriodHint",
        view: "store-period",
      },
      {
        id: "compare-store-category",
        labelKey: "salesTopicPivotStoreCategory",
        hintKey: "salesTopicPivotStoreCategoryHint",
        view: "store-category",
      },
    ],
  },
  {
    id: "sales-discount",
    labelKey: "salesManagementTabDiscount",
    fallbackLabel: "할인현황",
    topics: [
      {
        id: "report-promo-bundle",
        labelKey: "salesTopicPromoBundleReport",
        hintKey: "salesTopicPromoBundleReportHint",
        view: "promo-bundle",
      },
      {
        id: "report-payment-discount",
        labelKey: "salesTopicPaymentDiscountReport",
        hintKey: "salesTopicPaymentDiscountReportHint",
        view: "payment-discount",
      },
      {
        id: "report-discount-all",
        labelKey: "salesTopicCombinedDiscountReport",
        hintKey: "salesTopicCombinedDiscountReportHint",
        view: "discount-all",
      },
    ],
  },
  {
    id: "sales-forecast-report",
    labelKey: "salesManagementTabForecast",
    fallbackLabel: "예측·리포트",
    topics: [
      {
        id: "report-month-year",
        labelKey: "salesTopicCompareMonthYear",
        hintKey: "salesTopicCompareMonthYearHint",
        view: "yoy-compare",
      },
      {
        id: "report-month-mom",
        labelKey: "salesTopicCompareMonthMom",
        hintKey: "salesTopicCompareMonthMomHint",
        view: "mom-compare",
      },
      {
        id: "report-forecast-monthly",
        labelKey: "salesTopicForecastMonthly",
        hintKey: "salesTopicForecastMonthlyHint",
        view: "forecast",
      },
      {
        id: "report-overview",
        labelKey: "salesTopicOverviewReport",
        hintKey: "salesTopicOverviewReportHint",
        view: "overview",
      },
    ],
  },
  {
    id: "sales-app-reconcile",
    labelKey: "salesManagementSubmenuAppReconcile",
    fallbackLabel: "배달앱 확인",
    topics: [
      {
        id: "app-reconcile",
        labelKey: "salesTopicAppReconcile",
        hintKey: "salesTopicAppReconcileHint",
        view: "app-reconcile",
      },
    ],
  },
]
