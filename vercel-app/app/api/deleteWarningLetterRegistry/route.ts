import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { canDeleteRegistryRow, canReadRegistry } from '@/lib/warning-letter-registry-permissions'
type RegistryRow = {
  id?: number
  store_name: string
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
    const id = Number(body.id ?? body.registryId)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, message: 'id required' }, { status: 400, headers })
    }

    const rows = (await supabaseSelectFilter(
      'employee_warning_letter_registry',
      `id=eq.${id}`,
      { select: '*', limit: 1 }
    )) as RegistryRow[]
    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, message: '항목을 찾을 수 없습니다.' }, { status: 404, headers })
    }

    if (!canDeleteRegistryRow(auth, row)) {
      return NextResponse.json({ success: false, message: '삭제 권한이 없습니다.' }, { status: 403, headers })
    }

    await supabaseDeleteByFilter('employee_warning_letter_registry', `id=eq.${id}`)
    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    console.error('deleteWarningLetterRegistry:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { status: 500, headers }
    )
  }
}
