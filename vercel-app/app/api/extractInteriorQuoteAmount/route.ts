import { NextRequest, NextResponse } from "next/server"
import { supabaseSelectFilter } from "@/lib/supabase-server"
import { requireAuth } from "@/lib/verify-auth"
import { extractQuoteAmountFromFileUrl } from "@/lib/interior-quote-amount-parse"

/** 견적 파일(PDF/이미지)에서 총액 추출 — 텍스트 휴리스틱 + (이미지) OpenAI Vision */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Content-Type", "application/json")

  const authResult = await requireAuth(request, "manager")
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set("Access-Control-Allow-Origin", "*")
    return authResult.errorResponse
  }

  try {
    const body = (await request.json()) as { fileId?: number; projectId?: number | string }
    const fileId = Number(body.fileId)
    const projectId = Number(body.projectId)
    if (!fileId || Number.isNaN(fileId)) {
      return NextResponse.json({ success: false, message: "fileId가 필요합니다." }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter("interior_project_files", `id=eq.${fileId}`, {
      limit: 1,
      select: "id,project_id,file_name,file_path,file_type",
    })) as {
      id?: number
      project_id?: number
      file_name?: string
      file_path?: string
      file_type?: string
    }[]

    const row = rows?.[0]
    if (!row?.file_path) {
      return NextResponse.json({ success: false, message: "파일을 찾을 수 없습니다." }, { status: 404, headers })
    }
    if (projectId && Number(row.project_id) !== projectId) {
      return NextResponse.json({ success: false, message: "프로젝트가 일치하지 않습니다." }, { status: 403, headers })
    }

    const fileName = String(row.file_name || "")
    const filePath = String(row.file_path || "")
    const lower = fileName.toLowerCase()

    if (!lower.endsWith(".pdf") && !/\.(png|jpe?g|webp|gif)$/.test(lower)) {
      return NextResponse.json(
        { success: false, message: "PDF 또는 이미지 파일만 추출할 수 있습니다." },
        { status: 400, headers }
      )
    }

    const { result, openaiUsed } = await extractQuoteAmountFromFileUrl(filePath, fileName)
    if (!result) {
      const noKey = !process.env.OPENAI_API_KEY?.trim()
      return NextResponse.json(
        {
          success: false,
          message: noKey
            ? "금액을 찾지 못했습니다. OPENAI_API_KEY 설정 후 이미지 견적서를 다시 시도하세요."
            : "금액을 찾지 못했습니다. 파일 품질을 확인하거나 금액을 직접 입력하세요.",
        },
        { headers }
      )
    }

    return NextResponse.json(
      {
        success: true,
        amount: result.amount,
        label: result.label,
        confidence: result.confidence,
        method: result.method,
        openaiUsed,
      },
      { headers }
    )
  } catch (e) {
    console.error("extractInteriorQuoteAmount:", e)
    return NextResponse.json(
      { success: false, message: "오류: " + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
