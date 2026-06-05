import { NextRequest, NextResponse } from 'next/server'
import { repairGrabPosOrderStoreCodes } from '@/lib/grab-pos-order-store-code-repair'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      const res = authResult.errorResponse
      res.headers.set('Access-Control-Allow-Origin', '*')
      return res
    }

    const body = (await request.json().catch(() => ({}))) as {
      days?: number
      limit?: number
      dryRun?: boolean
    }
    const days = Number.isFinite(Number(body.days)) ? Math.max(1, Math.trunc(Number(body.days))) : 3
    const limit = Number.isFinite(Number(body.limit))
      ? Math.min(500, Math.max(1, Math.trunc(Number(body.limit))))
      : 100
    /** 기본 dry-run: body 생략 시 DB 미변경. 실제 반영은 `"dryRun": false` 명시 */
    const dryRun = body.dryRun !== false
    const actor = [authResult.auth.name, authResult.auth.employeeCode].filter(Boolean).join(' ').trim()

    const result = await repairGrabPosOrderStoreCodes({ days, limit, dryRun, actor })

    return NextResponse.json({ success: true, ...result }, { headers })
  } catch (e) {
    console.error('repairGrabPosOrderStoreCodes:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'failed' },
      { status: 500, headers }
    )
  }
}
