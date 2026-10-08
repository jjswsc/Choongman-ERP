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
  items?: ItemIn[]
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
      await supabaseUpdateByFilter('routine_templates', `id=eq.${id}`, {
        ...header,
        version: Number(cur[0].version || 1) + 1,
      })
      await supabaseDeleteByFilter('routine_template_items', `template_id=eq.${id}`)
    } else {
      const res = (await supabaseInsert('routine_templates', { ...header, version: 1, created_at: now })) as
        | Record<string, unknown>[]
        | Record<string, unknown>
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
