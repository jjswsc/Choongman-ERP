import { NextRequest, NextResponse } from 'next/server'
import { listLineMembers } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const q = String(searchParams.get('q') || '').trim()
    const limit = Number(searchParams.get('limit') || 200)
    const rows = await listLineMembers({ q, limit })
    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('GET /api/members/line:', e)
    return NextResponse.json([], { headers })
  }
}
