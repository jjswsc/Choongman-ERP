import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseUpdateByFilter } from '@/lib/supabase-server'
import { pushStoreActionNotice } from '@/lib/store-action-server'
import type { HqTaskInput } from '@/lib/daily-plan-generate'
import {
  canAssignDailyPlan,
  dailyPlanRoleOf,
  ensureDailyPlan,
  getDailyPlanFor,
  loadPlanEmployeeById,
  planRecipient,
  resolveDailyPlanScope,
} from '@/lib/daily-plan-server'

const YMD = /^\d{4}-\d{2}-\d{2}$/

type Body = {
  date?: string
  employeeId?: number | string
  routeStores?: string[]
  tasks?: { title?: string; store?: string; estMinutes?: number | string; category?: string; timeSlot?: string }[]
  briefing?: string
  publish?: boolean
}

/**
 * 일정표 배정 — 방문 매장(슈퍼바이저)·본사 과제·브리핑 저장.
 * 미착수 루틴·방문·개선과제 항목은 재생성, 미착수 본사 과제는 새 목록으로 교체. publish면 공개 + 푸시.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)

  try {
    const body = (await request.json()) as Body
    const date = String(body.date || '').trim()
    if (!YMD.test(date) || date < getBangkokTodayDateString()) {
      return NextResponse.json({ success: false, message: '오늘 이후 날짜만 배정할 수 있습니다.' }, { status: 400 })
    }
    const emp = await loadPlanEmployeeById(Number(body.employeeId || 0))
    if (!emp) return NextResponse.json({ success: false, message: '직원을 찾을 수 없습니다.' }, { status: 404 })
    const role = dailyPlanRoleOf(emp) || 'staff'
    if (!canAssignDailyPlan(scope, { role, store: emp.store, employeeId: emp.id })) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
    }
    const existing = await getDailyPlanFor(date, emp.id)
    if (existing?.status === 'closed') {
      return NextResponse.json({ success: false, messageKey: 'dp_err_closed', message: '마감된 일정표입니다.' }, { status: 409 })
    }

    const routeStores = Array.isArray(body.routeStores)
      ? [...new Set(body.routeStores.map((s) => String(s || '').trim()).filter(Boolean))].slice(0, 12)
      : undefined
    const hqTasks: HqTaskInput[] | undefined = Array.isArray(body.tasks)
      ? body.tasks
          .map((t) => ({
            title: String(t.title || '').trim().slice(0, 300),
            storeName: String(t.store || '').trim(),
            estMinutes: Math.max(0, Math.round(Number(t.estMinutes) || 30)),
            category: String(t.category || '당일 과제').trim(),
            timeSlot: String(t.timeSlot || '').trim().slice(0, 5),
          }))
          .filter((t) => t.title)
          .slice(0, 30)
      : undefined

    const { plan } = await ensureDailyPlan({
      date,
      employee: emp,
      role,
      routeStores: role === 'supervisor' ? routeStores : undefined,
      hqTasks,
      briefing: body.briefing !== undefined ? String(body.briefing || '') : undefined,
      actor: scope.actorName,
      regenerate: true,
      force: true,
    })
    if (!plan) return NextResponse.json({ success: false, message: '일정표를 만들 수 없습니다.' }, { status: 500 })

    let pushed = 0
    if (body.publish) {
      const firstPublish = !plan.published_at
      await supabaseUpdateByFilter('daily_plans', `id=eq.${plan.id}`, {
        published_at: plan.published_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      pushed = await pushStoreActionNotice({
        title: firstPublish
          ? '📅 일정표 배정 · มีตารางงานใหม่ครับ'
          : '📅 일정표 변경 · ตารางงานมีการเปลี่ยนแปลงครับ',
        body: `${date} · ${(routeStores || plan.route_stores || []).join(', ') || plan.store_name}`.slice(0, 180),
        recipients: [planRecipient(plan)],
      })
    }
    return NextResponse.json({ success: true, planId: plan.id, pushed })
  } catch (e) {
    console.error('saveDailyPlanAssignment:', e)
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 })
  }
}
