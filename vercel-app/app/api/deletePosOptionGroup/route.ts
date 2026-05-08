import { NextRequest, NextResponse } from "next/server"
import { supabaseDeleteByFilter } from "@/lib/supabase-server"

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  try {
    const body = await req.json()
    const id = String(body?.id ?? "").trim()
    if (!id) {
      return NextResponse.json(
        { success: false, message: "id required" },
        { headers }
      )
    }
    await supabaseDeleteByFilter("pos_option_groups", `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error("deletePosOptionGroup:", e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
