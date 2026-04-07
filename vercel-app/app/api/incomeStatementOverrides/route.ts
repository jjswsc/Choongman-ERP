import { NextRequest, NextResponse } from "next/server"
import { assertCanManageAccountingCompliance } from "@/lib/accounting-auth"
import { isOfficeRole } from "@/lib/permissions"
import { resolveIncomeStatementOverrideStoreKey } from "@/lib/pl-override-store-key"
import { supabaseSelectFilter, supabaseUpsert } from "@/lib/supabase-server"

const cors = () => {
  const h = new Headers()
  h.set("Access-Control-Allow-Origin", "*")
  return h
}

function assertStoreWriteAllowed(storeFilter: string, userRole: string, userStore: string) {
  if (isOfficeRole(userRole)) return
  const u = String(userStore || "").trim()
  const sf = String(storeFilter || "").trim()
  if (!u || sf !== u) throw new Error("STORE_SCOPE_FORBIDDEN")
}

export async function GET(request: NextRequest) {
  const headers = cors()
  try {
    const sp = request.nextUrl.searchParams
    const userRole = String(sp.get("userRole") || "").trim()
    const userStore = String(sp.get("userStore") || "").trim()
    const storeFilter = String(sp.get("storeFilter") || "All").trim() || "All"
    const yearMonth = String(sp.get("yearMonth") || "").trim().slice(0, 7)

    assertCanManageAccountingCompliance(userRole)

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, error: "INVALID_YEAR_MONTH" }, { status: 400, headers })
    }

    const storeKey = resolveIncomeStatementOverrideStoreKey(storeFilter, userRole, userStore)
    const rows = (await supabaseSelectFilter(
      "income_statement_overrides",
      `year_month=eq.${encodeURIComponent(yearMonth)}&store_key=eq.${encodeURIComponent(storeKey)}`,
      { select: "*", limit: 1 }
    )) as Record<string, unknown>[] | null

    const row = rows?.[0]
    if (!row) {
      return NextResponse.json(
        {
          success: true,
          row: {
            year_month: yearMonth,
            store_key: storeKey,
            sales_override_enabled: false,
            sales_override_amount: 0,
            beginning_inv_override_enabled: false,
            beginning_inv_override_amount: 0,
          },
        },
        { headers }
      )
    }

    return NextResponse.json(
      {
        success: true,
        row: {
          year_month: yearMonth,
          store_key: storeKey,
          sales_override_enabled: Boolean(row.sales_override_enabled),
          sales_override_amount: Math.max(0, Number(row.sales_override_amount) || 0),
          beginning_inv_override_enabled: Boolean(row.beginning_inv_override_enabled),
          beginning_inv_override_amount: Math.max(0, Number(row.beginning_inv_override_amount) || 0),
          updated_at: row.updated_at != null ? String(row.updated_at) : null,
          updated_by: row.updated_by != null ? String(row.updated_by) : null,
        },
      },
      { headers }
    )
  } catch (e) {
    if (e instanceof Error && e.message === "ACCOUNTING_FORBIDDEN") {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403, headers })
    }
    console.error("incomeStatementOverrides GET:", e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

export async function POST(request: NextRequest) {
  const headers = cors()
  try {
    const body = await request.json().catch(() => ({}))
    const userRole = String(body.userRole || "").trim()
    const userStore = String(body.userStore || "").trim()
    const storeFilter = String(body.storeFilter || "All").trim() || "All"
    const yearMonth = String(body.yearMonth || "").trim().slice(0, 7)
    const updatedBy = body.updatedBy != null ? String(body.updatedBy).slice(0, 200) : null

    assertCanManageAccountingCompliance(userRole)
    assertStoreWriteAllowed(storeFilter, userRole, userStore)

    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, error: "INVALID_YEAR_MONTH" }, { status: 400, headers })
    }

    const storeKey = resolveIncomeStatementOverrideStoreKey(storeFilter, userRole, userStore)

    const salesEnabled = Boolean(body.salesOverrideEnabled)
    const salesAmt = Math.max(0, Number(body.salesOverrideAmount) || 0)
    const begEnabled = Boolean(body.beginningInvOverrideEnabled)
    const begAmt = Math.max(0, Number(body.beginningInvOverrideAmount) || 0)

    const now = new Date().toISOString()
    await supabaseUpsert(
      "income_statement_overrides",
      [
        {
          year_month: yearMonth,
          store_key: storeKey,
          sales_override_enabled: salesEnabled,
          sales_override_amount: salesEnabled ? salesAmt : 0,
          beginning_inv_override_enabled: begEnabled,
          beginning_inv_override_amount: begEnabled ? begAmt : 0,
          updated_at: now,
          updated_by: updatedBy,
        },
      ],
      "year_month,store_key"
    )

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    if (e instanceof Error && e.message === "ACCOUNTING_FORBIDDEN") {
      return NextResponse.json({ success: false, error: "FORBIDDEN" }, { status: 403, headers })
    }
    if (e instanceof Error && e.message === "STORE_SCOPE_FORBIDDEN") {
      return NextResponse.json({ success: false, error: "STORE_SCOPE_FORBIDDEN" }, { status: 403, headers })
    }
    console.error("incomeStatementOverrides POST:", e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
