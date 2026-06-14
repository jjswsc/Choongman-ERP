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
  const lines = readLines("pos-operations.ts")
  const header = slice1(lines, 1, 11)

  const couponImport = `${header}
`
  const tablePrinterImport = `${header}
`
  const devicesImport = `${header.replace("jsonAsArray", "jsonAsArray /* devices */")}`
  // keep same imports for all - read actual header
  const baseImport = `/**
 * POS 쿠폰 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
`
  const tableImport = `/**
 * POS 테이블·프린터·서랍 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached, notifyPosCatalogUpdated } from '../offline/pos-catalog-offline'
import { getFromErpCache, setErpCache } from '../offline/cache'
import { jsonAsArray } from '../safe-api-json'
`
  const deviceImport = `/**
 * POS·근태 QR 단말 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
`
  const deliveryImport = `/**
 * POS 배달앱·Grab 연동 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
`
  const screenImport = `/**
 * POS 메뉴 화면·보드 설정 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
import { jsonAsArray } from '../safe-api-json'
`
  const paymentImport = `/**
 * POS 결제 수단 설정 API — pos-operations.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { fetchPosCatalogCached } from '../offline/pos-catalog-offline'
`

  writeModule("pos-coupons.ts", `${baseImport}\n${slice1(lines, 12, 142)}`)
  writeModule("pos-table-printer.ts", `${tableImport}\n${slice1(lines, 144, 500)}`)
  writeModule(
    "pos-devices.ts",
    `${deviceImport}\n${slice1(lines, 502, 702)}`
  )
  writeModule("pos-delivery-apps.ts", `${deliveryImport}\n${slice1(lines, 704, 775)}`)
  writeModule("pos-screen-config.ts", `${screenImport}\n${slice1(lines, 777, 892)}`)
  writeModule("pos-payment-settings.ts", `${paymentImport}\n${slice1(lines, 894, lines.length)}`)

  writeModule(
    "pos-operations.ts",
    `/**
 * POS 운영 barrel — pos-coupons · pos-table-printer · pos-devices · pos-delivery-apps · pos-screen-config · pos-payment-settings
 */
export * from './pos-coupons'
export * from './pos-table-printer'
export * from './pos-devices'
export * from './pos-delivery-apps'
export * from './pos-screen-config'
export * from './pos-payment-settings'
`
  )
}

console.log("split-api-client-phase8: done")
