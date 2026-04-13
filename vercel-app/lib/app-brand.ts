export type AppBrandKey = "choongman" | "omnifoodtech"

export interface AppBrandConfig {
  key: AppBrandKey
  appName: string
  loginTitle: string
  loginSubtitle: string
  logoAlt: string
  logoSrc: string
  logoSymbolSrc: string
  headerTitle: string
  manifestPath: string
  iconPath: string
  domain: string
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
      headerTitle: "OmniFoodTech SaaS",
      manifestPath: "/manifest-omnifoodtech.json",
      iconPath: "/omnifoodtech-icon.svg",
      domain,
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
    headerTitle: "충만치킨 ERP",
    manifestPath: "/manifest.json",
    iconPath: "/icon-192.png",
    domain,
  }
}

/** Provider 밖·테스트용: env만 반영 (미들웨어/Host 없음) */
export function getAppBrandConfigFromEnv(): AppBrandConfig {
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
