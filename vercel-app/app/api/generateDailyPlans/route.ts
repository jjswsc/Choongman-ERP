import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { generateDailyPlansForDate, resolveDailyPlanScope } from '@/lib/daily-plan-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** 날짜 업무표 즉시 생성 (평소에는 18시 크론이 내일 것을 생성). 본사·슈퍼바이저 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  if (!scope.office && !scope.supervisor) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string }
    const date = String(body.date || '').trim()
    if (!YMD.test(date) || date < getBangkokTodayDateString()) {
      return NextResponse.json({ success: false, message: '오늘 이후 날짜만 생성할 수 있습니다.' }, { status: 400 })
    }
    const result = await generateDailyPlansForDate(date, scope.actorName || 'admin')
    return NextResponse.json({ success: true, result })
  } catch (e) {
    console.error('generateDailyPlans:', e)
    return NextResponse.json({ success: false, message: '생성 실패' }, { status: 500 })
  }
}
