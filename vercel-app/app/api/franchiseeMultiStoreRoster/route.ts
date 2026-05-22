import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectPageCap, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { canAccessSettings } from '@/lib/permissions'
import { parseExtraStoresColumn } from '@/lib/extra-stores-column'
import {
  normalizeFranchiseeExtraStores,
  normalizeFranchiseeMultiStoreSettings,
  rowRoleLooksFranchisee,
  type FranchiseeMultiStoreSettings,
} from '@/lib/franchisee-multi-store'
import {
  getFranchiseeMultiStoreSettings,
  saveFranchiseeMultiStoreSettings,
} from '@/lib/franchisee-multi-store-settings-server'
import { normalizeEmployeeNameFields } from '@/lib/employee-display-name'

export const dynamic = 'force-dynamic'

function bangkokTodayDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function normalizedEmployeeStatus(val: unknown, resignDate: unknown): 'active' | 'leave' | 'resigned' | 'suspended' {
  const today = bangkokTodayDateStr()
  const resignDateStr =
    resignDate && typeof resignDate === 'string'
      ? resignDate.trim().slice(0, 10)
      : resignDate
        ? new Date(resignDate as string).toISOString().slice(0, 10)
        : ''
  const raw = String(val || '')
    .trim()
    .toLowerCase()
  if (raw === 'active' || raw === 'leave' || raw === 'resigned' || raw === 'suspended') {
    if (raw === 'resigned' && resignDateStr && resignDateStr > today) return 'active'
    return raw as 'active' | 'leave' | 'resigned' | 'suspended'
  }
  if (!resignDateStr) return 'active'
  return resignDateStr <= today ? 'resigned' : 'active'
}

type RosterRow = {
  row: number
  store: string
  name: string
  nick: string
  role: string
  extraStores: string[]
}

async function loadFranchiseeEmployeeRows(): Promise<Record<string, unknown>[]> {
  const selectCandidates = [
    'id,store,name,nick,role,extra_stores,resign_date,employment_status,deleted_at',
    'id,store,name,nick,role,resign_date,employment_status,deleted_at',
    'id,store,name,nick,role,resign_date,deleted_at',
    'id,store,name,nick,role,resign_date',
  ]
  const limit = supabaseSelectPageCap()
  let lastErr: unknown = null
  for (const sel of selectCandidates) {
    try {
      return (
        ((await supabaseSelect('employees', { order: 'id.asc', select: sel, limit })) as Record<
          string,
          unknown
        >[]) || []
      )
    } catch (e) {
      lastErr = e
      const em = e instanceof Error ? e.message : String(e)
      if (/extra_stores|employment_status|deleted_at|42703|column/i.test(em)) continue
      throw e
    }
  }
  if (lastErr) throw lastErr
  return []
}

function buildRoster(rows: Record<string, unknown>[]): RosterRow[] {
  const out: RosterRow[] = []
  for (const r of rows) {
    const deletedAt = r.deleted_at != null ? String(r.deleted_at).trim() : ''
    if (deletedAt) continue
    const role = String(r.role || '').trim()
    if (!rowRoleLooksFranchisee(role)) continue
    const status = normalizedEmployeeStatus(r.employment_status, r.resign_date)
    if (status === 'resigned') continue
    const store = String(r.store || '').trim()
    const rawName = r.name != null ? String(r.name).trim() : ''
    const { name } = normalizeEmployeeNameFields(rawName, '')
    const nick = r.nick != null ? String(r.nick).trim() : ''
    const row = Number(r.id || 0)
    if (!row || !store) continue
    out.push({
      row,
      store,
      name: name || rawName,
      nick,
      role,
      extraStores: parseExtraStoresColumn(r.extra_stores),
    })
  }
  out.sort((a, b) => {
    const sc = a.store.localeCompare(b.store)
    if (sc !== 0) return sc
    return (a.nick || a.name).localeCompare(b.nick || b.name)
  })
  return out
}

/** 가맹점주 복수 매장 — Franchisee 목록·추가 매장 조회 (설정 권한) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { auth, errorResponse } = await requireAuth(request, 'any')
  if (errorResponse) return errorResponse
  if (!auth || !canAccessSettings(auth.role || '')) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
  }
  try {
    const settings = await getFranchiseeMultiStoreSettings()
    const rows = await loadFranchiseeEmployeeRows()
    const roster = buildRoster(rows)
    const storeSet = new Set<string>()
    for (const r of rows) {
      const s = String(r.store || '').trim()
      if (s) storeSet.add(s)
    }
    const stores = [...storeSet].sort((a, b) => a.localeCompare(b))
    return NextResponse.json({ success: true, settings, roster, stores }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e instanceof Error ? e.message : e) },
      { status: 500, headers }
    )
  }
}

/** 가맹점주별 추가 매장 일괄 저장 (설정 권한) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { auth, errorResponse } = await requireAuth(request, 'any')
  if (errorResponse) return errorResponse
  if (!auth || !canAccessSettings(auth.role || '')) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
  }
  try {
    const body = (await request.json()) as {
      assignments?: { employeeId?: number; extraStores?: unknown }[]
      settings?: { enabled?: boolean; maxStores?: number }
    }
    if (body.settings?.enabled === true) {
      const toSave = normalizeFranchiseeMultiStoreSettings({
        enabled: true,
        maxStores: body.settings.maxStores,
      })
      await saveFranchiseeMultiStoreSettings(toSave)
    }
    let settings: FranchiseeMultiStoreSettings = await getFranchiseeMultiStoreSettings()
    if (!settings.enabled) {
      return NextResponse.json(
        {
          success: false,
          message:
            '복수 매장 기능이 서버에 저장되지 않았습니다. 「복수 매장 기능 사용」을 켠 뒤 「설정 저장」을 누르거나, 다시 「매장 지정 저장」을 시도해 주세요.',
        },
        { status: 400, headers }
      )
    }
    const assignments = Array.isArray(body.assignments) ? body.assignments : []
    if (assignments.length === 0) {
      return NextResponse.json({ success: false, message: '저장할 항목이 없습니다.' }, { status: 400, headers })
    }

    const rows = await loadFranchiseeEmployeeRows()
    const rosterIds = new Set(buildRoster(rows).map((r) => r.row))
    const byId = new Map<number, { store: string; role: string }>()
    for (const r of rows) {
      const id = Number(r.id || 0)
      if (!id) continue
      const role = String(r.role || '').trim()
      if (!rowRoleLooksFranchisee(role)) continue
      const deletedAt = r.deleted_at != null ? String(r.deleted_at).trim() : ''
      if (deletedAt) continue
      const status = normalizedEmployeeStatus(r.employment_status, r.resign_date)
      if (status === 'resigned') continue
      byId.set(id, { store: String(r.store || '').trim(), role })
    }

    let saved = 0
    for (const a of assignments) {
      const employeeId = Math.floor(Number(a.employeeId || 0))
      if (!employeeId) {
        return NextResponse.json(
          { success: false, message: '직원 ID가 올바르지 않습니다.' },
          { status: 400, headers }
        )
      }
      if (!rosterIds.has(employeeId)) {
        return NextResponse.json(
          { success: false, message: `목록에 없거나 퇴사한 직원(ID ${employeeId})은 지정할 수 없습니다.` },
          { status: 400, headers }
        )
      }
      const meta = byId.get(employeeId)
      if (!meta) {
        return NextResponse.json(
          { success: false, message: `가맹점주가 아닌 직원(ID ${employeeId})은 지정할 수 없습니다.` },
          { status: 400, headers }
        )
      }
      const extras = normalizeFranchiseeExtraStores(meta.store, a.extraStores, settings.maxStores)
      try {
        await supabaseUpdateByFilter('employees', `id=eq.${employeeId}`, { extra_stores: extras })
        saved++
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (/extra_stores|42703|column/i.test(em)) {
          return NextResponse.json(
            {
              success: false,
              message: 'employees.extra_stores 컬럼이 없습니다. sql/employees_extra_stores.sql 을 실행하세요.',
            },
            { status: 500, headers }
          )
        }
        throw e
      }
    }

    if (saved === 0) {
      return NextResponse.json(
        { success: false, message: '저장된 직원이 없습니다.' },
        { status: 400, headers }
      )
    }

    const refreshed = await loadFranchiseeEmployeeRows()
    return NextResponse.json({ success: true, saved, roster: buildRoster(refreshed) }, { headers })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: String(e instanceof Error ? e.message : e) },
      { status: 500, headers }
    )
  }
}
