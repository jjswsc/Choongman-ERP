import { NextRequest, NextResponse } from 'next/server'
import { listMembersPointsSearch, memberPointsSearchHasCriteria } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const params = {
      q: searchParams.get('q') || '',
      afterId: Number(searchParams.get('afterId') || 0) || undefined,
      limit: Number(searchParams.get('limit') || 100),
      tierCode: searchParams.get('tierCode') || '',
      status: searchParams.get('status') || '',
      pointBalanceMin: searchParams.get('pointBalanceMin') ?? undefined,
      pointBalanceMax: searchParams.get('pointBalanceMax') ?? undefined,
      tierPointsMin: searchParams.get('tierPointsMin') ?? undefined,
      tierPointsMax: searchParams.get('tierPointsMax') ?? undefined,
    }
    if (!memberPointsSearchHasCriteria(params)) {
      return NextResponse.json({ success: true, rows: [], nextCursor: null, needsCriteria: true })
    }
    const rows = await listMembersPointsSearch(params)
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null
    return NextResponse.json({ success: true, rows, nextCursor })
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '포인트 회원 검색 실패',
        rows: [],
        nextCursor: null,
      },
      { status: 400 }
    )
  }
}
