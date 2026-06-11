import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectPageCap } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import {
  loadEmployeeJobCatalog,
  saveEmployeeJobCatalog,
} from '@/lib/employee-job-catalog-server'
import {
  sanitizeEmployeeJobCatalogForSave,
} from '@/lib/employee-job-catalog'

function canEditCatalog(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

/** GET: 등록 직무 목록 + 직원에만 남아 있는 직무(목록에 없음) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const role = authResult.auth.role || ''

  try {
    const catalog = await loadEmployeeJobCatalog()
    const catalogSet = new Set(catalog)
    let inUseOutside: string[] = []
    try {
      const rows =
        (await supabaseSelect('employees', {
          select: 'job',
          limit: supabaseSelectPageCap(),
          order: 'id.asc',
        })) as { job?: string | null }[] | null
      const seen = new Set<string>()
      for (const r of rows || []) {
        const j = String(r.job || '').trim()
        if (!j || catalogSet.has(j)) continue
        if (!seen.has(j)) seen.add(j)
      }
      inUseOutside = Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    } catch {
      inUseOutside = []
    }

    return NextResponse.json(
      {
        catalog,
        jobsInUseOutsideCatalog: inUseOutside,
        canEdit: canEditCatalog(role),
      },
      { headers }
    )
  } catch (e) {
    console.error('employeeJobCatalog GET:', e)
    return NextResponse.json(
      { catalog: [], jobsInUseOutsideCatalog: [], canEdit: false },
      { status: 500, headers }
    )
  }
}

/** POST: 직무 목록 저장 (본사·회계 — isOfficeRole·회계) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const role = authResult.auth.role || ''
  if (!canEditCatalog(role)) {
    return NextResponse.json({ success: false, message: '본사·회계 권한이 필요합니다.' }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as { jobs?: unknown }
    const parsed = sanitizeEmployeeJobCatalogForSave(body.jobs)
    if (!Array.isArray(parsed)) {
      return NextResponse.json({ success: false, message: parsed.error }, { headers })
    }
    await saveEmployeeJobCatalog(parsed)
    return NextResponse.json({ success: true, message: '✅ 직무 목록이 저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('employeeJobCatalog POST:', e)
    return NextResponse.json(
      { success: false, message: '❌ ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
