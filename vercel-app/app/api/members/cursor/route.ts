import { NextRequest, NextResponse } from 'next/server'
import { listMembersCursor } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const afterId = Number(searchParams.get('afterId') || 0)
    const limit = Number(searchParams.get('limit') || 100)
    const rows = await listMembersCursor({ q, afterId: afterId || undefined, limit })
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null
    return NextResponse.json({ success: true, rows, nextCursor })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'cursor 조회 실패', rows: [], nextCursor: null },
      { status: 400 }
    )
  }
}

