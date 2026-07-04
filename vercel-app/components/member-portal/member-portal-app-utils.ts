import {
  DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES,
  type MemberPortalHomePrivilegeItem,
} from "@/lib/member-portal-home-privileges-config"
import { DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL } from "@/lib/member-portal-stamp-food-image"
import { DEFAULT_MEMBER_PORTAL_UI_THEME } from "@/lib/member-portal-theme"
import type { MemberPortalStoreDto } from "@/lib/member-portal-stores"

export { DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES, DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL }

// ── Types ──

export type MemberPortalStoreRow = MemberPortalStoreDto

export type PublicConfigResponse = {
  success: boolean
  facebookUrl?: string
  instagramUrl?: string
  lineOfficialUrl?: string
  loginBackgroundUrl?: string
  appBackgroundUrl?: string
  heroFoodImageUrl?: string
  signupWelcomeCouponEnabled?: boolean
  textPrimaryColor?: string
  textSecondaryColor?: string
  fontScalePct?: number
  homePrivileges?: MemberPortalHomePrivilegeItem[]
  stampFoodImageUrl?: string
}

// ── Helper functions ──

export async function postJson<T>(url: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  })
  return res.json() as Promise<T>
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", credentials: "same-origin" })
  return res.json() as Promise<T>
}

export function publicConfigUrl(): string {
  return `/api/member-portal/public-config?_=${Date.now()}`
}

export function applyPublicConfigToState(
  r: PublicConfigResponse,
  brand: {
    memberContactFacebookUrl: string
    memberContactInstagramUrl: string
    memberContactLineOfficialUrl: string
  },
  opts?: {
    previewLoginBackgroundUrl?: string
    previewAppBackgroundUrl?: string
  }
) {
  const previewLogin = String(opts?.previewLoginBackgroundUrl || "").trim()
  const previewApp = String(opts?.previewAppBackgroundUrl || "").trim()
  return {
    contactUrls: {
      facebookUrl: String(r.facebookUrl || brand.memberContactFacebookUrl).trim(),
      instagramUrl: String(r.instagramUrl || brand.memberContactInstagramUrl).trim(),
      lineOfficialUrl: String(r.lineOfficialUrl || brand.memberContactLineOfficialUrl).trim(),
    },
    designBackgrounds: {
      loginBackgroundUrl: previewLogin || String(r.loginBackgroundUrl || "").trim(),
      appBackgroundUrl: previewApp || String(r.appBackgroundUrl || "").trim(),
      heroFoodImageUrl: String(r.heroFoodImageUrl || "").trim(),
    },
    uiTheme: {
      textPrimaryColor: String(r.textPrimaryColor || DEFAULT_MEMBER_PORTAL_UI_THEME.textPrimaryColor),
      textSecondaryColor: String(r.textSecondaryColor || DEFAULT_MEMBER_PORTAL_UI_THEME.textSecondaryColor),
      fontScalePct: Number(r.fontScalePct) || DEFAULT_MEMBER_PORTAL_UI_THEME.fontScalePct,
    },
    signupWelcomeCouponEnabled: Boolean(r.signupWelcomeCouponEnabled),
    homePrivileges: Array.isArray(r.homePrivileges) ? r.homePrivileges : DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES,
    stampFoodImageUrl: String(r.stampFoodImageUrl || DEFAULT_MEMBER_PORTAL_STAMP_FOOD_IMAGE_URL).trim(),
  }
}
