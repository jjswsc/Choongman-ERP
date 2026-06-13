import { NextRequest, NextResponse } from 'next/server'
import { getMemberVisitAnalysis } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const { searchParams } = new URL(req.url)
  const startStr = String(searchParams.get('startStr') || '')
  const endStr = String(searchParams.get('endStr') || '')
  if (!startStr || !endStr) {
    return NextResponse.json({ success: false, message: 'startStr and endStr required', rows: [] }, { status: 400 })
  }
  const rows = await getMemberVisitAnalysis({
    startStr,
    endStr,
    storeCode: searchParams.get('storeCode') || undefined,
    memberId: Number(searchParams.get('memberId') || 0) || undefined,
    q: searchParams.get('q') || undefined,
    limit: Number(searchParams.get('limit') || 500),
  })
  return NextResponse.json({ success: true, rows })
}
