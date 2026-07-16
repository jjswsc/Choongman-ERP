import { NextRequest, NextResponse } from 'next/server'
import { createMember, listMembers, MemberSaveError } from '@/lib/members-server'
import { resolveMembersTenantScope } from '@/lib/members-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.min(5000, Math.max(1, Number(limitParam))) : 500
    const rows = await listMembers({ q, limit, tenantScope })
    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('GET /api/members:', e)
    return NextResponse.json([], { headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const tenantScope = await resolveMembersTenantScope({ auth: authRes.auth })
    const body = (await req.json()) as {
      name?: string
      phone?: string
      email?: string
      birthDate?: string
      gender?: string
      nationality?: string
      joinChannel?: string
      referralCode?: string
      referredByMemberId?: number
      source?: string
      lineUserId?: string
      lineDisplayName?: string
      linePictureUrl?: string
    }
    const member = await createMember({
      name: String(body.name || '').trim(),
      phone: String(body.phone || '').trim(),
      email: String(body.email || '').trim(),
      birthDate: String(body.birthDate || '').trim(),
      gender: String(body.gender || '').trim(),
      nationality: String(body.nationality || '').trim(),
      joinChannel: String(body.joinChannel || '').trim(),
      referralCode: String(body.referralCode || '').trim().toUpperCase(),
      referredByMemberId: Number(body.referredByMemberId || 0) || undefined,
      source: String(body.source || '').trim() || 'manual',
      lineUserId: String(body.lineUserId || '').trim(),
      lineDisplayName: String(body.lineDisplayName || '').trim(),
      linePictureUrl: String(body.linePictureUrl || '').trim(),
      tenantScope,
    })
    return NextResponse.json({ success: true, member }, { headers })
  } catch (e) {
    console.error('POST /api/members:', e)
    if (e instanceof MemberSaveError) {
      return NextResponse.json(
        { success: false, code: e.code, message: e.message },
        { headers }
      )
    }
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '회원 저장에 실패했습니다.',
      },
      { headers }
    )
  }
}
