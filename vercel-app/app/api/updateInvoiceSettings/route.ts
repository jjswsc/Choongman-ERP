import { NextRequest, NextResponse } from "next/server"
import { supabaseUpsert } from "@/lib/supabase-server"

const ALLOWED_KEYS = [
  "payment_terms",
  "shipping_method",
  "bank_name",
  "account_no",
  "account_name",
  "swift_code",
  "terms_and_conditions",
  "seller_email",
  "seller_website",
  "remarks",
]

/** 인보이스 설정 저장 (invoice_settings 테이블) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type")
  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers })

  try {
    const body = (await request.json()) as Record<string, string>
    const rows: { code: string; value: string }[] = []
    for (const k of ALLOWED_KEYS) {
      if (body[k] !== undefined) {
        rows.push({ code: k, value: String(body[k] ?? "").trim() })
      }
    }
    if (rows.length === 0) {
      return NextResponse.json({ success: true, message: "No changes" }, { headers })
    }
    await supabaseUpsert("invoice_settings", rows, "code")
    return NextResponse.json({ success: true, message: "Saved" }, { headers })
  } catch (e) {
    console.error("updateInvoiceSettings:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { status: 500, headers }
    )
  }
}
