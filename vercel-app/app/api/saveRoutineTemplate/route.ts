import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseInsertMany,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import {
  DAILY_PLAN_LINK_TYPES,
  DAILY_PLAN_POSITIONS,
  DAILY_PLAN_ROLES,
  ROUTINE_TEMPLATE_STATUSES,
} from '@/lib/daily-plan-generate'
import { resolveDailyPlanScope } from '@/lib/daily-plan-server'

type ItemIn = {
  timeSlot?: string
  block?: string
  category?: string
  title?: string
  description?: string
  estMinutes?: number | string
  weekdays?: string
  photoRequired?: boolean
  linkType?: string
  perStore?: boolean
}

type Body = {
  id?: number | string
  deleteTemplate?: boolean
  name?: string
  roleScope?: string
  position?: string
  storeName?: string
  status?: string
  note?: string
  travelMinutes?: number | string
  items?: ItemIn[]
  /** 시간 분석 제안 적용 — 같은 직급 템플릿(보관 제외)의 같은 이름 항목 예상 분 일괄 변경 */
  applyEstimate?: { roleScope?: string; title?: string; estMinutes?: number | string }
}

async function applyEstimate(input: NonNullable<Body['applyEstimate']>, actor: string, now: string) {
  const role = pick(input.roleScope, DAILY_PLAN_ROLES, 'supervisor')
  const title = String(input.title || '').trim()
  const est = Math.max(1, Math.min(480, Math.round(Number(input.estMinutes) || 0)))
  if (!title) return { updated: 0, templates: 0 }
  const tpls = ((await supabaseSelectFilter(
    'routine_templates',
    `role_scope=eq.${role}&status=in.(draft,pilot,active)`,
    { select: 'id,version', limit: 500 }
  )) || []) as { id?: number; version?: number }[]
  if (tpls.length === 0) return { updated: 0, templates: 0 }
  const items = ((await supabaseSelectFilter(
    'routine_template_items',
    `template_id=in.(${tpls.map((x) => Number(x.id)).join(',')})&title=eq.${encodeURIComponent(title)}`,
    { select: 'id,template_id', limit: 500 }
  )) || []) as { id?: number; template_id?: number }[]
  if (items.length === 0) return { updated: 0, templates: 0 }
  await supabaseUpdateByFilter('routine_template_items', `id=in.(${items.map((i) => Number(i.id)).join(',')})`, {
    est_minutes: est,
  })
  const touched = new Set(items.map((i) => Number(i.template_id)))
  for (const tpl of tpls.filter((x) => touched.has(Number(x.id)))) {
    await supabaseUpdateByFilter('routine_templates', `id=eq.${Number(tpl.id)}`, {
      version: Number(tpl.version || 1) + 1,
      updated_by: actor,
      updated_at: now,
    })
  }
  return { updated: items.length, templates: touched.size }
}

/** travel_minutes 컬럼 미배포(daily_plans_04 전)면 그 필드 없이 다시 시도 */
async function withTravelFallback<T>(header: Record<string, unknown>, run: (h: Record<string, unknown>) => Promise<T>): Promise<T> {
  try {
    return await run(header)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/travel_minutes/.test(msg)) throw e
    const rest = { ...header }
    delete rest.travel_minutes
    return run(rest)
  }
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = String(v || '').trim().toLowerCase() as T
  return allowed.includes(s) ? s : fallback
}

/** 템플릿 저장 — 버전 +1, 항목은 전체 교체. 본사·슈퍼바이저만 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  if (!scope.canEditTemplates) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as Body
    const id = Number(body.id || 0)
    const now = new Date().toISOString()

    if (body.applyEstimate) {
      const r = await applyEstimate(body.applyEstimate, scope.actorName, now)
      return NextResponse.json({ success: true, ...r })
    }

    if (body.deleteTemplate) {
      if (!id) return NextResponse.json({ success: false, message: 'id required' }, { status: 400 })
      await supabaseUpdateByFilter('routine_templates', `id=eq.${id}`, {
        status: 'archived',
        updated_by: scope.actorName,
        updated_at: now,
      })
      return NextResponse.json({ success: true, id })
    }

    const name = String(body.name || '').trim().slice(0, 120)
    if (!name) return NextResponse.json({ success: false, message: '이름을 입력해 주세요.' }, { status: 400 })

    const header = {
      name,
      role_scope: pick(body.roleScope, DAILY_PLAN_ROLES, 'supervisor'),
      position: pick(body.position, DAILY_PLAN_POSITIONS, 'all'),
      store_name: String(body.storeName || '').trim(),
      status: pick(body.status, ROUTINE_TEMPLATE_STATUSES, 'draft'),
      note: String(body.note || '').trim().slice(0, 1000),
      travel_minutes: Math.max(0, Math.min(240, Math.round(Number(body.travelMinutes ?? 30) || 0))),
      updated_by: scope.actorName,
      updated_at: now,
    }

    const items = (Array.isArray(body.items) ? body.items : [])
      .map((it, idx) => ({
        sort_order: (idx + 1) * 10,
        time_slot: /^\d{2}:\d{2}$/.test(String(it.timeSlot || '').trim()) ? String(it.timeSlot).trim() : '',
        block: String(it.block || '').trim().slice(0, 40),
        category: String(it.category || '기타').trim().slice(0, 40),
        title: String(it.title || '').trim().slice(0, 300),
        description: String(it.description || '').trim().slice(0, 2000),
        est_minutes: Math.max(0, Math.min(480, Math.round(Number(it.estMinutes) || 0))),
        weekdays: String(it.weekdays ?? '1234567').replace(/[^1-7]/g, '') || '1234567',
        photo_required: !!it.photoRequired,
        link_type: pick(it.linkType, DAILY_PLAN_LINK_TYPES, 'none'),
        per_store: !!it.perStore,
      }))
      .filter((it) => it.title)
      .slice(0, 80)

    let templateId = id
    if (id) {
      const cur = (await supabaseSelectFilter('routine_templates', `id=eq.${id}`, {
        select: 'id,version',
        limit: 1,
      })) as { id?: number; version?: number }[]
      if (!cur?.[0]) return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
      await withTravelFallback(header, (h) =>
        supabaseUpdateByFilter('routine_templates', `id=eq.${id}`, {
          ...h,
          version: Number(cur[0].version || 1) + 1,
        })
      )
      await supabaseDeleteByFilter('routine_template_items', `template_id=eq.${id}`)
    } else {
      const res = (await withTravelFallback(header, (h) =>
        supabaseInsert('routine_templates', { ...h, version: 1, created_at: now })
      )) as Record<string, unknown>[] | Record<string, unknown>
      const row = Array.isArray(res) ? res[0] : res
      templateId = Number(row?.id || 0)
      if (!templateId) return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 })
    }

    if (items.length > 0) {
      await supabaseInsertMany(
        'routine_template_items',
        items.map((it) => ({ ...it, template_id: templateId }))
      )
    }
    return NextResponse.json({ success: true, id: templateId })
  } catch (e) {
    console.error('saveRoutineTemplate:', e)
    return NextResponse.json({ success: false, message: '저장 실패' }, { status: 500 })
  }
}
