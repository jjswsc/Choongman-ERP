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
  const hostOnly = v.split(":")[0] || v
  const isLocal =
    hostOnly === "localhost" ||
    hostOnly === "127.0.0.1" ||
    hostOnly === "[::1]" ||
    hostOnly.endsWith(".localhost")
  /** localhost는 도메인만으로 충만 강제하지 않음 — env / 미들웨어 헤더로 Omni 로컬 테스트 가능 */
  if (isLocal) return null
  return "choongman"
}

/**
 * 요청 Host(미들웨어가 넣은 x-app-brand) → 브랜드.
 * - Host가 omnifoodtech이면 항상 Omni(판매 도메인에 잘못된 env가 있어도 로고 일치).
 * - Host가 choongman(충만 도메인·vercel.app 등)이면 env가 omni여도 충만 — tenant_id 조회 등 SaaS 전용 로직 차단.
 * - localhost는 env(`NEXT_PUBLIC_APP_BRAND=omnifoodtech`)로 Omni 로컬 테스트 가능.
 */
async function resolveBrandKey(): Promise<AppBrandKey> {
  const h = await headers()
  const fromMw = brandKeyFromHeader(h.get(BRAND_HEADER))
  const fromHost = brandKeyFromHost(h.get("x-forwarded-host") || h.get("host"))
  if (fromMw === "omnifoodtech") return "omnifoodtech"
  if (fromHost === "omnifoodtech") return "omnifoodtech"
  if (fromMw === "choongman" || fromHost === "choongman") return "choongman"

  const envRaw = process.env.NEXT_PUBLIC_APP_BRAND || process.env.APP_BRAND || ""
  if (envRaw.trim()) return normalizeBrandKey(envRaw)

  return "choongman"
}

export async function getServerAppBrandConfig(): Promise<AppBrandConfig> {
  const key = await resolveBrandKey()
  return getAppBrandConfigForKey(key)
}

/** 서버 API·웹훅 — Host/x-app-brand 기준 SaaS(Omni) 여부 */
export async function isServerSaasBrand(): Promise<boolean> {
  const brand = await getServerAppBrandConfig()
  return brand.key === "omnifoodtech"
}
