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
  const lines = readLines("pos-settlement.ts")
  const orderImportBlock = `/**
 * POS 주문·영업일·주문 변경 API — pos-settlement.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from '../pos-business-day'
import { jsonAsArray } from '../safe-api-json'
import type { PosPaymentOtherBreakdown } from '../pos-payment-other-breakdown'
import type { PosAppliedCoupon } from './pos-operations'
import type { LinkposPaymentSummary } from './pos-payment-gateways'
`

  const closeImportBlock = `/**
 * POS 정산·마감·채널 정산 API — pos-settlement.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
`

  const taxImportBlock = `/**
 * POS 세금계산서 수신처 API — pos-settlement.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
`

  writeModule(
    "pos-orders.ts",
    `${orderImportBlock}
${slice1(lines, 13, 306)}
${slice1(lines, 653, 997)}
`
  )

  writeModule(
    "pos-settlement-close.ts",
    `${closeImportBlock}
${slice1(lines, 308, 651)}
`
  )

  writeModule(
    "pos-tax-invoice-recipients.ts",
    `${taxImportBlock}
${slice1(lines, 998, lines.length)}
`
  )

  writeModule(
    "pos-settlement.ts",
    `/**
 * POS 주문·정산·세금계산서 barrel — pos-orders · pos-settlement-close · pos-tax-invoice-recipients
 */
export * from './pos-orders'
export * from './pos-settlement-close'
export * from './pos-tax-invoice-recipients'
`
  )
}

console.log("split-api-client-phase6: done")
