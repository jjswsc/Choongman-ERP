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

function joinSlices(lines, ranges) {
  return ranges.map(([s, e]) => slice1(lines, s, e)).join("\n\n")
}

// --- employees.ts → employees-core + employee-evaluations ---
{
  const lines = readLines("employees.ts")
  writeModule(
    "employees-core.ts",
    `/**
 * 직원 CRUD·가맹 다매장·定員 API — employees.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'

${slice1(lines, 8, 314)}
`
  )
  writeModule(
    "employee-evaluations.ts",
    `/**
 * 직원 평가·경고서 API — employees.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { attachEvalAnalyticsRedirectFlag, parseEvalAnalyticsErrorResponse } from '../eval-analytics-http-error'

${slice1(lines, 316, lines.length)}
`
  )
  writeModule(
    "employees.ts",
    `/**
 * 직원 관리 barrel — employees-core · employee-evaluations
 */
export * from './employees-core'
export * from './employee-evaluations'
`
  )
}

// --- pos-menus.ts → catalog + delivery + cost ---
{
  const lines = readLines("pos-menus.ts")
  const importBlock = `import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import type { PosMenuUpsertApiBody } from '../pos-menu-upsert-server'
import { jsonAsArray } from '../safe-api-json'
import { parsePosMutationResponse } from './helpers'
`

  writeModule(
    "pos-menu-delivery.ts",
    `/**
 * POS 메뉴 배달앱·Grab 프로모 — pos-menus.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

${slice1(lines, 236, 386)}
`
  )

  writeModule(
    "pos-menu-cost.ts",
    `/**
 * POS 메뉴 원가·재료·원가감사 API — pos-menus.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
import { parsePosMutationResponse } from './helpers'

${slice1(lines, 581, lines.length)}
`
  )

  writeModule(
    "pos-menus.ts",
    `/**
 * POS 메뉴·옵션 catalog barrel + 본문 — pos-menu-delivery · pos-menu-cost 분리
 */
${importBlock}
export * from './pos-menu-delivery'
export * from './pos-menu-cost'

${joinSlices(lines, [
      [11, 235],
      [387, 580],
    ])}
`
  )
}

console.log("split-api-client-phase4: done")
