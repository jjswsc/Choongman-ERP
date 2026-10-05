import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { META_GRAPH_VERSION, metaAppCredentials, metaEnvFallback, metaGraphGet } from "@/lib/meta-graph"
import { upsertMetaConnection } from "@/lib/meta-connection-server"

export const dynamic = "force-dynamic"

function redirectUri(req: NextRequest): string {
  const env = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  const origin = env || req.nextUrl.origin
  return `${origin}/api/meta/oauth/callback`
}

function integrationsRedirect(req: NextRequest, query: Record<string, string>): NextResponse {
  const url = new URL("/admin/marketing/integrations", req.nextUrl.origin)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url)
  res.cookies.set("cm_meta_oauth_state", "", { path: "/", maxAge: 0 })
  return res
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) {
    return integrationsRedirect(req, { meta: "auth" })
  }
  const code = String(req.nextUrl.searchParams.get("code") || "").trim()
  const state = String(req.nextUrl.searchParams.get("state") || "").trim()
  const err = String(req.nextUrl.searchParams.get("error") || "").trim()
  const cookieState = req.cookies.get("cm_meta_oauth_state")?.value || ""
  if (err) return integrationsRedirect(req, { meta: "denied" })
  if (!code || !state || !cookieState || state !== cookieState) {
    return integrationsRedirect(req, { meta: "state" })
  }

  const { appId, appSecret } = metaAppCredentials()
  if (!appId || !appSecret) return integrationsRedirect(req, { meta: "config" })

  try {
    const tokenUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
    tokenUrl.searchParams.set("client_id", appId)
    tokenUrl.searchParams.set("redirect_uri", redirectUri(req))
    tokenUrl.searchParams.set("client_secret", appSecret)
    tokenUrl.searchParams.set("code", code)
    const tokenRes = await fetch(tokenUrl.toString(), { cache: "no-store" })
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message?: string } }
    let userToken = String(tokenJson.access_token || "")
    if (!userToken) return integrationsRedirect(req, { meta: "token" })

    const llUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`)
    llUrl.searchParams.set("grant_type", "fb_exchange_token")
    llUrl.searchParams.set("client_id", appId)
    llUrl.searchParams.set("client_secret", appSecret)
    llUrl.searchParams.set("fb_exchange_token", userToken)
    const llRes = await fetch(llUrl.toString(), { cache: "no-store" })
    const llJson = (await llRes.json()) as { access_token?: string }
    if (llJson.access_token) userToken = llJson.access_token

    const perm = await metaGraphGet<{ data?: { permission?: string; status?: string }[] }>(
      "me/permissions",
      userToken
    )
    const granted = (perm.json?.data || [])
      .filter((p) => p.status === "granted")
      .map((p) => String(p.permission || ""))
      .filter(Boolean)

    const accounts = await metaGraphGet<{ data?: { id?: string; name?: string; access_token?: string }[] }>(
      "me/accounts",
      userToken
    )
    const envPage = metaEnvFallback().pageId
    const pages = accounts.json?.data || []
    const envMatch = pages.find((p) => envPage && String(p.id) === envPage)
    const picked = envMatch || (pages.length === 1 ? pages[0] : null)
    if (pages.length === 0) {
      return integrationsRedirect(req, { meta: "nopage" })
    }

    const acts = await metaGraphGet<{ data?: { id?: string; account_id?: string }[] }>(
      "me/adaccounts",
      userToken,
      {
        fields: "id,account_id,name",
        limit: "50",
      }
    )
    const envAd = metaEnvFallback().adAccountId.replace(/^act_/i, "").trim()
    const actRows = acts.json?.data || []
    const envAdMatch = actRows.find((a) => {
      const raw = String(a.id || a.account_id || "").replace(/^act_/i, "")
      return envAd && raw === envAd
    })
    // 계정이 여러 개면 첫 계정을 자동 고르지 않는다. 연동 화면에서 고르게 한다.
    const adAccountId =
      (envAdMatch
        ? String(envAdMatch.id || envAdMatch.account_id || "")
        : envAd
          ? `act_${envAd}`
          : actRows.length === 1
            ? String(actRows[0]?.id || actRows[0]?.account_id || "")
            : "") || ""

    const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
    if (!picked?.id || !picked.access_token) {
      await upsertMetaConnection(tenantScope, {
        pageId: "",
        pageName: "",
        adAccountId,
        pageToken: userToken,
        userToken,
        tokenKind: "page",
        grantedScopes: granted.join(","),
        lastSync: null,
      })
      return integrationsRedirect(req, { meta: "pick" })
    }

    await upsertMetaConnection(tenantScope, {
      pageId: String(picked.id),
      pageName: String(picked.name || ""),
      adAccountId,
      pageToken: String(picked.access_token),
      userToken,
      tokenKind: "page",
      grantedScopes: granted.join(","),
      lastSync: null,
    })
    return integrationsRedirect(req, { meta: "ok" })
  } catch {
    return integrationsRedirect(req, { meta: "error" })
  }
}
