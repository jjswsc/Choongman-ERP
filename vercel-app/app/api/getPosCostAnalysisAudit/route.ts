import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectAllPages, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { canAccessPosCostAnalysis } from '@/lib/permissions'

type AuditRow = {
  id?: number
  action_type?: 'insert' | 'update' | 'delete' | string
  changed_at?: string
  actor_name?: string | null
  actor_role?: string | null
  actor_store?: string | null
  actor_employee_code?: string | null
  menu_id?: number | null
  menu_code?: string | null
  option_id?: number | null
  ingredient_id?: number | null
  before_row?: Record<string, unknown> | null
  after_row?: Record<string, unknown> | null
}

type MenuRow = { id?: number; code?: string; name?: string }
type OptionRow = { id?: number; name?: string; option_code?: string | null }
type ItemRow = { code?: string; name?: string }
type SauceRow = { code?: string; name?: string }

function safeObj(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function asNum(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseYmd(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    if (!canAccessPosCostAnalysis(String(authResult.auth.role || ''))) {
      return NextResponse.json({ success: false, message: 'no permission' }, { status: 403, headers })
    }

    const url = new URL(request.url)
    const limitRaw = Number(url.searchParams.get('limit') || 500)
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 500, 3000))
    const startDateRaw = parseYmd(String(url.searchParams.get('startDate') || ''))
    const endDateRaw = parseYmd(String(url.searchParams.get('endDate') || ''))
    const startDate =
      startDateRaw && endDateRaw && startDateRaw > endDateRaw ? endDateRaw : startDateRaw
    const endDate =
      startDateRaw && endDateRaw && startDateRaw > endDateRaw ? startDateRaw : endDateRaw
    const startTs = startDate ? `${startDate} 00:00:00` : ''
    const endTs = endDate ? `${endDate} 23:59:59` : ''
    let filter = 'id=gt.0'
    if (startTs) filter = `changed_at=gte.${encodeURIComponent(startTs)}`
    if (endTs) {
      filter = filter
        ? `${filter}&changed_at=lte.${encodeURIComponent(endTs)}`
        : `changed_at=lte.${encodeURIComponent(endTs)}`
    }

    const audits = (await supabaseSelectFilterAllPages(
      'pos_menu_ingredients_audit',
      filter,
      {
        order: 'changed_at.desc,id.desc',
        select:
          'id,action_type,changed_at,actor_name,actor_role,actor_store,actor_employee_code,menu_id,menu_code,option_id,ingredient_id,before_row,after_row',
        pageSize: Math.min(1000, limit),
        maxRows: limit,
      }
    ).catch(() => [])) as AuditRow[]

    const [menus, options, items, sauces] = await Promise.all([
      (supabaseSelectAllPages('pos_menus', {
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 1_000_000,
        select: 'id,code,name',
      }).catch(() => [])) as Promise<MenuRow[]>,
      (supabaseSelectAllPages('pos_menu_options', {
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 1_000_000,
        select: 'id,name,option_code',
      }).catch(() => [])) as Promise<OptionRow[]>,
      (supabaseSelectAllPages('items', {
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 1_000_000,
        select: 'code,name',
      }).catch(() => [])) as Promise<ItemRow[]>,
      (supabaseSelectAllPages('sauces', {
        order: 'id.asc',
        pageSize: 8000,
        maxRows: 1_000_000,
        select: 'code,name',
      }).catch(() => [])) as Promise<SauceRow[]>,
    ])

    const menuById: Record<number, MenuRow> = {}
    for (const m of menus || []) {
      const id = asNum(m.id)
      if (id == null) continue
      menuById[id] = m
    }
    const optionById: Record<number, OptionRow> = {}
    for (const o of options || []) {
      const id = asNum(o.id)
      if (id == null) continue
      optionById[id] = o
    }
    const itemNameByCode: Record<string, string> = {}
    for (const it of items || []) {
      const code = String(it.code ?? '').trim()
      if (!code) continue
      itemNameByCode[code] = String(it.name ?? '').trim() || code
    }
    for (const s of sauces || []) {
      const code = String(s.code ?? '').trim()
      if (!code) continue
      if (!itemNameByCode[code]) itemNameByCode[code] = String(s.name ?? '').trim() || code
    }

    const rows = (audits || []).map((a) => {
      const before = safeObj(a.before_row)
      const after = safeObj(a.after_row)
      const pivot = after || before || null

      const menuId = asNum(a.menu_id) ?? asNum(pivot?.menu_id) ?? 0
      const optionId = asNum(a.option_id) ?? asNum(pivot?.option_id)
      const itemCode = String(pivot?.item_code ?? '').trim()
      const quantity = Number(pivot?.quantity ?? 0) || 0
      const lossRate = Number(pivot?.loss_rate ?? 0) || 0
      const ingredientType = String(pivot?.ingredient_type ?? '').trim() || null
      const menuCode =
        String(a.menu_code ?? '').trim() ||
        String(pivot?.menu_code ?? '').trim() ||
        String(menuById[menuId]?.code ?? '').trim()

      return {
        id: Number(a.id ?? 0) || 0,
        actionType: String(a.action_type ?? ''),
        changedAt: String(a.changed_at ?? ''),
        actorName: String(a.actor_name ?? '').trim() || null,
        actorRole: String(a.actor_role ?? '').trim() || null,
        actorStore: String(a.actor_store ?? '').trim() || null,
        actorEmployeeCode: String(a.actor_employee_code ?? '').trim() || null,
        menuId: menuId || null,
        menuCode: menuCode || null,
        menuName: String(menuById[menuId]?.name ?? '').trim() || null,
        optionId: optionId ?? null,
        optionName: optionId != null ? String(optionById[optionId]?.name ?? '').trim() || null : null,
        optionCode: optionId != null ? String(optionById[optionId]?.option_code ?? '').trim() || null : null,
        ingredientId: asNum(a.ingredient_id),
        itemCode: itemCode || null,
        itemName: itemCode ? String(itemNameByCode[itemCode] ?? itemCode) : null,
        quantity,
        lossRate,
        ingredientType,
      }
    })

    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('getPosCostAnalysisAudit:', e)
    return NextResponse.json([], { headers })
  }
}

