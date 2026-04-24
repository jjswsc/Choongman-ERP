import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { requireAuth } from "@/lib/verify-auth"
import { parsePosOrderMemo } from "@/lib/pos-tax-invoice"

function pushUnique(out: string[], seen: Set<string>, s: string) {
  const t = String(s || "").trim()
  if (!t) return
  const k = t.toLowerCase()
  if (seen.has(k)) return
  seen.add(k)
  out.push(t)
}

/** store_name + cart_json 줄의 vendor → 인보이스 BILL TO 후보(우선순위 순) */
function billToCandidatesFromOrderRow(storeName: string, cartJson: string | null | undefined): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  pushUnique(out, seen, storeName)
  let cart: unknown[] = []
  try {
    const parsed = cartJson ? JSON.parse(cartJson) : []
    cart = Array.isArray(parsed) ? parsed : []
  } catch {
    cart = []
  }
  for (const raw of cart) {
    if (!raw || typeof raw !== "object") continue
    const v = String((raw as { vendor?: string }).vendor ?? "").trim()
    if (v) pushUnique(out, seen, v)
  }
  return out
}

type TaxInvoiceClient = {
  companyName: string
  address: string
  taxId: string
  phone: string
}

function taxInvoiceClientFromOrderMemo(memo: string | null | undefined): TaxInvoiceClient | null {
  const parsed = parsePosOrderMemo(memo)
  const tax = parsed.taxInvoice
  if (!tax) return null
  const companyName = String(tax.name || "").trim()
  const address = String(tax.address || "").trim()
  const taxId = String(tax.taxId || "").replace(/\D/g, "")
  const phone = String(tax.phone || "").trim()
  if (!companyName && !address && !taxId && !phone) return null
  return {
    companyName: companyName || "-",
    address: address || "-",
    taxId: taxId || "-",
    phone: phone || "-",
  }
}

export async function OPTIONS() {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type")
  return new NextResponse(null, { status: 204, headers })
}

/** 출고 인보이스: 주문 ID별 BILL TO 매칭용 이름 후보 (cart vendor 포함) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type")

  const authResult = await requireAuth(request, "any")
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set("Access-Control-Allow-Origin", "*")
    authResult.errorResponse.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    authResult.errorResponse.headers.set("Access-Control-Allow-Headers", "Content-Type")
    return authResult.errorResponse
  }

  try {
    let body: { orderIds?: unknown }
    try {
      body = (await request.json()) as { orderIds?: unknown }
    } catch {
      return NextResponse.json({ map: {} }, { headers })
    }
    const rawIds = Array.isArray(body?.orderIds) ? body.orderIds : []
    const orderIds = [...new Set(rawIds.map((x) => Math.floor(Number(x))).filter((n) => Number.isFinite(n) && n > 0))].slice(
      0,
      80
    )
    if (orderIds.length === 0) {
      return NextResponse.json(
        { map: {} as Record<string, string[]>, taxInvoiceClientMap: {} as Record<string, TaxInvoiceClient> },
        { headers }
      )
    }

    const idFilter = `id=in.(${orderIds.join(",")})`
    const rows = (await supabaseSelectFilter("orders", idFilter, {
      limit: orderIds.length + 10,
      select: "id,store_name,cart_json,memo",
    })) as { id?: number; store_name?: string; cart_json?: string | null; memo?: string | null }[] | null

    const map: Record<string, string[]> = {}
    const taxInvoiceClientMap: Record<string, TaxInvoiceClient> = {}
    for (const r of rows || []) {
      const id = Number(r.id)
      if (!Number.isFinite(id) || id <= 0) continue
      map[String(id)] = billToCandidatesFromOrderRow(String(r.store_name || ""), r.cart_json)
      const taxClient = taxInvoiceClientFromOrderMemo(r.memo)
      if (taxClient) taxInvoiceClientMap[String(id)] = taxClient
    }

    return NextResponse.json({ map, taxInvoiceClientMap }, { headers })
  } catch (e) {
    console.error("getInvoiceOrderBillToCandidates:", e)
    return NextResponse.json(
      { map: {} as Record<string, string[]>, taxInvoiceClientMap: {} as Record<string, TaxInvoiceClient> },
      { status: 500, headers }
    )
  }
}
