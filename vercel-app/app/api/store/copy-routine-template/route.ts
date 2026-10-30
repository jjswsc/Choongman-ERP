import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  supabaseInsert,
  supabaseInsertMany,
  supabaseSelectFilter,
} from '@/lib/supabase-server'
import { DAILY_PLAN_LINK_TYPES, DAILY_PLAN_POSITIONS, DAILY_PLAN_ROLES } from '@/lib/daily-plan-generate'
import { resolveDailyPlanScope } from '@/lib/daily-plan-server'

type Body = {
  sourceId?: number | string
  targetStoreNames?: unknown
}

type TemplateRow = {
  id?: number
  name?: string
  role_scope?: string
  position?: string
  store_name?: string
  note?: string
  travel_minutes?: number
  status?: string
}

type ItemRow = {
  sort_order?: number
  time_slot?: string
  block?: string
  category?: string
  title?: string
  description?: string
  est_minutes?: number
  weekdays?: string
  photo_required?: boolean
  link_type?: string
  per_store?: boolean
}

/** travel_minutes 컬럼 미배포면 그 필드 없이 다시 시도 */
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

/**
 * 루틴 템플릿을 다른 매장(들)으로 복제.
 * 같은 role_scope + position + store_name 의 비보관 템플릿이 있으면 해당 매장은 건너뜀.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const scope = resolveDailyPlanScope(authResult.auth)
  if (!scope.canEditTemplates) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403 })
  }

  try {
    const body = (await request.json()) as Body
    const sourceId = Number(body.sourceId || 0)
    if (!sourceId) {
      return NextResponse.json({ success: false, message: 'sourceId required' }, { status: 400 })
    }

    const targets = [
      ...new Set(
        (Array.isArray(body.targetStoreNames) ? body.targetStoreNames : [])
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      ),
    ].slice(0, 80)

    if (targets.length === 0) {
      return NextResponse.json({ success: false, message: 'targetStoreNames required' }, { status: 400 })
    }

    const srcRows = ((await supabaseSelectFilter('routine_templates', `id=eq.${sourceId}`, {
      limit: 1,
    })) || []) as TemplateRow[]
    const src = srcRows[0]
    if (!src) {
      return NextResponse.json({ success: false, message: 'not found' }, { status: 404 })
    }

    const roleScope = pick(src.role_scope, DAILY_PLAN_ROLES, 'supervisor')
    const position = pick(src.position, DAILY_PLAN_POSITIONS, 'all')
    const baseName = String(src.name || '').trim().slice(0, 100) || 'Template'

    const itemRows = ((await supabaseSelectFilter('routine_template_items', `template_id=eq.${sourceId}`, {
      order: 'sort_order.asc,id.asc',
      limit: 80,
    })) || []) as ItemRow[]

    const items = itemRows
      .map((it, idx) => ({
        sort_order: Number(it.sort_order) || (idx + 1) * 10,
        time_slot: /^\d{2}:\d{2}$/.test(String(it.time_slot || '').trim()) ? String(it.time_slot).trim() : '',
        block: String(it.block || '').trim().slice(0, 40),
        category: String(it.category || '기타').trim().slice(0, 40),
        title: String(it.title || '').trim().slice(0, 300),
        description: String(it.description || '').trim().slice(0, 2000),
        est_minutes: Math.max(0, Math.min(480, Math.round(Number(it.est_minutes) || 0))),
        weekdays: String(it.weekdays ?? '1234567').replace(/[^1-7]/g, '') || '1234567',
        photo_required: !!it.photo_required,
        link_type: pick(it.link_type, DAILY_PLAN_LINK_TYPES, 'none'),
        per_store: !!it.per_store,
      }))
      .filter((it) => it.title)

    const existing = ((await supabaseSelectFilter(
      'routine_templates',
      `role_scope=eq.${roleScope}&position=eq.${position}&status=in.(draft,pilot,active)`,
      { select: 'id,store_name', limit: 500 }
    )) || []) as { id?: number; store_name?: string }[]
    const existingStores = new Set(existing.map((r) => String(r.store_name || '').trim()).filter(Boolean))

    const now = new Date().toISOString()
    const created: { id: number; storeName: string; name: string }[] = []
    const skipped: { storeName: string; reason: string }[] = []

    for (const storeName of targets) {
      if (existingStores.has(storeName)) {
        skipped.push({ storeName, reason: 'exists' })
        continue
      }

      const name = `${baseName} · ${storeName}`.slice(0, 120)
      const header: Record<string, unknown> = {
        name,
        role_scope: roleScope,
        position,
        store_name: storeName,
        status: 'draft',
        note: String(src.note || '').trim().slice(0, 1000),
        travel_minutes: Math.max(0, Math.min(240, Math.round(Number(src.travel_minutes ?? 30) || 0))),
        version: 1,
        created_at: now,
        updated_by: scope.actorName,
        updated_at: now,
      }

      const res = (await withTravelFallback(header, (h) => supabaseInsert('routine_templates', h))) as
        | Record<string, unknown>[]
        | Record<string, unknown>
      const row = Array.isArray(res) ? res[0] : res
      const templateId = Number(row?.id || 0)
      if (!templateId) {
        skipped.push({ storeName, reason: 'insert_failed' })
        continue
      }

      if (items.length > 0) {
        await supabaseInsertMany(
          'routine_template_items',
          items.map((it) => ({ ...it, template_id: templateId }))
        )
      }

      existingStores.add(storeName)
      created.push({ id: templateId, storeName, name })
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      createdList: created,
      skippedList: skipped,
    })
  } catch (e) {
    console.error('copy-routine-template:', e)
    return NextResponse.json({ success: false, message: '복사 실패' }, { status: 500 })
  }
}
