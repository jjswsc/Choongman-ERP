import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { getAiCenterFoundationHealth } from "@/lib/ai/foundation-health"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const health = await getAiCenterFoundationHealth()
  return NextResponse.json(
    {
      step: health.step,
      label: "AI Center 기반(0단계)",
      allTablesOk: health.allTablesOk,
      openaiConfigured: health.openaiConfigured,
      readyForStep1: health.readyForStep1,
      tables: health.tables,
      nextActions: health.allTablesOk
        ? health.openaiConfigured
          ? ["1단계: 매출·본사매입 지표 정의서 작성"]
          : ["Vercel에 OPENAI_API_KEY 설정 후 Redeploy"]
        : ["Supabase SQL Editor에서 sql/ai_center_foundation.sql 실행", "sql/ai_center_foundation_verify.sql로 재확인"],
    },
    { headers }
  )
}
