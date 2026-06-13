import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { getAiCenterFoundationHealth } from "@/lib/ai/foundation-health"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const health = await getAiCenterFoundationHealth()
  const nextActions: string[] = []
  if (!health.allTablesOk) {
    nextActions.push("Supabase SQL Editor에서 sql/ai_center_foundation.sql 실행")
    nextActions.push("sql/ai_center_foundation_verify.sql로 재확인")
  } else if (!health.openaiConfigured) {
    nextActions.push("Vercel에 OPENAI_API_KEY 설정 후 Redeploy")
  } else {
    if (!health.vectorSearchReady) {
      nextActions.push("sql/ai_knowledge_vector.sql 실행 후 ai-embed-knowledge-backfill.cjs")
    }
    nextActions.push("매출·본사매입 질의 및 전 매장 비교 테스트")
  }

  return NextResponse.json(
    {
      step: health.step,
      label: "AI Center 기반(0단계)",
      allTablesOk: health.allTablesOk,
      openaiConfigured: health.openaiConfigured,
      vectorSearchReady: health.vectorSearchReady,
      readyForStep1: health.readyForStep1,
      tables: health.tables,
      nextActions,
    },
    { headers }
  )
}
