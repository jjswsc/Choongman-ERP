import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { cronAuthErrorResponse, isCronAuthorized } from "@/lib/verify-cron-auth"
import { runDuePriceSchedules } from "@/lib/price-schedule"

async function runAndRespond(headers: Headers): Promise<NextResponse> {
  try {
    const result = await runDuePriceSchedules(new Date())
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: result.message || "실행 실패",
          appliedCount: 0,
          failedCount: 0,
        },
        { status: 500, headers }
      )
    }
    return NextResponse.json(
      {
        success: true,
        appliedCount: result.appliedCount,
        failedCount: result.failedCount,
        message: result.message,
      },
      { headers }
    )
  } catch (e) {
    console.error("applyDuePriceSchedules:", e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : "실행 실패",
        appliedCount: 0,
        failedCount: 0,
      },
      { status: 500, headers }
    )
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const authRes = await requireAuth(req, "office")
  if (authRes.errorResponse) return authRes.errorResponse
  return runAndRespond(headers)
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  const cronDenied = cronAuthErrorResponse(req, headers)
  if (cronDenied) return cronDenied
  if (!isCronAuthorized(req)) {
    const authRes = await requireAuth(req, "office")
    if (authRes.errorResponse) return authRes.errorResponse
  }
  return runAndRespond(headers)
}
