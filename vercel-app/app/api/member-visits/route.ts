import { NextRequest, NextResponse } from 'next/server'
import { getMemberVisits } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const memberId = Number(searchParams.get('memberId') || 0)
    const limit = Number(searchParams.get('limit') || 200)
    const startStr = String(searchParams.get('start') || searchParams.get('startStr') || '').trim()
    const endStr = String(searchParams.get('end') || searchParams.get('endStr') || '').trim()
    const storeCode = String(searchParams.get('store') || searchParams.get('storeCode') || '').trim()
    const rows = await getMemberVisits({
      memberId,
      limit,
      ...(startStr && endStr ? { startStr, endStr } : {}),
      ...(storeCode ? { storeCode } : {}),
    })
    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('GET /api/member-visits:', e)
    return NextResponse.json([], { headers })
  }
}
