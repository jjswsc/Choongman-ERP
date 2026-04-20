import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  canCreateRegistryForStore,
  canEditRegistryContent,
  canReadRegistry,
} from '@/lib/warning-letter-registry-permissions'

type RegistryRow = {
  id?: number
  store_name: string
  employee_name: string
  incident_date?: string | null
  incident_type?: string
  details?: string
  warning_letter_url?: string | null
  evaluator_name?: string
  approval_status?: string
  created_by?: string | null
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request)
    if (!auth) {
      return NextResponse.json({ success: false, message: '인증이 필요합니다.' }, { status: 401, headers })
    }
    if (!canReadRegistry(auth)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const body = await request.json()
    const idRaw = body.id ?? body.registryId
    const id = idRaw != null && idRaw !== '' ? Number(idRaw) : NaN

    const store_name = String(body.store_name || body.storeName || '').trim()
    const employee_name = String(body.employee_name || body.employeeName || '').trim()
    const incident_date = String(body.incident_date || body.incidentDate || '').trim().slice(0, 10)
    const incident_type = String(body.incident_type || body.incidentType || '').trim().slice(0, 200)
    const details = String(body.details || '').trim().slice(0, 8000)
    const warning_letter_url = String(body.warning_letter_url || body.warningLetterUrl || '').trim().slice(0, 2000)
    const evaluator_name = String(body.evaluator_name || body.evaluatorName || auth.name || '').trim().slice(0, 200)

    if (!store_name || !employee_name) {
      return NextResponse.json({ success: false, message: 'store_name, employee_name required' }, { status: 400, headers })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(incident_date)) {
      return NextResponse.json({ success: false, message: 'incident_date (YYYY-MM-DD) required' }, { status: 400, headers })
    }

    const user = String(auth.name || '').trim()
    const now = new Date().toISOString()

    if (!Number.isFinite(id)) {
      if (!canCreateRegistryForStore(auth, store_name)) {
        return NextResponse.json({ success: false, message: '해당 매장에 등록할 권한이 없습니다.' }, { status: 403, headers })
      }
      const row: Record<string, unknown> = {
        store_name,
        employee_name,
        incident_date,
        incident_type,
        details,
        warning_letter_url: warning_letter_url || null,
        evaluator_name,
        approval_status: 'draft',
        created_by: user || null,
        created_at: now,
        updated_at: now,
      }
      const inserted = (await supabaseInsert('employee_warning_letter_registry', row)) as RegistryRow[]
      const first = Array.isArray(inserted) ? inserted[0] : null
      return NextResponse.json(
        { success: true, id: first?.id ?? null, message: '저장되었습니다.' },
        { headers }
      )
    }

    const existingRows = (await supabaseSelectFilter(
      'employee_warning_letter_registry',
      `id=eq.${id}`,
      { select: '*', limit: 1 }
    )) as RegistryRow[]
    const existing = existingRows?.[0]
    if (!existing) {
      return NextResponse.json({ success: false, message: '항목을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    if (!canEditRegistryContent(auth, existing)) {
      return NextResponse.json({ success: false, message: '수정 권한이 없습니다.' }, { status: 403, headers })
    }

    const patch: Record<string, unknown> = {
      store_name,
      employee_name,
      incident_date,
      incident_type,
      details,
      warning_letter_url: warning_letter_url || null,
      evaluator_name,
      updated_at: now,
    }

    await supabaseUpdate('employee_warning_letter_registry', id, patch)
    return NextResponse.json({ success: true, id, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveWarningLetterRegistry:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { status: 500, headers }
    )
  }
}
