import { headers } from "next/headers"
import {
  getAppBrandConfigForKey,
  normalizeBrandKey,
  type AppBrandConfig,
  type AppBrandKey,
} from "@/lib/app-brand"

const BRAND_HEADER = "x-app-brand"

function brandKeyFromHeader(raw: string | null): AppBrandKey | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (v === "omnifoodtech") return "omnifoodtech"
  if (v === "choongman") return "choongman"
  return null
}

function brandKeyFromHost(raw: string | null): AppBrandKey | null {
  if (!raw) return null
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (v.includes("omnifoodtech")) return "omnifoodtech"
  return "choongman"
}

/**
 * 요청 Host(미들웨어가 넣은 x-app-brand) → 브랜드.
 * - Host가 omnifoodtech이면 항상 Omni(판매 도메인에 잘못된 env가 있어도 로고 일치).
 * - 그 외에는 env → 미들웨어 choongman 순(로컬에서 NEXT_PUBLIC_APP_BRAND=omnifoodtech 로 Omni UI 테스트 가능).
 */
async function resolveBrandKey(): Promise<AppBrandKey> {
  const h = await headers()
  const fromMw = brandKeyFromHeader(h.get(BRAND_HEADER))
  const fromHost = brandKeyFromHost(h.get("x-forwarded-host") || h.get("host"))
  if (fromMw === "omnifoodtech") return "omnifoodtech"
  if (fromHost === "omnifoodtech") return "omnifoodtech"

  const envRaw = process.env.NEXT_PUBLIC_APP_BRAND || process.env.APP_BRAND || ""
  if (envRaw.trim()) return normalizeBrandKey(envRaw)

  if (fromMw === "choongman" || fromHost === "choongman") return "choongman"
  return "choongman"
}

export async function getServerAppBrandConfig(): Promise<AppBrandConfig> {
  const key = await resolveBrandKey()
  return getAppBrandConfigForKey(key)
}
