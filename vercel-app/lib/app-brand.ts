export type AppBrandKey = "choongman" | "omnifoodtech"

export interface AppBrandConfig {
  key: AppBrandKey
  appName: string
  loginTitle: string
  loginSubtitle: string
  logoAlt: string
  domain: string
}

function normalizeBrandKey(raw: string): AppBrandKey {
  const v = String(raw || "").trim().toLowerCase()
  if (v === "omnifoodtech" || v === "omni" || v === "saas") return "omnifoodtech"
  return "choongman"
}

function normalizeDomain(raw: string, key: AppBrandKey): string {
  const d = String(raw || "").trim()
  if (d) return d
  return key === "omnifoodtech" ? "omnifoodtech.com" : "choongman.kr"
}

export function getAppBrandConfig(): AppBrandConfig {
  const key = normalizeBrandKey(process.env.NEXT_PUBLIC_APP_BRAND || process.env.APP_BRAND || "")
  const domain = normalizeDomain(process.env.NEXT_PUBLIC_APP_DOMAIN || process.env.APP_DOMAIN || "", key)
  if (key === "omnifoodtech") {
    return {
      key,
      appName: "OmniFoodTech ERP",
      loginTitle: "OMNIFOODTECH ERP",
      loginSubtitle: "PLATFORM",
      logoAlt: "OmniFoodTech",
      domain,
    }
  }
  return {
    key,
    appName: "CHOONGMAN ERP MANAGER",
    loginTitle: "CM ERP SYSTEM",
    loginSubtitle: "INTERNAL",
    logoAlt: "Choongman Chicken",
    domain,
  }
}

export function isSaasBrand(): boolean {
  return getAppBrandConfig().key === "omnifoodtech"
}
