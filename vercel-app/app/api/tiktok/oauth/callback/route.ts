import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { tiktokEnvFallback, tiktokExchangeAccessToken, tiktokListAdvertisers } from "@/lib/tiktok-ads"
import { upsertTikTokConnection } from "@/lib/tiktok-connection-server"

export const dynamic = "force-dynamic"

function integrationsRedirect(req: NextRequest, query: Record<string, string>): NextResponse {
  const url = new URL("/admin/marketing/integrations", req.nextUrl.origin)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url)
  res.cookies.set("cm_tiktok_oauth_state", "", { path: "/", maxAge: 0 })
  return res
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) {
    return integrationsRedirect(req, { tiktok: "auth" })
  }

  const authCode = String(
    req.nextUrl.searchParams.get("auth_code") || req.nextUrl.searchParams.get("code") || ""
  ).trim()
  const state = String(req.nextUrl.searchParams.get("state") || "").trim()
  const err = String(req.nextUrl.searchParams.get("error") || "").trim()
  const cookieState = req.cookies.get("cm_tiktok_oauth_state")?.value || ""

  if (err) return integrationsRedirect(req, { tiktok: "denied" })
  if (!authCode || !state || !cookieState || state !== cookieState) {
    return integrationsRedirect(req, { tiktok: "state" })
  }

  try {
    const exchanged = await tiktokExchangeAccessToken(authCode)
    if (!exchanged.ok || !exchanged.accessToken) {
      return integrationsRedirect(req, { tiktok: exchanged.error === "config" ? "config" : "token" })
    }

    const listed = await tiktokListAdvertisers(exchanged.accessToken)
    const advertisers =
      listed.ok && listed.advertisers.length > 0
        ? listed.advertisers
        : exchanged.advertiserIds.map((id) => ({ id, name: id }))

    if (advertisers.length === 0) {
      return integrationsRedirect(req, { tiktok: "noadv" })
    }

    const envAdv = tiktokEnvFallback().advertiserId
    const envMatch = advertisers.find((a) => envAdv && a.id === envAdv)
    const picked = envMatch || (advertisers.length === 1 ? advertisers[0] : null)
    const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
    const scopes = exchanged.scope.join(",")

    if (!picked) {
      await upsertTikTokConnection(tenantScope, {
        advertiserId: "",
        advertiserName: "",
        accessToken: exchanged.accessToken,
        grantedScopes: scopes,
        lastSync: null,
      })
      return integrationsRedirect(req, { tiktok: "pick" })
    }

    await upsertTikTokConnection(tenantScope, {
      advertiserId: picked.id,
      advertiserName: picked.name,
      accessToken: exchanged.accessToken,
      grantedScopes: scopes,
      lastSync: null,
    })
    return integrationsRedirect(req, { tiktok: "ok" })
  } catch {
    return integrationsRedirect(req, { tiktok: "error" })
  }
}
