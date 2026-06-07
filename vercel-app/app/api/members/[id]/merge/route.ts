import { NextRequest, NextResponse } from 'next/server'
import { getMemberSummaryById } from '@/lib/members-server'
import { MemberMergeError, mergeMembers, resolveMemberRef } from '@/lib/member-merge-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  try {
    const params = await context.params
    const targetMemberId = Number(params.id || 0)
    if (!targetMemberId) {
      return NextResponse.json({ success: false, message: '유지할 회원 ID가 필요합니다.' }, { headers })
    }

    const body = (await req.json()) as { sourceMemberId?: number; sourceRef?: string }
    let sourceMemberId = Number(body.sourceMemberId || 0)
    if (!sourceMemberId && body.sourceRef) {
      const resolved = await resolveMemberRef(body.sourceRef)
      sourceMemberId = Number(resolved?.id || 0)
      if (!sourceMemberId) {
        return NextResponse.json(
          { success: false, message: '병합할 회원을 찾을 수 없습니다. 회원번호 또는 ID를 확인해 주세요.' },
          { headers }
        )
      }
    }
    if (!sourceMemberId) {
      return NextResponse.json(
        { success: false, message: '병합할 회원(sourceMemberId 또는 sourceRef)이 필요합니다.' },
        { headers }
      )
    }

    const actor = authRes.auth?.name || authRes.auth?.employeeCode || 'manager'
    const result = await mergeMembers({ targetMemberId, sourceMemberId, actor })

    const member = await getMemberSummaryById(targetMemberId)

    return NextResponse.json({ success: true, result, member }, { headers })
  } catch (e) {
    console.error('POST /api/members/[id]/merge:', e)
    if (e instanceof MemberMergeError) {
      return NextResponse.json({ success: false, message: e.message }, { headers })
    }
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '회원 병합에 실패했습니다.' },
      { headers }
    )
  }
}
