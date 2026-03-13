import { NextRequest, NextResponse } from 'next/server'
import { updateMember } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const params = context.params
    const id = Number(params.id || 0)
    if (!id) {
      return NextResponse.json({ success: false, message: '유효한 회원 ID가 필요합니다.' }, { headers })
    }
    const body = (await req.json()) as {
      name?: string
      phone?: string
      email?: string
      status?: string
    }
    const member = await updateMember({
      id,
      name: body.name,
      phone: body.phone,
      email: body.email,
      status: body.status,
    })
    return NextResponse.json({ success: true, member }, { headers })
  } catch (e) {
    console.error('PATCH /api/members/[id]:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '회원 수정에 실패했습니다.',
      },
      { headers }
    )
  }
}
