import { NextRequest, NextResponse } from 'next/server'
import {
  loadMemberSignupStoreGoals,
  resolveMemberSignupStoreScope,
  saveMemberSignupStoreGoals,
} from '@/lib/member-signup-store'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const monthYmd = String(req.nextUrl.searchParams.get('month') || '').trim()
    const lang = String(req.nextUrl.searchParams.get('lang') || 'ko').trim()
    const scope = resolveMemberSignupStoreScope(authResult.auth!.role || '', authResult.auth!.store)
    const goals = await loadMemberSignupStoreGoals({ monthYmd, lang, scope })
    return NextResponse.json({ success: true, monthYmd, goals, scope })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'goals_load_failed' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveMemberSignupStoreScope(authResult.auth!.role || '', authResult.auth!.store)
  if (!scope.canEditGoals) {
    return NextResponse.json({ success: false, message: 'forbidden' }, { status: 403 })
  }
  try {
    const body = (await req.json()) as {
      monthYmd?: string
      goals?: Array<{ storeCode?: string; targetCount?: number }>
    }
    const monthYmd = String(body.monthYmd || '').trim()
    const goals = (body.goals || []).map((g) => ({
      storeCode: String(g.storeCode || '').trim(),
      targetCount: Math.max(0, Math.trunc(Number(g.targetCount || 0))),
    }))
    await saveMemberSignupStoreGoals({ monthYmd, goals })
    const saved = await loadMemberSignupStoreGoals({ monthYmd, scope })
    return NextResponse.json({ success: true, monthYmd, goals: saved })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'goals_save_failed'
    return NextResponse.json({ success: false, message: msg }, { status: 400 })
  }
}
