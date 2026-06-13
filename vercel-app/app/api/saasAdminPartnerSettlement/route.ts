import { NextRequest, NextResponse } from "next/server"
import { requireSaasControlPlane } from "@/lib/saas-control-plane-scope"
import { supabaseSelectFilter, supabaseUpsertMerge } from "@/lib/supabase-server"
import type { TenantItem } from "@/lib/saas-admin-control-plane"
import {
  bangkokPeriodYm,
  buildPartnerSettlement,
  buildPartnerSettlementCsv,
  buildPartnerSettlementHtml,
  buildPartnerWholesaleInvoiceHtml,
} from "@/lib/saas-partner-settlement"

export const dynamic = "force-dynamic"

type SettlementRow = {
  id: number
  partner_id: string
  period_ym: string
  currency: string
  wholesale_total: number
  margin_total: number
  retail_total: number
  tenant_count: number
  status: string
  memo?: string | null
  updated_at?: string
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  const { searchParams } = new URL(req.url)
  const partnerIdParam = searchParams.get("partnerId")?.trim() || ""
  const periodYm = searchParams.get("periodYm")?.trim() || bangkokPeriodYm()
  const format = searchParams.get("format")?.trim() || "json"
  const partnerId =
    cp.scope.kind === "partner" ? cp.scope.partnerId : partnerIdParam

  if (!partnerId) {
    return NextResponse.json({ success: false, message: "partnerId가 필요합니다." }, { status: 400, headers })
  }
  if (cp.scope.kind === "partner" && partnerId !== cp.scope.partnerId) {
    return NextResponse.json({ success: false, message: "접근할 수 없습니다." }, { status: 403, headers })
  }

  try {
    let saved: SettlementRow[] = []
    try {
      saved = (await supabaseSelectFilter("saas_partner_settlements", `partner_id=eq.${encodeURIComponent(partnerId)}`, {
        limit: 24,
        order: "period_ym.desc",
        select:
          "id,partner_id,period_ym,currency,wholesale_total,margin_total,retail_total,tenant_count,status,memo,updated_at",
      })) as SettlementRow[]
    } catch {
      saved = []
    }

    const tenantsJson = searchParams.get("tenants")
    let tenants: TenantItem[] = []
    if (tenantsJson) {
      try {
        tenants = JSON.parse(tenantsJson) as TenantItem[]
      } catch {
        tenants = []
      }
    }

    if (tenants.length === 0) {
      return NextResponse.json(
        {
          success: true,
          partnerId,
          periodYm,
          saved: (saved || []).map(mapSettlementRow),
          needsTenants: true,
        },
        { headers }
      )
    }

    const partnerTenants = tenants.filter((t) => t.partnerId === partnerId)
    const summary = buildPartnerSettlement({ partnerId, periodYm, tenants: partnerTenants })

    if (format === "csv") {
      headers.set("Content-Type", "text/csv; charset=utf-8")
      headers.set("Content-Disposition", `attachment; filename="partner_settlement_${partnerId}_${periodYm}.csv"`)
      return new NextResponse(buildPartnerSettlementCsv(summary), { headers })
    }

    if (format === "html" || format === "wholesale") {
      const partnerName =
        cp.scope.kind === "partner"
          ? cp.scope.partnerName
          : searchParams.get("partnerName")?.trim() || partnerId
      const html =
        format === "wholesale"
          ? buildPartnerWholesaleInvoiceHtml(summary, partnerName, {
              title: "Platform wholesale invoice",
              subtitle: "Amount due to platform (wholesale)",
              amountDue: "Amount due",
            })
          : buildPartnerSettlementHtml(summary, {
              title: "Partner settlement",
              partner: "Partner",
              period: "Period",
              wholesale: "Wholesale",
              margin: "Margin",
              retail: "Retail",
              total: "Total",
            })
      headers.set("Content-Type", "text/html; charset=utf-8")
      return new NextResponse(html, { headers })
    }

    return NextResponse.json(
      {
        success: true,
        summary,
        saved: (saved || []).map(mapSettlementRow),
      },
      { headers }
    )
  } catch (error) {
    console.error("saasAdminPartnerSettlement GET:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}

type PostBody = {
  partnerId?: string
  periodYm?: string
  status?: "draft" | "confirmed" | "paid"
  memo?: string
  summary?: {
    wholesaleTotal: number
    marginTotal: number
    retailTotal: number
    tenantCount: number
    currency?: string
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as PostBody
    const partnerId =
      cp.scope.kind === "partner" ? cp.scope.partnerId : String(body.partnerId || "").trim()
    const periodYm = String(body.periodYm || bangkokPeriodYm()).trim()
    if (!partnerId) {
      return NextResponse.json({ success: false, message: "partnerId가 필요합니다." }, { status: 400, headers })
    }
    if (cp.scope.kind === "partner" && partnerId !== cp.scope.partnerId) {
      return NextResponse.json({ success: false, message: "접근할 수 없습니다." }, { status: 403, headers })
    }
    if (cp.scope.kind === "partner" && body.status === "paid") {
      return NextResponse.json({ success: false, message: "paid 상태는 본사만 변경할 수 있습니다." }, { status: 403, headers })
    }

    const summary = body.summary
    if (!summary) {
      return NextResponse.json({ success: false, message: "summary가 필요합니다." }, { status: 400, headers })
    }

    const nowIso = new Date().toISOString()
    await supabaseUpsertMerge("saas_partner_settlements", "partner_id,period_ym", {
      partner_id: partnerId,
      period_ym: periodYm,
      currency: summary.currency || "THB",
      wholesale_total: Math.max(0, Number(summary.wholesaleTotal || 0)),
      margin_total: Math.max(0, Number(summary.marginTotal || 0)),
      retail_total: Math.max(0, Number(summary.retailTotal || 0)),
      tenant_count: Math.max(0, Math.floor(Number(summary.tenantCount || 0))),
      status: body.status || "draft",
      memo: String(body.memo || "").trim() || null,
      updated_at: nowIso,
    })

    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error("saasAdminPartnerSettlement POST:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}

function mapSettlementRow(row: SettlementRow) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    periodYm: row.period_ym,
    currency: row.currency,
    wholesaleTotal: Number(row.wholesale_total || 0),
    marginTotal: Number(row.margin_total || 0),
    retailTotal: Number(row.retail_total || 0),
    tenantCount: Number(row.tenant_count || 0),
    status: row.status,
    memo: row.memo || "",
    updatedAt: row.updated_at || "",
  }
}
