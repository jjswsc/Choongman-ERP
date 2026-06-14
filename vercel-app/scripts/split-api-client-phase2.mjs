import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const lib = path.join(root, "lib", "api-client")

function readLines(name) {
  return fs.readFileSync(path.join(lib, name), "utf8").split(/\r?\n/)
}

function writeModule(name, header, bodyLines) {
  const body = bodyLines.join("\n").trimEnd() + "\n"
  fs.writeFileSync(path.join(lib, name), header + body + "\n", "utf8")
}

function slice1(lines, start, end) {
  return lines.slice(start - 1, end)
}

// --- income-statement → balance-sheet + thai-tax-filing ---
{
  const lines = readLines("income-statement.ts")
  const headerBase = `/**
 * (%NAME%) — income-statement.ts에서 분리 — move only
 */
`
  const bsHeader =
    headerBase.replace("%NAME%", "재무상태표·보조원장") +
    `import { apiFetchWithOffline } from '../api/fetch-offline'

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

`
  const bsBody = slice1(lines, 491, 634)
  writeModule("balance-sheet.ts", bsHeader, bsBody)

  const taxHeader =
    headerBase.replace("%NAME%", "태국 세무·회계 마감·워크플로") +
    `import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'

`
  const taxBody = slice1(lines, 636, lines.length)
  writeModule("thai-tax-filing.ts", taxHeader, taxBody)

  const isHeader = lines.slice(0, 7).join("\n") + "\n"
  const isBody = slice1(lines, 13, 489)
  writeModule(
    "income-statement.ts",
    isHeader +
      `\nfunction isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

`,
    isBody
  )
}

// --- pos-operations → pos-settlement + pos-payment-gateways ---
{
  const lines = readLines("pos-operations.ts")
  const imports =
    `import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getFromErpCache, setErpCache } from '../offline/cache'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from '../pos-business-day'
import { isLinkposCardApiEnabled } from '../linkpos-card-api-enabled'
import { jsonAsArray } from '../safe-api-json'
import type { PosPaymentOtherBreakdown } from '../pos-payment-other-breakdown'

`

  const gwHeader = `/**
 * POS 결제 게이트웨이 (Linkpos·KBank) — pos-operations.ts에서 분리 — move only
 */
${imports}`

  const gwBody = slice1(lines, 1879, 2428)
  writeModule("pos-payment-gateways.ts", gwHeader, gwBody)

  const settleHeader = `/**
 * POS 주문·정산·세금계산서 — pos-operations.ts에서 분리 — move only
 */
${imports}`

  const settleBody = [...slice1(lines, 963, 1877), ...slice1(lines, 2430, lines.length)]
  writeModule("pos-settlement.ts", settleHeader, settleBody)

  const opsHeader = `/**
 * POS 매장 설정 API — 쿠폰·테이블·프린터·기기·결제설정 (move only)
 */
${imports}`

  const opsBody = slice1(lines, 13, 961)
  writeModule("pos-operations.ts", opsHeader, opsBody)
}

console.log("split-api-client-phase2: done")
