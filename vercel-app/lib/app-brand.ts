export type AppBrandKey = "choongman" | "omnifoodtech"

export interface AppBrandConfig {
  key: AppBrandKey
  appName: string
  loginTitle: string
  loginSubtitle: string
  logoAlt: string
  logoSrc: string
  logoSymbolSrc: string
  /** 모바일 상단바 등 좁은 영역용 짧은 이름 (예: Omni, 충만치킨) */
  headerWordmark: string
  headerTitle: string
  manifestPath: string
  iconPath: string
  domain: string
  /** 기본 HTML 메타 description (검색·링크 미리보기) */
  metadataDescription: string
}

export function normalizeBrandKey(raw: string): AppBrandKey {
  const v = String(raw || "").trim().toLowerCase()
  if (v === "omnifoodtech" || v === "omni" || v === "saas") return "omnifoodtech"
  return "choongman"
}

function normalizeDomain(raw: string, key: AppBrandKey): string {
  const d = String(raw || "").trim()
  if (d) return d
  return key === "omnifoodtech" ? "omnifoodtech.com" : "choongman.kr"
}

export function getAppBrandConfigForKey(key: AppBrandKey): AppBrandConfig {
  const domain = normalizeDomain(process.env.NEXT_PUBLIC_APP_DOMAIN || process.env.APP_DOMAIN || "", key)
  if (key === "omnifoodtech") {
    return {
      key,
      appName: "OmniFoodTech ERP",
      loginTitle: "OMNIFOODTECH ERP",
      loginSubtitle: "PLATFORM",
      logoAlt: "OmniFoodTech",
      logoSrc: "/omnifoodtech-logo.svg",
      logoSymbolSrc: "/omnifoodtech-icon.svg",
      headerWordmark: "Omni",
      headerTitle: "OmniFoodTech SaaS",
      manifestPath: "/manifest-omnifoodtech.json",
      iconPath: "/omnifoodtech-icon.svg",
      domain,
      metadataDescription:
        "OmniFoodTech AI ERP / POS — store operations, orders, and compliance in one platform.",
    }
  }
  return {
    key,
    appName: "CHOONGMAN ERP MANAGER",
    loginTitle: "CM ERP SYSTEM",
    loginSubtitle: "INTERNAL",
    logoAlt: "Choongman Chicken",
    logoSrc: "/img/logo.png",
    logoSymbolSrc: "/img/logo.png",
    headerWordmark: "충만치킨",
    headerTitle: "충만치킨 ERP",
    manifestPath: "/manifest.json",
    iconPath: "/icon-192.png",
    domain,
    metadataDescription: "충만치킨 CM ERP — 출고·매장·근태 등 내부 운영 관리 시스템",
  }
}

function readBrandKeyFromBrowserCookie(): AppBrandKey | null {
  if (typeof document === "undefined") return null
  try {
    const raw = document.cookie || ""
    const hit = raw
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("__app_brand="))
    if (!hit) return null
    const val = decodeURIComponent(hit.slice("__app_brand=".length))
    if (val === "omnifoodtech") return "omnifoodtech"
    if (val === "choongman") return "choongman"
    return null
  } catch {
    return null
  }
}

/** Provider 밖·테스트용: env만 반영 (미들웨어/Host 없음) */
export function getAppBrandConfigFromEnv(): AppBrandConfig {
  // 브라우저에서는 미들웨어가 넣은 쿠키를 우선 사용해 도메인 브랜드를 정확히 유지한다.
  const fromCookie = readBrandKeyFromBrowserCookie()
  if (fromCookie) return getAppBrandConfigForKey(fromCookie)

  const key = normalizeBrandKey(process.env.NEXT_PUBLIC_APP_BRAND || process.env.APP_BRAND || "")
  return getAppBrandConfigForKey(key)
}

/** @deprecated 서버는 getServerAppBrandConfig, 클라이언트는 useAppBrandConfig 사용 */
export function getAppBrandConfig(): AppBrandConfig {
  return getAppBrandConfigFromEnv()
}

export function isSaasBrand(): boolean {
  return getAppBrandConfigFromEnv().key === "omnifoodtech"
}
