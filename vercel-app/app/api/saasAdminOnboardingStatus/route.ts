import { NextRequest, NextResponse } from "next/server"
import {
  assertTenantInScope,
  loadPartnerTenantIdSet,
  requireSaasControlPlane,
  saasScopeToClientMeta,
  type SaasScope,
} from "@/lib/saas-control-plane-scope"
import { supabaseSelectFilter, supabaseUpsertMerge } from "@/lib/supabase-server"
import { SAAS_TENANT_LIST_LIMIT } from "@/lib/saas-tenant-usage-server"
import {
  buildAllOnboardingStatuses,
  buildOnboardingStatusForTenant,
  isOnboardingFlagsColumnMissingError,
  mergeOnboardingFlags,
} from "@/lib/saas-onboarding-server"
import { parseOnboardingFlags } from "@/lib/saas-onboarding-status"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse
  const scopeMeta = saasScopeToClientMeta(cp.scope)

  const tenantId = String(req.nextUrl.searchParams.get("tenantId") || "").trim()
  const storesQ = Math.max(0, Number(req.nextUrl.searchParams.get("stores") || 0))
  const managersQ = Math.max(0, Number(req.nextUrl.searchParams.get("managers") || 0))

  try {
    if (tenantId) {
      const inScope = await assertTenantInScope(cp.scope, tenantId)
      if (!inScope) {
        return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
      }
      const row = await buildOnboardingStatusForTenant({
        tenantId,
        usage: { stores: storesQ, managerAccounts: managersQ },
        pricing: {},
      })
      return NextResponse.json({ success: true, row, scope: scopeMeta }, { headers })
    }

    const tenants = await loadAllTenantUsage(cp.scope)
    const rows = await buildAllOnboardingStatuses(tenants)
    const map: Record<string, (typeof rows)[number]> = {}
    for (const row of rows) map[row.tenantId] = row
    return NextResponse.json({ success: true, rows, map, scope: scopeMeta }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}

async function loadAllTenantUsage(
  scope: SaasScope
): Promise<
  Array<{ id: string; usage: { stores: number; managerAccounts: number }; pricing: { modulePrices?: unknown } }>
> {
  if (!scope) return []
  try {
    const rows = (await supabaseSelectFilter("tenants", "", {
      limit: SAAS_TENANT_LIST_LIMIT,
      select: "id",
      order: "created_at.asc",
    })) as {
      id?: string
    }[]
    let ids = rows.filter((x) => x.id).map((x) => x.id!)
    if (scope.kind === "partner") {
      const allowed = await loadPartnerTenantIdSet(scope.partnerId)
      ids = ids.filter((id) => allowed.has(id))
    }
    return ids.map((id) => ({ id, usage: { stores: 0, managerAccounts: 0 }, pricing: {} }))
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

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

    const inScope = await assertTenantInScope(cp.scope, tenantId)
    if (!inScope) {
      return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
    }

    const patch: Record<string, boolean> = {}
    if (body.pricingConfirmed === true) patch.pricingConfirmed = true
    if (body.integrationsSkipped === true) patch.integrationsSkipped = true
    if (body.loginVerified === true) patch.loginVerified = true

    let flagsPersisted = true
    let mergedFlags: Awaited<ReturnType<typeof mergeOnboardingFlags>> | undefined

    if (Object.keys(patch).length > 0) {
      mergedFlags = await mergeOnboardingFlags(tenantId, patch)
      try {
        await supabaseUpsertMerge("tenants", "id", {
          id: tenantId,
          onboarding_flags: mergedFlags,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!isOnboardingFlagsColumnMissingError(msg)) throw e
        flagsPersisted = false
      }
    }

    const row = await buildOnboardingStatusForTenant({
      tenantId,
      usage: {
        stores: Math.max(0, Number(body.usage?.stores || 0)),
        managerAccounts: Math.max(0, Number(body.usage?.managerAccounts || 0)),
      },
      pricing: body.pricing || {},
      flagsOverride: !flagsPersisted && mergedFlags ? mergedFlags : undefined,
    })

    return NextResponse.json(
      {
        success: true,
        flagsPersisted,
        flags: parseOnboardingFlags(row.flags),
        row,
        ...(flagsPersisted === false
          ? {
              code: "onboarding_flags_missing",
              warning:
                "onboarding_flags 컬럼이 없어 완료 표시가 DB에 저장되지 않습니다. Supabase SQL Editor에서 vercel-app/sql/saas_tenant_onboarding.sql 을 실행해 주세요.",
            }
          : {}),
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}
