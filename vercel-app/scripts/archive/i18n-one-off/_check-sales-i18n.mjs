import fs from "fs"

const lines = fs.readFileSync("c:/CM_ERP/vercel-app/lib/i18n.ts", "utf8").split(/\r?\n/)
const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]
const starts = {}
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^  (ko|en|th|mm|la|kh|vi|ms): \{/)
  if (m) starts[m[1]] = i
}

function keysInRange(start, end) {
  const set = new Set()
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^    ([a-zA-Z][a-zA-Z0-9_]*):/)
    if (m) set.add(m[1])
  }
  return set
}

const ranges = {}
for (let j = 0; j < langs.length; j++) {
  const lang = langs[j]
  const end = j + 1 < langs.length ? starts[langs[j + 1]] : lines.length
  ranges[lang] = keysInRange(starts[lang], end)
}

const recentKeys = [
  "salesSubnavAria",
  "salesTopicHintLabel",
  "salesOverviewIntro",
  "salesOverviewDelta",
  "salesOverviewTopChannel",
  "salesOverviewLinkTotalSales",
  "salesOverviewLinkPeriod",
  "salesOverviewLinkChannel",
  "salesOverviewLinkLive",
  "salesOverviewDailyTrend",
  "liveStoreSalesTabRealtime",
  "liveStoreSalesTabCharts",
  "liveStoreSalesTabOps",
  "liveStoreSalesAutoRefresh",
  "liveStoreSalesLastUpdated",
  "adminOpsCenterHqSummaryTitle",
  "adminOpsCenterHqSummarySub",
  "adminOpsCenterLinkPosPrinters",
  "adminOpsCenterLinkPosSettlement",
  "adminOpsCenterAlertPrintFailed",
  "adminOpsCenterAlertPrintBacklog",
  "adminOpsCenterAlertClosePending",
  "helpSum_admin_sales_management",
  "helpHow_admin_sales_management",
  "helpSum_admin_total_sales",
  "helpHow_admin_total_sales",
  "helpSum_admin_live_store_sales",
  "helpHow_admin_live_store_sales",
  "helpSum_admin_ops_center",
  "helpHow_admin_ops_center",
  "salesManagementPageSub",
  "adminOpsCenterTitle",
  "adminRealtimeTableTotalHint",
  "adminDashboardStoreTableFootnote",
  "adminDashboardChartsSub",
  "salesTopicOverviewReportHint",
  "adminRealtimeOfficeCompletedShare",
  "adminRealtimeOfficeCancelStockout",
  "adminRealtimeOfficeRevenueStack",
  "salesDeliveryPlatformBreakdown",
  "salesTotalLabel",
  "totalSalesLinkSalesMgmt",
]

for (const lang of ["th", "mm", "la", "kh", "vi", "ms"]) {
  const miss = recentKeys.filter((k) => ranges.ko.has(k) && !ranges[lang].has(k))
  if (miss.length) {
    console.log(`${lang} missing ${miss.length}:`)
    miss.forEach((k) => console.log(`  ${k}`))
  }
}
