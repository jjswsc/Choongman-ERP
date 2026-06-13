import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, "extract-api-client-section.mjs")
const root = path.join(__dirname, "..")
const apiClientPath = path.join(root, "lib", "api-client.ts")

const BASE = `import { apiFetchWithOffline } from '../api/fetch-offline'`
const JSON = `import { jsonAsArray, jsonAsPlainObject, jsonAsStringArray, jsonObjectWithList } from '../safe-api-json'`
const BOTH = `import { apiFetch } from '../api/fetch'
${BASE}`

const sections = [
  {
    start: "// ─── 미수금/미지급금 관리 ───",
    end: "// ─── 손익계산서 (1단계) ───",
    file: "receivable-payable.ts",
    title: "미수금/미지급금 API",
    imports: `${BASE}
import { getReceivablePayableListWithCache, getPayableTransactionItemsWithCache } from '../offline/erp-offline'`,
  },
  {
    start: "// ─── 손익계산서 (1단계) ───",
    end: "// ─── 감가상각·고정자산 ───",
    file: "income-statement.ts",
    title: "손익계산서 API",
    imports: `${BOTH}
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'`,
  },
  {
    start: "// ─── 감가상각·고정자산 ───",
    end: "// ─── 지출 관리 (MVP) ───",
    file: "depreciation.ts",
    title: "감가상각·고정자산 API",
    imports: `${BASE}
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'`,
  },
  {
    start: "// ─── 지출 관리 (MVP) ───",
    end: "// ─── 매출 관리 (pos_orders 기반) ───",
    file: "expense-management.ts",
    title: "지출 관리 API",
    imports: `${BOTH}
import { jsonAsArray, jsonObjectWithList } from '../safe-api-json'`,
  },
  {
    start: "// ─── 매출 관리 (pos_orders 기반) ───",
    end: "// ─── 통장 거래 ───",
    file: "sales-management.ts",
    title: "매출 관리 API",
    imports: `${BASE}
import { jsonAsArray, jsonAsPlainObject, jsonAsStringArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 통장 거래 ───",
    end: "// ─── 계정과목 ───",
    file: "bank-transactions.ts",
    title: "통장 거래 API",
    imports: `${BOTH}
import { getBankTransactionsWithCache } from '../offline/erp-offline'
import { jsonAsArray, jsonObjectWithList } from '../safe-api-json'`,
  },
  {
    start: "// ─── 계정과목 ───",
    end: "// ─── 고정비 ───",
    file: "chart-of-accounts.ts",
    title: "계정과목 API",
    imports: `${BASE}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 고정비 ───",
    end: "// ─── 인테리어 프로젝트 ───",
    file: "fixed-costs.ts",
    title: "고정비 API",
    imports: `${BASE}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 인테리어 프로젝트 ───",
    end: "// ─── 품목/거래처 관리 (Admin) ───",
    file: "interior.ts",
    title: "인테리어 프로젝트 API",
    imports: `${BASE}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 품목/거래처 관리 (Admin) ───",
    end: "// ─── POS 메뉴 관리 ───",
    file: "items-vendors.ts",
    title: "품목/거래처 관리 API",
    imports: `${BASE}
import { getAdminItemsWithCache, getWarehouseLocationsWithCache, invalidateAdminItemsCache } from '../offline/erp-offline'
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── POS 메뉴 관리 ───",
    end: "// ─── 배합(합성품) 원가 — API 테이블명 sauces 유지 ───",
    file: "pos-menus.ts",
    title: "POS 메뉴 관리 API",
    imports: `${BOTH}
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import type { PosMenuUpsertApiBody } from '../pos-menu-upsert-server'
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 배합(합성품) 원가 — API 테이블명 sauces 유持 ───",
    end: "// ─── POS 프로모션(세트) ───",
    file: "sauces.ts",
    title: "배합(합성품) 원가 API",
    imports: `${BOTH}
import { setErpCache } from '../offline/cache'
import { notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import type { PosMenuUpsertApiBody } from '../pos-menu-upsert-server'`,
  },
  {
    start: "// ─── POS 프로모션(세트) ───",
    end: "// ─── 마케팅 캠페인 ───",
    file: "pos-promos.ts",
    title: "POS 프로모션 API",
    imports: `${BASE}
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 마케팅 캠페인 ───",
    end: "// ─── 마케팅 광고 (ROAS) ───",
    file: "marketing-campaigns.ts",
    title: "마케팅 캠페인 API",
    imports: `${BOTH}
import type { MarketingCollabDetail } from '../marketing-collab-detail'
import type { MarketingCampaignPhasePeriod } from '../marketing-campaign-periods'`,
  },
  {
    start: "// ─── 마케팅 광고 (ROAS) ───",
    end: "// ─── 마케팅 인플루언서 ───",
    file: "marketing-ads.ts",
    title: "마케팅 광고 API",
    imports: BASE,
  },
  {
    start: "// ─── 마케팅 인플루언서 ───",
    end: "// ─── 마케팅 판촉물 ───",
    file: "marketing-influencers.ts",
    title: "마케팅 인플루언서 API",
    imports: BASE,
  },
  {
    start: "// ─── 마케팅 판촉물 ───",
    end: "// ─── 입고 관리 (Inbound) ───",
    file: "pos-operations.ts",
    title: "마케팅 판촉물·POS 정산/결제 API (원본 섹션 경계 유지)",
    imports: `${BOTH}
import { getFromErpCache, setErpCache } from '../offline/cache'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from '../pos-business-day'
import { isLinkposCardApiEnabled } from '../linkpos-card-api-enabled'
import { jsonAsArray } from '../safe-api-json'
import type { PosPaymentOtherBreakdown } from '../pos-payment-other-breakdown'`,
  },
  {
    start: "// ─── 입고 관리 (Inbound) ───",
    end: "// ─── 출고 관리 (Outbound) ───",
    file: "inbound.ts",
    title: "입고 관리 API",
    imports: `${BASE}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 출고 관리 (Outbound) ───",
    end: "// ─── 직원 관리 (Employees) ───",
    file: "outbound.ts",
    title: "출고 관리 API",
    imports: `${BASE}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 직원 관리 (Employees) ───",
    end: "// ─── 매장 점검 ───",
    file: "employees.ts",
    title: "직원 관리 API",
    imports: `${BOTH}
import { attachEvalAnalyticsRedirectFlag, parseEvalAnalyticsErrorResponse } from '../eval-analytics-http-error'`,
  },
  {
    start: "// ─── 매장 점검 ───",
    end: "// ─── 매장 방문 현황 ───",
    file: "store-check.ts",
    title: "매장 점검 API",
    imports: `${BASE}
import { getChecklistItemsWithCache, getCheckHistoryWithCache } from '../offline/erp-offline'`,
  },
  {
    start: "// ─── 매장 방문 현황 ───",
    end: "// ─── 컴플레인 일지 ───",
    file: "store-visit-admin.ts",
    title: "매장 방문 현황(관리자) API",
    imports: `${BASE}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 컴플레인 일지 ───",
    end: "// ─── 매장 수리·수선 신고 ───",
    file: "complaints.ts",
    title: "컴플레인 일지 API",
    imports: `${BASE}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 매장 수리·수선 신고 ───",
    end: "// ─── 시스템 설정 ───",
    file: "store-repairs.ts",
    title: "매장 수리 API",
    imports: `${BOTH}
import { jsonAsArray } from '../safe-api-json'`,
  },
  {
    start: "// ─── 시스템 설정 ───",
    end: "// ─── 본사 발주 (Purchase Order) ───",
    file: "system-settings.ts",
    title: "시스템 설정 API",
    imports: BOTH,
  },
  {
    start: "// ─── 본사 발주 (Purchase Order) ───",
    end: null,
    file: "purchase-order.ts",
    title: "본사 발주 API",
    imports: `${BOTH}
import { getPurchaseOrdersWithCache, getVendorsForPurchaseWithCache } from '../offline/erp-offline'
import { jsonAsArray } from '../safe-api-json'`,
  },
]

// fix typo in sauces marker
sections[11].start = "// ─── 배합(합성품) 원가 — API 테이블명 sauces 유지 ───"

for (const s of sections) {
  const args = [script, s.start, s.end ?? "__EOF__", s.file, s.imports]
  if (s.end == null) {
    // last section: patch script behavior via temp marker
    const lines = fs.readFileSync(apiClientPath, "utf8").split(/\r?\n/)
    const start = lines.findIndex((l) => l.includes(s.start))
    if (start < 0) throw new Error("start not found: " + s.start)
    const body = lines.slice(start + 1).join("\n")
    const header = `/**
 * ${s.title} (api-client.ts에서 분리 — move only)
 */
${s.imports}

`
    fs.writeFileSync(path.join(root, "lib", "api-client", s.file), header + body)
    fs.writeFileSync(apiClientPath, lines.slice(0, start).join("\n"))
    console.log(`Wrote ${s.file} (EOF section)`)
    continue
  }
  execFileSync(process.execPath, args, { stdio: "inherit" })
  const outPath = path.join(root, "lib", "api-client", s.file)
  let text = fs.readFileSync(outPath, "utf8")
  text = text.replace(
    /\/\*\*\n \* \([^)]+\) — api-client\.ts에서 분리 — move only\n \*\//,
    `/**\n * ${s.title} (api-client.ts에서 분리 — move only)\n */`
  )
  fs.writeFileSync(outPath, text)
}

console.log("Done:", sections.length, "sections")
