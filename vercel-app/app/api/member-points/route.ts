import { NextRequest, NextResponse } from 'next/server'
import { listMemberPoints } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const memberId = Number(searchParams.get('memberId') || 0)
    const limit = Number(searchParams.get('limit') || 200)
    const offset = Number(searchParams.get('offset') || 0)
    const startStr = searchParams.get('startStr') || undefined
    const endStr = searchParams.get('endStr') || undefined
    const rows = await listMemberPoints({ memberId, limit, offset, startStr, endStr })
    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('GET /api/member-points:', e)
    return NextResponse.json([], { headers })
  }
}
