import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = path.join(root, "lib", "api-client")

// 1) Split pos-operations.ts
const posOpsPath = path.join(dir, "pos-operations.ts")
const posLines = fs.readFileSync(posOpsPath, "utf8").split(/\r?\n/)
const splitAt = posLines.findIndex((l) => l.startsWith("export interface PosAppliedCoupon"))
if (splitAt < 0) throw new Error("PosAppliedCoupon marker not found")

const marketingHeader = `/**
 * 마케팅 판촉물·배포·사은품 API (pos-operations.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
import { apiJsonArrayResponse } from './helpers'

`
const posHeader = `/**
 * POS 운영 API — 쿠폰·테이블·프린터·주문·정산·KBank 등 (move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getFromErpCache, setErpCache } from '../offline/cache'
import { fetchPosCatalogCached, notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import { POS_BUSINESS_DAY_DEFAULT_START, POS_BUSINESS_DAY_DEFAULT_HOURS } from '../pos-business-day'
import { isLinkposCardApiEnabled } from '../linkpos-card-api-enabled'
import { jsonAsArray } from '../safe-api-json'
import type { PosPaymentOtherBreakdown } from '../pos-payment-other-breakdown'

`

const marketingBody = posLines.slice(13, splitAt).join("\n")
const posBody = posLines.slice(splitAt).join("\n")

fs.writeFileSync(path.join(dir, "marketing-materials.ts"), marketingHeader + marketingBody)
fs.writeFileSync(posOpsPath, posHeader + posBody)
console.log("Split pos-operations → marketing-materials.ts + pos-operations.ts")

// 2) mobile-home.ts
const barrelPath = path.join(root, "lib", "api-client.ts")
const barrelLines = fs.readFileSync(barrelPath, "utf8").split(/\r?\n/)
const mobileMarker = barrelLines.findIndex((l) => l.includes("/** 모바일 홈"))
if (mobileMarker < 0) throw new Error("mobile marker not found")

const mobileHeader = `/**
 * 모바일 홈 — 공지·급여 조회 (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { PaginatedList } from './types'

`
const mobileBody = barrelLines.slice(mobileMarker + 2).join("\n")
fs.writeFileSync(path.join(dir, "mobile-home.ts"), mobileHeader + mobileBody)

const barrelWithoutMobile = barrelLines.slice(0, mobileMarker).join("\n")
const withExports = barrelWithoutMobile.includes("marketing-materials")
  ? barrelWithoutMobile
  : barrelWithoutMobile.replace(
      "export * from './api-client/purchase-order'",
      [
        "export * from './api-client/purchase-order'",
        "export * from './api-client/marketing-materials'",
        "export * from './api-client/mobile-home'",
      ].join("\n")
    )
fs.writeFileSync(barrelPath, withExports.trimEnd() + "\n")
console.log("Created mobile-home.ts, updated api-client.ts barrel")
