import { NextRequest } from 'next/server'
import { requireMemberSession } from '@/lib/member-portal-session'
import { linkMemberToQrTableOrder, requireQrGuestSession } from '@/lib/qr-table-server'
import { resolveQrSessionAuth } from '@/lib/qr-table-session-auth'
import { mapQrError, qrError, qrJson, qrOptions } from '@/lib/qr-table-api-helpers'

export function OPTIONS() {
  return qrOptions()
}

export async function POST(req: NextRequest) {
  try {
    const auth = resolveQrSessionAuth(req)
    if (!auth) return qrError('session_required', 401)
    await requireQrGuestSession(auth.sessionId, auth.rawSecret)

    const { member, error } = await requireMemberSession(req)
    if (error || !member) {
      return qrError('member_required', 401)
    }

    const result = await linkMemberToQrTableOrder(auth.sessionId, {
      id: member.id,
      memberNo: member.memberNo,
      name: member.name || member.fullName,
    })
    return qrJson({
      success: true,
      ...result,
      member: {
        id: member.id,
        memberNo: member.memberNo,
        name: member.name || member.fullName || '',
        pointBalance: member.pointBalance,
      },
    })
  } catch (e) {
    return mapQrError(e)
  }
}
