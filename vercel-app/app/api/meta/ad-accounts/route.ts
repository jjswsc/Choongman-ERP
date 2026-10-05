import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { isSaasTenantQueryBlocked, resolveSaasTenantScope } from "@/lib/saas-tenant-scope"
import {
  loadMetaConnectionRow,
  resolveLiveTokens,
  upsertMetaConnection,
} from "@/lib/meta-connection-server"
import { metaGraphGet, normalizeAdAccountId } from "@/lib/meta-graph"
import { supabaseUpdateByFilter } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type AdAccountRow = {
  id?: string
  name?: string
  account_id?: string
  account_status?: number
  currency?: string
}

function stripAct(id: string): string {
  return String(id || "")
    .trim()
    .replace(/^act_/i, "")
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_meta_connections")) {
    return NextResponse.json({ accounts: [], currentAdAccountId: "" })
  }

  const row = await loadMetaConnectionRow(tenantScope)
  const live = resolveLiveTokens(row)
  const token = live.userToken || live.pageToken
  const current = normalizeAdAccountId(live.adAccountId)
  if (!token) {
    return NextResponse.json({ accounts: [], currentAdAccountId: current })
  }

  const acts = await metaGraphGet<{ data?: AdAccountRow[] }>("me/adaccounts", token, {
    fields: "id,account_id,name,account_status,currency",
    limit: "50",
  })
  if (!acts.ok) {
    return NextResponse.json({
      accounts: [],
      currentAdAccountId: current,
      message: acts.error?.message || "adaccounts_error",
    })
  }

  const accounts = (acts.json?.data || [])
    .filter((a) => a?.id || a?.account_id)
    .map((a) => {
      const id = normalizeAdAccountId(String(a.id || a.account_id || ""))
      return {
        id,
        accountId: stripAct(id),
        name: String(a.name || id),
        currency: String(a.currency || ""),
        accountStatus: a.account_status ?? null,
      }
    })

  return NextResponse.json({
    accounts,
    currentAdAccountId: current,
    pendingPick: Boolean(live.source === "oauth" && accounts.length > 1 && !current),
  })
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, "marketing_meta_connections")) {
    return NextResponse.json({ success: false, message: "tenant_blocked" }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { adAccountId?: string }
  const wanted = normalizeAdAccountId(String(body.adAccountId || "").trim())
  if (!wanted) {
    return NextResponse.json({ success: false, message: "adAccountId required" }, { status: 400 })
  }

  const row = await loadMetaConnectionRow(tenantScope)
  const live = resolveLiveTokens(row)
  const token = live.userToken || live.pageToken
  if (!token) {
    return NextResponse.json({ success: false, message: "not_connected" }, { status: 400 })
  }

  const acts = await metaGraphGet<{ data?: AdAccountRow[] }>("me/adaccounts", token, {
    fields: "id,account_id,name",
    limit: "50",
  })
  const picked = (acts.json?.data || []).find((a) => {
    const id = normalizeAdAccountId(String(a.id || a.account_id || ""))
    return id === wanted || stripAct(id) === stripAct(wanted)
  })
  if (!picked) {
    return NextResponse.json({ success: false, message: "ad_account_not_found" }, { status: 404 })
  }

  const adAccountId = normalizeAdAccountId(String(picked.id || picked.account_id || wanted))
  const pageId = live.pageId
  const pageName = live.pageName
  const pageToken = live.pageToken || token
  const userToken = live.userToken || token

  if (live.source === "oauth" || row?.id) {
    if (pageId) {
      await upsertMetaConnection(tenantScope, {
        pageId,
        pageName,
        adAccountId,
        pageToken,
        userToken,
        tokenKind: live.tokenKind,
        grantedScopes: live.grantedScopes.join(","),
        lastSync: null,
      })
    } else if (row?.id) {
      await supabaseUpdateByFilter("marketing_meta_connections", `id=eq.${row.id}`, {
        ad_account_id: adAccountId,
        last_synced_at: null,
        last_sync_json: {},
        updated_at: new Date().toISOString(),
      })
    } else {
      await upsertMetaConnection(tenantScope, {
        pageId: "",
        pageName: "",
        adAccountId,
        pageToken: userToken,
        userToken,
        tokenKind: live.tokenKind,
        grantedScopes: live.grantedScopes.join(","),
        lastSync: null,
      })
    }
  }

  return NextResponse.json({
    success: true,
    adAccountId,
    name: String(picked.name || adAccountId),
  })
}
