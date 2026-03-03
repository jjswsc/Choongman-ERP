import { NextResponse } from "next/server"
import { supabaseSelect } from "@/lib/supabase-server"

/** 인보이스 설정 조회 (invoice_settings 테이블) */
export async function GET() {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  try {
    const rows = (await supabaseSelect("invoice_settings", {
      order: "code.asc",
      limit: 100,
    })) as { code?: string; value?: string }[] | null

    const settings: Record<string, string> = {}
    for (const r of rows || []) {
      const k = String(r.code || "").trim()
      if (k) settings[k] = String(r.value ?? "").trim()
    }

    return NextResponse.json(settings, { headers })
  } catch (e) {
    console.error("getInvoiceSettings:", e)
    return NextResponse.json(
      {
        payment_terms: "Net 30 Days",
        shipping_method: "Company Delivery",
        bank_name: "Kasikorn Bank (KBank)",
        account_no: "166-2-97079-0",
        account_name: "S&J Global Co., Ltd.",
        swift_code: "KASITHBK",
        terms_and_conditions: '["Goods once sold cannot be returned or exchanged","Payment is due within the specified terms"]',
        remarks: "Please transfer payment to the bank account shown above.",
      },
      { headers }
    )
  }
}
