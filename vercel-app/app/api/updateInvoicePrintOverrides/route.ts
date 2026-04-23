import { NextRequest, NextResponse } from "next/server"
import { supabaseUpsert } from "@/lib/supabase-server"
import { requireAuth } from "@/lib/verify-auth"
import { applyTaxInvoiceOverrideToReceivable } from "@/lib/receivable-payable"

type OverrideInput = {
  refType?: string
  refId?: number
  docKind?: string
  issueDate?: string
  dueDate?: string
  referenceNo?: string
  documentNo?: string
  shipTo?: string
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
    const body = (await request.json()) as { items?: OverrideInput[] }
    const items = Array.isArray(body?.items) ? body.items : []
    const nowIso = new Date().toISOString()
    const rows = items
      .map((it) => {
        const refType = String(it?.refType || "").trim()
        const refId = Number(it?.refId || 0)
        if (!refType || !Number.isFinite(refId) || refId <= 0) return null
        const docKind = normalizeDocKind(String(it?.docKind || ""))
        const payload = {
          issueDate: String(it.issueDate || "").trim() || undefined,
          dueDate: String(it.dueDate || "").trim() || undefined,
          referenceNo: String(it.referenceNo || "").trim() || undefined,
          documentNo: String(it.documentNo || "").trim() || undefined,
          shipTo: String(it.shipTo || "").trim() || undefined,
          updatedAt: nowIso,
        }
        return {
          code: buildOverrideCode(refType, refId, docKind),
          value: JSON.stringify(payload),
        }
      })
      .filter((r): r is { code: string; value: string } => Boolean(r))

    if (rows.length === 0) {
      return NextResponse.json({ success: true, saved: 0 }, { headers })
    }

    await supabaseUpsert("invoice_settings", rows, "code")

    for (const it of items) {
      const refType = String(it?.refType || "").trim()
      const refId = Number(it?.refId || 0)
      const docKind = normalizeDocKind(String(it?.docKind || ""))
      if (docKind !== "tax" || !refType || !Number.isFinite(refId) || refId <= 0) continue
      const issueDate = String(it.issueDate || "").trim()
      if (!issueDate) continue
      const documentNo = it.documentNo !== undefined ? String(it.documentNo) : undefined
      try {
        await applyTaxInvoiceOverrideToReceivable({
          refType,
          refId,
          issueDate,
          documentNo,
        })
      } catch (syncErr) {
        console.error("applyTaxInvoiceOverrideToReceivable:", refType, refId, syncErr)
      }
    }

    return NextResponse.json({ success: true, saved: rows.length }, { headers })
  } catch (e) {
    console.error("updateInvoicePrintOverrides:", e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

