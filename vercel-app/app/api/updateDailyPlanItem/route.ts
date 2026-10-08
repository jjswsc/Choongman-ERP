import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilterReturning,
} from '@/lib/supabase-server'
import { computeActualMinutes } from '@/lib/daily-plan-generate'
import {
  canViewDailyPlan,
  getDailyPlanById,
  normalizePlanItemRow,
  resolveDailyPlanScope,
  touchDailyPlanProgress,
} from '@/lib/daily-plan-server'

type Body = {
  itemId?: number | string
  planId?: number | string
  action?: string
  note?: string
  skipReason?: string
  photoUrl?: string
  actualMinutes?: number | string
  title?: string
  estMinutes?: number | string
  storeName?: string
  category?: string
  timeSlot?: string
}

const ACTIONS = new Set(['start', 'done', 'skip', 'reopen', 'note', 'photo', 'add', 'remove'])
const MAX_PHOTOS = 6

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)

  try {
    const body = (await request.json()) as Body
    const action = String(body.action || '').trim()
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ success: false, message: 'invalid action' }, { status: 400 })
    }
    const now = new Date()
    const nowIso = now.toISOString()

    if (action === 'add') {
      const plan = await getDailyPlanById(Number(body.planId || 0))
      if (!plan) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
      if (!canViewDailyPlan(scope, plan)) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
      }
      if (plan.status === 'closed') {
        return NextResponse.json({ success: false, messageKey: 'dp_err_closed', message: '마감된 업무표입니다.' }, { status: 409 })
      }
      const title = String(body.title || '').trim().slice(0, 300)
      if (!title) return NextResponse.json({ success: false, message: 'title required' }, { status: 400 })
      const last = (await supabaseSelectFilter('daily_plan_items', `plan_id=eq.${plan.id}`, {
        select: 'sort_order',
        order: 'sort_order.desc',
        limit: 1,
      })) as { sort_order?: number }[]
      const res = (await supabaseInsert('daily_plan_items', {
        plan_id: plan.id,
        source: 'hq_task',
        store_name: String(body.storeName || '').trim(),
        time_slot: String(body.timeSlot || '').trim().slice(0, 5),
        category: String(body.category || '당일 과제').trim(),
        title,
        est_minutes: Math.max(0, Math.round(Number(body.estMinutes) || 30)),
        note: String(body.note || '').trim().slice(0, 1000),
        status: 'todo',
        sort_order: Number(last?.[0]?.sort_order || 0) + 10,
        created_at: nowIso,
        updated_at: nowIso,
      })) as Record<string, unknown>[] | Record<string, unknown>
      const row = Array.isArray(res) ? res[0] : res
      return NextResponse.json({ success: true, item: row ? normalizePlanItemRow(row) : null })
    }

    const itemId = Number(body.itemId || 0)
    const rows = (await supabaseSelectFilter('daily_plan_items', `id=eq.${itemId}`, { limit: 1 })) as Record<string, unknown>[]
    if (!rows?.[0]) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
    const item = normalizePlanItemRow(rows[0])
    const plan = await getDailyPlanById(item.plan_id)
    if (!plan) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
    if (!canViewDailyPlan(scope, plan)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
    }
    if (plan.status === 'closed') {
      return NextResponse.json({ success: false, messageKey: 'dp_err_closed', message: '마감된 업무표입니다.' }, { status: 409 })
    }

    if (action === 'remove') {
      if (item.source !== 'hq_task' || item.status !== 'todo') {
        return NextResponse.json({ success: false, message: '본사 과제(미착수)만 삭제할 수 있습니다.' }, { status: 400 })
      }
      await supabaseDeleteByFilter('daily_plan_items', `id=eq.${item.id}`)
      return NextResponse.json({ success: true, removed: item.id })
    }

    const photoUrl = String(body.photoUrl || '').trim()
    const photos = [...(item.photo_urls || [])]
    if (photoUrl && !photos.includes(photoUrl)) photos.push(photoUrl)
    const note = body.note !== undefined ? String(body.note || '').trim().slice(0, 1000) : undefined

    const patch: Record<string, unknown> = { updated_at: nowIso }
    if (note !== undefined) patch.note = note
    if (photoUrl) patch.photo_urls = photos.slice(-MAX_PHOTOS)

    switch (action) {
      case 'start':
        patch.status = 'doing'
        if (!item.started_at) patch.started_at = nowIso
        break
      case 'done': {
        if (item.photo_required && photos.length === 0) {
          return NextResponse.json(
            { success: false, messageKey: 'dp_err_photo_required', message: '사진을 먼저 올려 주세요.' },
            { status: 400 }
          )
        }
        const manual = Number(body.actualMinutes)
        patch.status = 'done'
        patch.finished_at = nowIso
        patch.actual_minutes =
          Number.isFinite(manual) && manual > 0
            ? Math.round(manual)
            : computeActualMinutes(item.started_at, now.getTime(), item.est_minutes)
        break
      }
      case 'skip': {
        const reason = String(body.skipReason || '').trim().slice(0, 500)
        if (!reason) {
          return NextResponse.json(
            { success: false, messageKey: 'dp_err_reason_required', message: '사유를 입력해 주세요.' },
            { status: 400 }
          )
        }
        patch.status = 'skipped'
        patch.skip_reason = reason
        patch.finished_at = nowIso
        break
      }
      case 'reopen':
        patch.status = 'todo'
        patch.finished_at = null
        patch.actual_minutes = null
        patch.skip_reason = ''
        break
      case 'note':
      case 'photo':
        break
    }

    const updated = (await supabaseUpdateByFilterReturning('daily_plan_items', `id=eq.${item.id}`, patch)) as Record<
      string,
      unknown
    >[]
    await touchDailyPlanProgress(plan.id)
    return NextResponse.json({ success: true, item: updated?.[0] ? normalizePlanItemRow(updated[0]) : null })
  } catch (e) {
    console.error('updateDailyPlanItem:', e)
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 })
  }
}
