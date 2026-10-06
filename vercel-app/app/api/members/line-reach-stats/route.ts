import { NextRequest, NextResponse } from 'next/server'
import { getMemberLineReachStats } from '@/lib/members-server'
import { resolveMembersTenantScope } from '@/lib/members-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'active'
    const tierCode = searchParams.get('tierCode') || ''
    const stats = await getMemberLineReachStats({
      status,
      tierCode: tierCode || undefined,
      tenantScope,
    })
    return NextResponse.json({ success: true, ...stats })
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'LINE 수신 통계 조회 실패',
        total: 0,
        reachable: 0,
        unreachable: 0,
      },
      { status: 400 }
    )
  }
}
