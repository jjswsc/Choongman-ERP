/**
 * 고객사 데이터 export (메타·마스터 위주, 비밀번호 제외).
 * PDPA/계약 인수인계용 — SaaS control plane 전용.
 */
import "server-only"

import { supabaseCountFilter, supabaseSelectFilter } from "@/lib/supabase-server"

export type TenantExportBundle = {
  exportedAt: string
  tenantId: string
  companyName: string
  stores: Array<Record<string, unknown>>
  employees: Array<Record<string, unknown>>
  counts: {
    stores: number
    employees: number
    members: number
    posOrders: number
    tablets: number
  }
}

export async function buildTenantExportBundle(tenantId: string): Promise<TenantExportBundle> {
  const id = String(tenantId || "").trim()
  if (!id) throw new Error("tenantId required")

  const tenantRows = (await supabaseSelectFilter("tenants", `id=eq.${encodeURIComponent(id)}`, {
    limit: 1,
    select: "id,company_name,is_active,legal_name,tax_id,billing_email,created_at",
  })) as Array<{ company_name?: string | null }>
  const companyName = String(tenantRows?.[0]?.company_name || id).trim()

  const stores = (await supabaseSelectFilter(
    "erp_stores",
    `tenant_id=eq.${encodeURIComponent(id)}`,
    {
      limit: 5000,
      select: "store_code,store_name,display_name,is_active,sort_order,created_at",
      order: "sort_order.asc",
    }
  ).catch(() => [])) as Record<string, unknown>[]

  const employees = (await supabaseSelectFilter(
    "employees",
    `tenant_id=eq.${encodeURIComponent(id)}`,
    {
      limit: 10000,
      select:
        "id,store,name,role,job,employee_code,phone,email,resign_date,employment_status,join_date,created_at",
      order: "id.asc",
    }
  ).catch(() => [])) as Record<string, unknown>[]

  const [members, posOrders, tablets] = await Promise.all([
    supabaseCountFilter("members", `tenant_id=eq.${encodeURIComponent(id)}`).catch(() => 0),
    supabaseCountFilter("pos_orders", `tenant_id=eq.${encodeURIComponent(id)}`).catch(() => 0),
    supabaseCountFilter(
      "tenant_device_registry",
      `tenant_id=eq.${encodeURIComponent(id)}&device_kind=eq.tablet&is_active=eq.true`
    ).catch(() => 0),
  ])

  return {
    exportedAt: new Date().toISOString(),
    tenantId: id,
    companyName,
    stores: stores || [],
    employees: (employees || []).map((e) => {
      const { password: _p, totp_secret: _t, ...rest } = e as Record<string, unknown> & {
        password?: unknown
        totp_secret?: unknown
      }
      void _p
      void _t
      return rest
    }),
    counts: {
      stores: stores?.length || 0,
      employees: employees?.length || 0,
      members,
      posOrders,
      tablets,
    },
  }
}
