import { NextRequest, NextResponse } from "next/server"
import {
  assertTenantInScope,
  requireSaasControlPlane,
} from "@/lib/saas-control-plane-scope"
import { assertSaasTabletRegistrationAllowed } from "@/lib/saas/saas-tablet-limit-server"
import {
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsert,
} from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

/** 태블릿(및 레지스트리) 목록 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  const tenantId = String(req.nextUrl.searchParams.get("tenantId") || "").trim().toLowerCase()
  if (!tenantId) {
    return NextResponse.json({ success: false, message: "tenantId required" }, { status: 400, headers })
  }
  if (!(await assertTenantInScope(cp.scope, tenantId))) {
    return NextResponse.json({ success: false, message: "forbidden" }, { status: 403, headers })
  }

  try {
    const kind = String(req.nextUrl.searchParams.get("kind") || "tablet").trim() || "tablet"
    const rows = (await supabaseSelectFilter(
      "tenant_device_registry",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&device_kind=eq.${encodeURIComponent(kind)}`,
      {
        limit: 5000,
        select: "id,tenant_id,store_name,device_kind,device_uuid,display_name,is_active,last_seen_at,created_at",
        order: "id.desc",
      }
    )) as Record<string, unknown>[]
    return NextResponse.json({ success: true, devices: rows || [] }, { headers })
  } catch (e) {
    console.error("saasAdminDevices GET:", e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

/** 태블릿 등록/갱신 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as {
      tenantId?: string
      deviceUuid?: string
      storeName?: string
      displayName?: string
      deviceKind?: string
    }
    const tenantId = String(body.tenantId || "").trim().toLowerCase()
    const deviceUuid = String(body.deviceUuid || "").trim()
    const deviceKind = String(body.deviceKind || "tablet").trim() || "tablet"
    if (!tenantId || !deviceUuid) {
      return NextResponse.json(
        { success: false, message: "tenantId and deviceUuid required" },
        { status: 400, headers }
      )
    }
    if (!(await assertTenantInScope(cp.scope, tenantId))) {
      return NextResponse.json({ success: false, message: "forbidden" }, { status: 403, headers })
    }
    if (deviceKind === "tablet") {
      const limit = await assertSaasTabletRegistrationAllowed({ tenantId, deviceUuid })
      if (!limit.ok) {
        return NextResponse.json(
          { success: false, code: limit.code, message: limit.message },
          { status: 403, headers }
        )
      }
    }

    const now = new Date().toISOString()
    await supabaseUpsert(
      "tenant_device_registry",
      [
        {
          tenant_id: tenantId,
          device_kind: deviceKind,
          device_uuid: deviceUuid,
          store_name: String(body.storeName || "").trim() || null,
          display_name: String(body.displayName || "").trim() || null,
          is_active: true,
          last_seen_at: now,
        },
      ],
      "tenant_id,device_kind,device_uuid"
    )
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error("saasAdminDevices POST:", e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

/** 비활성(소프트 해제) */
export async function DELETE(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as { tenantId?: string; deviceUuid?: string; deviceKind?: string }
    const tenantId = String(body.tenantId || "").trim().toLowerCase()
    const deviceUuid = String(body.deviceUuid || "").trim()
    const deviceKind = String(body.deviceKind || "tablet").trim() || "tablet"
    if (!tenantId || !deviceUuid) {
      return NextResponse.json(
        { success: false, message: "tenantId and deviceUuid required" },
        { status: 400, headers }
      )
    }
    if (!(await assertTenantInScope(cp.scope, tenantId))) {
      return NextResponse.json({ success: false, message: "forbidden" }, { status: 403, headers })
    }
    await supabaseUpdateByFilter(
      "tenant_device_registry",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&device_kind=eq.${encodeURIComponent(deviceKind)}&device_uuid=eq.${encodeURIComponent(deviceUuid)}`,
      { is_active: false }
    )
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error("saasAdminDevices DELETE:", e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
