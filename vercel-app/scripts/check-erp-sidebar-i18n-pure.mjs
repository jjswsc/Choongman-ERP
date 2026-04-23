import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const p = path.join(__dirname, "..", "lib", "i18n.ts")

const keys = new Set([
  "adminDashboard",
  "aiCenter",
  "adminNotices",
  "companyHybridDocuments",
  "adminWorkLog",
  "posCostAnalysis",
  "posMemberManage",
  "memberList",
  "memberPoints",
  "memberCoupons",
  "memberVisits",
  "memberTiers",
  "adminSectionSales",
  "adminSalesManagement",
  "adminSectionMarketing",
  "adminMarketingCampaigns",
  "adminMarketingCollabMenus",
  "adminMarketingPromos",
  "adminMarketingAds",
  "adminMarketingInfluencers",
  "adminMarketingMaterials",
  "adminMarketingCalendar",
  "adminMarketingReport",
  "adminMarketingIntegrations",
  "adminSectionStore",
  "adminStoreCheck",
  "adminStoreVisit",
  "adminStoreRepairs",
  "adminComplaints",
  "adminSectionPos",
  "adminPosOrder",
  "adminPosOrderList",
  "adminPosSettlement",
  "adminPosCash",
  "adminPosScreenConfig",
  "adminPosMenus",
  "adminPosPrinters",
  "adminPosCoupons",
  "adminPosTaxInvoiceRecipients",
  "adminSectionHr",
  "adminEmployees",
  "adminHrPolicies",
  "adminHrCalendar",
  "adminAttendance",
  "adminLeave",
  "adminSectionLogistics",
  "adminItems",
  "adminVendors",
  "adminOrders",
  "adminOrderCreate",
  "adminStock",
  "adminInbound",
  "adminOutbound",
  "adminSectionAccounting",
  "adminAccountingPurchaseOrder",
  "adminPayroll",
  "adminReceivablePayable",
  "expenseManagementTitle",
  "adminPettyCash",
  "adminBankTransactions",
  "adminDepreciation",
  "adminFinancialStatements",
  "adminChartOfAccounts",
  "adminTaxFiling",
  "adminSectionInterior",
  "adminInteriorProjects",
  "interiorSchedule",
  "interiorVendorTracks",
  "interiorHubSpecs",
  "interiorHubDrawings",
  "interiorKitchen",
  "interiorHubCosts",
  "adminSettings",
  "logout",
])

const RE_LANG = /^\s{2}(ko|en|th|mm|la|kh|vi|ms):\s*\{/
// key at 4 spaces: `    key:`
const RE_KV4 = /^\s{4}([a-zA-Z0-9_]+):/

const text = fs.readFileSync(p, "utf8")
const lines = text.split(/\r?\n/)
let current = null
const byLang = {}

for (const line of lines) {
  const m = line.match(RE_LANG)
  if (m) {
    current = m[1]
    byLang[current] = byLang[current] || new Set()
    continue
  }
  if (!current) continue
  const k = line.match(RE_KV4)
  if (k) byLang[current].add(k[1])
}

const enK = byLang.en || byLang.ko
for (const L of ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]) {
  const have = byLang[L] || new Set()
  const missing = [...keys].filter((k) => !have.has(k))
  if (missing.length === 0) continue
  if (L === "ko" || L === "en") {
    console.log(`LANG ${L} 완전 누락 (${missing.length}):`, missing.join(", "))
    continue
  }
  const rawIfUseT = missing.filter((k) => !enK.has(k))
  if (rawIfUseT.length) {
    console.log(
      `LANG ${L}: en에도 없어 useT가 키문자 그대로 표시 (${rawIfUseT.length}):`,
      rawIfUseT.join(", "),
    )
  } else {
    console.log(
      `LANG ${L}: 사전에 없음 — 영어로 폴백 (${missing.length}개, 번역未 반영):`,
      missing.join(", "),
    )
  }
}

console.log("\n--- useT: 최종 문자열이 키와 동일(번역/폴백 전무)한 항목 ---")
for (const L of Object.keys(byLang)) {
  const d = byLang[L]
  const showRaw = [...keys].filter((k) => {
    const a = d.has(k) // non-empty in dict; we only track keys present
    if (a) {
      // could still be empty string in source - we don't parse values
      return false
    }
    if (enK.has(k)) return false
    return true
  })
  if (showRaw.length) console.log(L, showRaw)
}

if (!enK) console.error("ERROR: no en/ko")
console.log("완료. ErpSidebar 키 수:", keys.size)
