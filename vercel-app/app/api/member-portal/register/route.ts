import { NextRequest, NextResponse } from 'next/server'
import { approveReferral } from '@/lib/member-crm-server'
import { findMemberByReferralCode, updateMember } from '@/lib/members-server'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function POST(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const body = (await req.json()) as {
      name?: string
      birthDate?: string
      gender?: string
      nationality?: string
      email?: string
      consentMarketing?: boolean
      referralCode?: string
    }
    const memberId = member!.id
    const inputReferrerCode = String(body.referralCode || '').trim().toUpperCase()
    let referredByMemberId: number | undefined
    if (inputReferrerCode && !member!.referredByMemberId) {
      const referrer = await findMemberByReferralCode(inputReferrerCode)
      if (referrer?.id && referrer.id !== memberId) {
        referredByMemberId = referrer.id
      }
    }

    const updated = await updateMember({
      id: memberId,
      name: String(body.name || '').trim() || member!.name,
      birthDate: String(body.birthDate || '').trim(),
      gender: String(body.gender || '').trim(),
      nationality: String(body.nationality || '').trim(),
      email: String(body.email || '').trim(),
      consentMarketing: Boolean(body.consentMarketing),
      ...(member!.joinChannel ? {} : { joinChannel: 'homepage' }),
      ...(referredByMemberId ? { referredByMemberId } : {}),
    })

    if (referredByMemberId) {
      try {
        await approveReferral({
          referrerMemberId: referredByMemberId,
          referredMemberId: memberId,
        })
      } catch {
        /* duplicate referral reward — ignore */
      }
    }

    return NextResponse.json({ success: true, member: updated })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '회원정보 저장에 실패했습니다.' },
      { status: 400 }
    )
  }
}
