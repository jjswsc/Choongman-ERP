import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { requireAuth } from "@/lib/verify-auth"

type OverrideRefInput = {
  refType?: string
  refId?: number
  docKind?: string
}

type InvoicePrintOverride = {
  issueDate?: string
  dueDate?: string
  referenceNo?: string
  documentNo?: string
  shipTo?: string
  updatedAt?: string
}

function normalizeDocKind(raw: string): "invoice" | "tax" {
  const v = String(raw || "").trim().toLowerCase()
  return v === "tax" ? "tax" : "invoice"
}

function buildOverrideCode(refType: string, refId: number, docKind: "invoice" | "tax"): string {
  const rt = String(refType || "").trim() || "Order"
  return `invoice_print_override:${docKind}:${rt}:${refId}`
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type")
  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers })

  const authResult = await requireAuth(request, "any")
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set("Access-Control-Allow-Origin", "*")
    authResult.errorResponse.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    authResult.errorResponse.headers.set("Access-Control-Allow-Headers", "Content-Type")
    return authResult.errorResponse
  }

  try {
    const body = (await request.json()) as { refs?: OverrideRefInput[] }
    const refs = Array.isArray(body?.refs) ? body.refs : []
    const codes = refs
      .map((r) => ({
        refType: String(r?.refType || "").trim(),
        refId: Number(r?.refId || 0),
        docKind: normalizeDocKind(String(r?.docKind || "")),
      }))
      .filter((r) => r.refType && Number.isFinite(r.refId) && r.refId > 0)
      .map((r) => buildOverrideCode(r.refType, r.refId, r.docKind))

    if (codes.length === 0) {
      return NextResponse.json({ success: true, map: {} }, { headers })
    }

    const uniqueCodes = [...new Set(codes)]
    const rowsNested = await Promise.all(
      uniqueCodes.map(async (code) => {
        const one = (await supabaseSelectFilter(
          "invoice_settings",
          `code=eq.${encodeURIComponent(code)}`,
          { select: "code,value", limit: 1 }
        )) as { code?: string; value?: string }[] | null
        return one || []
      })
    )
    const rows = rowsNested.flat()

    const out: Record<string, InvoicePrintOverride> = {}
    for (const r of rows || []) {
      const code = String(r.code || "").trim()
      if (!code) continue
      try {
        const parsed = JSON.parse(String(r.value || "{}")) as InvoicePrintOverride
        out[code] = parsed
      } catch {
        // ignore malformed overrides
      }
    }

    return NextResponse.json({ success: true, map: out }, { headers })
  } catch (e) {
    console.error("getInvoicePrintOverrides:", e)
    return NextResponse.json({ success: false, message: String(e), map: {} }, { status: 500, headers })
  }
}

