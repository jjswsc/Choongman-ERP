import { NextRequest, NextResponse } from "next/server"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseSelectFilter, supabaseUpsertMerge } from "@/lib/supabase-server"
import {
  buildAllOnboardingStatuses,
  buildOnboardingStatusForTenant,
  mergeOnboardingFlags,
} from "@/lib/saas-onboarding-server"
import { parseOnboardingFlags } from "@/lib/saas-onboarding-status"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  const tenantId = String(req.nextUrl.searchParams.get("tenantId") || "").trim()
  const storesQ = Math.max(0, Number(req.nextUrl.searchParams.get("stores") || 0))
  const managersQ = Math.max(0, Number(req.nextUrl.searchParams.get("managers") || 0))

  try {
    if (tenantId) {
      const row = await buildOnboardingStatusForTenant({
        tenantId,
        usage: { stores: storesQ, managerAccounts: managersQ },
        pricing: {},
      })
      return NextResponse.json({ success: true, row }, { headers })
    }

    const tenants = await loadAllTenantUsage()
    const rows = await buildAllOnboardingStatuses(tenants)
    const map: Record<string, (typeof rows)[number]> = {}
    for (const row of rows) map[row.tenantId] = row
    return NextResponse.json({ success: true, rows, map }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}

async function loadAllTenantUsage(): Promise<
  Array<{ id: string; usage: { stores: number; managerAccounts: number }; pricing: { modulePrices?: unknown } }>
> {
  try {
    const rows = (await supabaseSelectFilter("tenants", "", { limit: 500, select: "id", order: "created_at.asc" })) as {
      id?: string
    }[]
    return rows
      .filter((x) => x.id)
      .map((x) => ({ id: x.id!, usage: { stores: 0, managerAccounts: 0 }, pricing: {} }))
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as {
      tenantId?: string
      usage?: { stores?: number; managerAccounts?: number }
      pricing?: { modulePrices?: unknown }
      pricingConfirmed?: boolean
      integrationsSkipped?: boolean
      loginVerified?: boolean
    }
    const tenantId = String(body.tenantId || "").trim()
    if (!tenantId) {
      return NextResponse.json({ success: false, message: "tenantId가 필요합니다." }, { status: 400, headers })
    }

    const patch: Record<string, boolean> = {}
    if (body.pricingConfirmed === true) patch.pricingConfirmed = true
    if (body.integrationsSkipped === true) patch.integrationsSkipped = true
    if (body.loginVerified === true) patch.loginVerified = true

    if (Object.keys(patch).length > 0) {
      const merged = await mergeOnboardingFlags(tenantId, patch)
      await supabaseUpsertMerge("tenants", "id", {
        id: tenantId,
        onboarding_flags: merged,
      })
    }

    const row = await buildOnboardingStatusForTenant({
      tenantId,
      usage: {
        stores: Math.max(0, Number(body.usage?.stores || 0)),
        managerAccounts: Math.max(0, Number(body.usage?.managerAccounts || 0)),
      },
      pricing: body.pricing || {},
    })

    return NextResponse.json({ success: true, flags: parseOnboardingFlags(row.flags), row }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/column|onboarding_flags|42703/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          message: "onboarding_flags 컬럼이 없습니다. Supabase에서 sql/saas_tenant_onboarding.sql 을 실행해 주세요.",
          code: "onboarding_flags_missing",
        },
        { status: 503, headers }
      )
    }
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}
