import { NextRequest, NextResponse } from 'next/server'
import { getMemberBySessionToken, readMemberTokenFromRequest } from '@/lib/member-portal-auth'
import { resolveMemberPortalTenantScope } from '@/lib/member-portal-tenant-scope'
import type { MembersTenantScope } from '@/lib/members-tenant-scope'
import { LEGACY_MEMBERS_TENANT_SCOPE } from '@/lib/members-tenant-scope'
import type { MemberSummary } from '@/lib/members-server'

export async function requireMemberSession(
  req: NextRequest
): Promise<{ member: MemberSummary | null; error: NextResponse | null }> {
  const token = readMemberTokenFromRequest(req)
  const member = await getMemberBySessionToken(token)
  if (!member) {
    return {
      member: null,
      error: NextResponse.json(
        { success: false, message: '로그인이 필요합니다.' },
        { status: 401 }
      ),
    }
  }
  return { member, error: null }
}

/** 세션 회원 + Omni tenant 스코프 */
export async function requireMemberSessionWithTenant(req: NextRequest): Promise<{
  member: MemberSummary | null
  tenantScope: MembersTenantScope
  error: NextResponse | null
}> {
  const base = await requireMemberSession(req)
  if (base.error || !base.member) {
    return { member: null, tenantScope: LEGACY_MEMBERS_TENANT_SCOPE, error: base.error }
  }
  const tenantScope = await resolveMemberPortalTenantScope({
    request: req,
    memberId: base.member.id,
    joinStoreCode: base.member.joinStoreCode,
  })
  return { member: base.member, tenantScope, error: null }
}

