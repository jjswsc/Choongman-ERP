import { NextRequest, NextResponse } from 'next/server'
import { recalculateMemberTierBatch } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const authRes = await requireAuth(req, 'office')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as { afterId?: number; limit?: number }
    const result = await recalculateMemberTierBatch({
      afterId: Number(body.afterId || 0) || undefined,
      limit: Number(body.limit || 500),
    })
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '등급 배치 재계산 실패' },
      { status: 400 }
    )
  }
}

