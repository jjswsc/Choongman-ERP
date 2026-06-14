import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const lib = path.join(__dirname, "..", "lib", "api-client")

function readLines(name) {
  return fs.readFileSync(path.join(lib, name), "utf8").split(/\r?\n/)
}

function writeModule(name, content) {
  fs.writeFileSync(path.join(lib, name), content.trimEnd() + "\n", "utf8")
}

function slice1(lines, start, end) {
  return lines.slice(start - 1, end).join("\n")
}

{
  const lines = readLines("marketing-campaigns.ts")
  const coreImport = `/**
 * 마케팅 캠페인 CRUD — marketing-campaigns.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { MarketingCollabDetail } from '../marketing-collab-detail'
import type { MarketingCampaignPhasePeriod } from '../marketing-campaign-periods'
import { apiJsonArrayResponse } from './helpers'
`
  const lineOaImport = `/**
 * LINE OA 세그먼트·그룹 API — marketing-campaigns.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
`
  const analyticsImport = `/**
 * 마케팅 캠페인 비용·성과·엑셀 — marketing-campaigns.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
`

  writeModule(
    "marketing-campaigns-core.ts",
    `${coreImport}
${slice1(lines, 10, 189)}
`
  )

  writeModule(
    "marketing-line-oa.ts",
    `${lineOaImport}
${slice1(lines, 191, 551)}
`
  )

  writeModule(
    "marketing-campaign-analytics.ts",
    `${analyticsImport}
${slice1(lines, 553, lines.length)}
`
  )

  writeModule(
    "marketing-campaigns.ts",
    `/**
 * 마케팅 캠페인 barrel — marketing-campaigns-core · marketing-line-oa · marketing-campaign-analytics
 */
export * from './marketing-campaigns-core'
export * from './marketing-line-oa'
export * from './marketing-campaign-analytics'
`
  )
}

{
  const lines = readLines("purchase-order.ts")
  const poImport = `/**
 * 본사 발주·매장 권한 API — purchase-order.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getPurchaseOrdersWithCache, getVendorsForPurchaseWithCache, getVendorsForSalesWithCache } from '../offline/erp-offline'
import { jsonAsArray } from '../safe-api-json'
`
  const billingImport = `/**
 * PO 청구 설정 API — purchase-order.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
`
  const docsImport = `/**
 * 회사 하이브리드 문서 API — purchase-order.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
`

  writeModule(
    "purchase-order-core.ts",
    `${poImport}
${slice1(lines, 9, 175)}
${slice1(lines, 259, 339)}
`
  )

  writeModule(
    "purchase-order-billing.ts",
    `${billingImport}
${slice1(lines, 176, 258)}
`
  )

  writeModule(
    "company-hybrid-documents.ts",
    `${docsImport}
${slice1(lines, 341, lines.length)}
`
  )

  writeModule(
    "purchase-order.ts",
    `/**
 * 발주·문서 barrel — purchase-order-core · purchase-order-billing · company-hybrid-documents
 */
export * from './purchase-order-core'
export * from './purchase-order-billing'
export * from './company-hybrid-documents'
`
  )
}

console.log("split-api-client-phase7: done")
