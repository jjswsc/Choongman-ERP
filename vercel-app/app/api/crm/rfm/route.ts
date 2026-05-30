import { NextRequest, NextResponse } from 'next/server'
import { getRfmTop } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') || 200)
  const rows = await getRfmTop({ limit })
  return NextResponse.json({ success: true, rows })
}

