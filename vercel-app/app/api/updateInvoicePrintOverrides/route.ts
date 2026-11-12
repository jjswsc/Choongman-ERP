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
  paymentTerms?: string
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
    // 같은 code가 한 upsert에 두 번 오면 Postgres 21000
    // (ON CONFLICT DO UPDATE cannot affect row a second time)
    const byCode = new Map<
      string,
      {
        code: string
        value: string
        sync?: { refType: string; refId: number; issueDate: string; documentNo?: string }
      }
    >()
    for (const it of items) {
      const refType = String(it?.refType || "").trim()
      const refId = Number(it?.refId || 0)
      if (!refType || !Number.isFinite(refId) || refId <= 0) continue
      const docKind = normalizeDocKind(String(it?.docKind || ""))
      const issueDate = String(it.issueDate || "").trim()
      const documentNoRaw = it.documentNo !== undefined ? String(it.documentNo) : undefined
      const payload = {
        issueDate: issueDate || undefined,
        dueDate: String(it.dueDate || "").trim() || undefined,
        referenceNo: String(it.referenceNo || "").trim() || undefined,
        documentNo: String(it.documentNo || "").trim() || undefined,
        shipTo: String(it.shipTo || "").trim() || undefined,
        paymentTerms: String(it.paymentTerms || "").trim() || undefined,
        updatedAt: nowIso,
      }
      const code = buildOverrideCode(refType, refId, docKind)
      byCode.set(code, {
        code,
        value: JSON.stringify(payload),
        sync:
          docKind === "tax" && issueDate
            ? { refType, refId, issueDate, documentNo: documentNoRaw }
            : undefined,
      })
    }

    const rows = [...byCode.values()].map(({ code, value }) => ({ code, value }))
    if (rows.length === 0) {
      return NextResponse.json({ success: true, saved: 0 }, { headers })
    }

    await supabaseUpsert("invoice_settings", rows, "code")

    for (const { sync } of byCode.values()) {
      if (!sync) continue
      try {
        await applyTaxInvoiceOverrideToReceivable(sync)
      } catch (syncErr) {
        console.error("applyTaxInvoiceOverrideToReceivable:", sync.refType, sync.refId, syncErr)
      }
    }

    return NextResponse.json({ success: true, saved: rows.length }, { headers })
  } catch (e) {
    console.error("updateInvoicePrintOverrides:", e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}

