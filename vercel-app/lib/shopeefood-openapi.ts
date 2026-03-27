/**
 * ShopeeFood OpenAPI (벤더 → Shopee) — 토큰 발급·요청 서명
 * 문서: auth token + Business API HMAC-SHA256(vendor_secret)
 */

import { createHmac } from 'node:crypto'

export type ShopeeFoodEnv = 'uat' | 'prod'

export function getShopeeFoodOpenApiBaseUrl(env: ShopeeFoodEnv = 'prod'): string {
  const override = process.env.SHOPEEFOOD_OPENAPI_BASE_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  const cid = process.env.SHOPEEFOOD_MARKET_CID?.trim() || 'co.th'
  if (env === 'uat') return `https://food-open.uat.shopee.${cid}`
  return `https://food-open.shopee.${cid}`
}

function resolveEnv(): ShopeeFoodEnv {
  const v = String(process.env.SHOPEEFOOD_OPENAPI_ENV || 'prod').toLowerCase()
  return v === 'uat' || v === 'staging' ? 'uat' : 'prod'
}

export interface ShopeeFoodTokenResponse {
  code: number
  msg: string
  data?: { access_token?: string; expires_in?: number }
}

/** POST /api/adaptor/:vendor_id/v1/auth/token */
export async function fetchShopeeFoodAccessToken(params: {
  vendorId: string
  vendorSecret: string
}): Promise<{ access_token: string; expires_in: number }> {
  const env = resolveEnv()
  const base = getShopeeFoodOpenApiBaseUrl(env)
  const vendorId = String(params.vendorId).trim()
  const secret = String(params.vendorSecret).trim()
  const basic = Buffer.from(`${vendorId}:${secret}`, 'utf8').toString('base64')
  const url = `${base}/api/adaptor/${encodeURIComponent(vendorId)}/v1/auth/token`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: 'grant_type=client_credentials&scope=all',
  })
  const raw = await res.text()
  let json: ShopeeFoodTokenResponse
  try {
    json = JSON.parse(raw) as ShopeeFoodTokenResponse
  } catch {
    throw new Error(`ShopeeFood token: non-JSON (${res.status}) ${raw.slice(0, 200)}`)
  }
  if (!res.ok || json.code !== 0 || !json.data?.access_token) {
    throw new Error(`ShopeeFood token failed: ${res.status} ${json.msg || raw.slice(0, 200)}`)
  }
  return {
    access_token: String(json.data.access_token),
    expires_in: Number(json.data.expires_in ?? 3600),
  }
}

/**
 * 서명용 문자열: access_token, app_id, path, payload, timestamp 를 키 이름 ASCII 정렬 후 & 연결
 * payload: POST는 body 원문, GET은 query string
 */
export function buildShopeeFoodSignaturePlain(params: {
  accessToken: string
  appId: string
  path: string
  payload: string
  timestampSec: number
}): string {
  const access_token = params.accessToken
  const app_id = params.appId
  const path = params.path
  const payload = params.payload
  const timestamp = String(params.timestampSec)
  return `access_token=${access_token}&app_id=${app_id}&path=${path}&payload=${payload}&timestamp=${timestamp}`
}

export function hmacSha256HexLower(secret: string, content: string): string {
  return createHmac('sha256', secret).update(content, 'utf8').digest('hex')
}
