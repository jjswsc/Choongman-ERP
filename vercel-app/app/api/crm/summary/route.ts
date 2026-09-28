import { NextRequest, NextResponse } from 'next/server'
import { getCrmSummary } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const { searchParams } = new URL(req.url)
  const recentDays = Number(searchParams.get('recentDays') || 30)
  const dormantDays = Number(searchParams.get('dormantDays') || 90)
  const storeCode = String(searchParams.get('storeCode') || '').trim()
  const summary = await getCrmSummary({
    recentDays,
    dormantDays,
    storeCode: storeCode || undefined,
  })
  return NextResponse.json({ success: true, summary })
}

