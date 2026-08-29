import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { isSaasTenantQueryBlocked, resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import { loadMetaConnectionRow, resolveLiveTokens, upsertMetaConnection } from "@/lib/meta-connection-server"
import { metaEnvFallback, metaGraphGet, normalizeAdAccountId } from "@/lib/meta-graph"

export const dynamic = "force-dynamic"

type MetaPageAccount = { id?: string; name?: string; access_token?: string }

async function loadAccounts(token: string) {
  return metaGraphGet<{ data?: MetaPageAccount[] }>("me/accounts", token, {
    fields: "id,name,access_token",
    limit: "50",
  })
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_meta_connections")) {
    return NextResponse.json({ pages: [], currentPageId: "", pendingPick: false })
  }

  const row = await loadMetaConnectionRow(tenantScope)
  const live = resolveLiveTokens(row)
  const token = live.userToken || live.pageToken
  if (!token) {
    return NextResponse.json({ pages: [], currentPageId: live.pageId, pendingPick: false })
  }

  const accounts = await loadAccounts(token)
  const pages = (accounts.json?.data || [])
    .filter((p) => p?.id)
    .map((p) => ({ id: String(p.id), name: String(p.name || p.id) }))
  return NextResponse.json({
    pages,
    currentPageId: live.pageId,
    pendingPick: live.source === "oauth" && !live.pageId,
  })
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_meta_connections")) {
    return NextResponse.json({ success: false, message: "tenant_blocked" }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { pageId?: string }
  const pageId = String(body.pageId || "").trim()
  if (!pageId) {
    return NextResponse.json({ success: false, message: "pageId required" }, { status: 400 })
  }

  const row = await loadMetaConnectionRow(tenantScope)
  const live = resolveLiveTokens(row)
  const token = live.userToken || live.pageToken
  if (!token) {
    return NextResponse.json({ success: false, message: "not_connected" }, { status: 400 })
  }

  const accounts = await loadAccounts(token)
  const picked = (accounts.json?.data || []).find((p) => String(p.id) === pageId)
  if (!picked?.id || !picked.access_token) {
    return NextResponse.json({ success: false, message: "page_not_found" }, { status: 404 })
  }

  const envAd = metaEnvFallback().adAccountId
  let adAccountId = live.adAccountId || envAd
  if (!adAccountId) {
    const acts = await metaGraphGet<{ data?: { id?: string }[] }>("me/adaccounts", live.userToken || token, {
      fields: "id",
      limit: "5",
    })
    adAccountId = String(acts.json?.data?.[0]?.id || "")
  }

  await upsertMetaConnection(tenantScope, {
    pageId: String(picked.id),
    pageName: String(picked.name || ""),
    adAccountId: normalizeAdAccountId(adAccountId),
    pageToken: String(picked.access_token),
    userToken: live.userToken || token,
    tokenKind: "page",
    grantedScopes: live.grantedScopes.join(","),
    lastSync: null,
  })

  return NextResponse.json({
    success: true,
    pageId: String(picked.id),
    pageName: String(picked.name || ""),
  })
}
