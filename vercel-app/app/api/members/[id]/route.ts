import { NextRequest, NextResponse } from 'next/server'
import { getMemberSummaryById, updateMember, MemberSaveError } from '@/lib/members-server'
import { resolveMembersTenantScope } from '@/lib/members-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const params = await context.params
    const id = Number(params.id || 0)
    if (!id) {
      return NextResponse.json({ success: false, message: '유효한 회원 ID가 필요합니다.' }, { headers })
    }
    const member = await getMemberSummaryById(id, tenantScope)
    if (!member) {
      return NextResponse.json({ success: false, message: '회원을 찾을 수 없습니다.' }, { status: 404, headers })
    }
    return NextResponse.json({ success: true, member }, { headers })
  } catch (e) {
    console.error('GET /api/members/[id]:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '회원 조회에 실패했습니다.',
      },
      { status: 500, headers }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const params = await context.params
    const id = Number(params.id || 0)
    if (!id) {
      return NextResponse.json({ success: false, message: '유효한 회원 ID가 필요합니다.' }, { headers })
    }
    const body = (await req.json()) as {
      name?: string
      fullName?: string
      lineDisplayName?: string
      birthDate?: string
      gender?: string
      nationality?: string
      joinChannel?: string
      referralCode?: string
      referredByMemberId?: number
      phone?: string
      email?: string
      consentMarketing?: boolean
      consentPrivacy?: boolean
      consentAt?: string
      createdAt?: string
      status?: string
    }
    const member = await updateMember({
      id,
      name: body.name,
      fullName: body.fullName,
      lineDisplayName: body.lineDisplayName,
      birthDate: body.birthDate,
      gender: body.gender,
      nationality: body.nationality,
      joinChannel: body.joinChannel,
      referralCode: body.referralCode,
      referredByMemberId: body.referredByMemberId,
      phone: body.phone,
      email: body.email,
      consentMarketing: body.consentMarketing,
      consentPrivacy: body.consentPrivacy,
      consentAt: body.consentAt,
      createdAt: body.createdAt,
      status: body.status,
      tenantScope,
    })
    return NextResponse.json({ success: true, member }, { headers })
  } catch (e) {
    console.error('PATCH /api/members/[id]:', e)
    if (e instanceof MemberSaveError) {
      return NextResponse.json(
        { success: false, code: e.code, message: e.message },
        { headers }
      )
    }
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '회원 수정에 실패했습니다.',
      },
      { headers }
    )
  }
}
