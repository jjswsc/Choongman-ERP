import { NextRequest, NextResponse } from 'next/server'
import { approveReferral } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as {
      referrerMemberId?: number
      referredMemberId?: number
      referrerPoints?: number
      referredPoints?: number
    }
    await approveReferral({
      referrerMemberId: Number(body.referrerMemberId || 0),
      referredMemberId: Number(body.referredMemberId || 0),
      referrerPoints: Number(body.referrerPoints || 50),
      referredPoints: Number(body.referredPoints || 50),
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '추천인 처리 실패' },
      { status: 400 }
    )
  }
}

