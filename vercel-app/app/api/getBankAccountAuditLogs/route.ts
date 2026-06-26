import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { canViewBankAccountAuditLogs } from '@/lib/permissions'

type AuditRow = {
  id?: number
  action_type?: string
  decision?: string
  reason_code?: string | null
  account_id?: number | null
  account_store?: string | null
  account_name?: string | null
  bank_name?: string | null
  actor_name?: string | null
  actor_role?: string | null
  actor_store?: string | null
  actor_employee_id?: number | null
  actor_employee_code?: string | null
  payload?: Record<string, unknown> | null
  created_at?: string
}

/** 통장 계좌 감사 로그 — 본사·회계만 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const userRole = String(auth.role || '')

  if (!canViewBankAccountAuditLogs(userRole)) {
    return NextResponse.json({ success: false, message: '권한이 없습니다.', list: [] }, { status: 403, headers })
  }

  const { searchParams } = new URL(request.url)
  const storeFilter = String(searchParams.get('store') || searchParams.get('storeFilter') || '').trim()
  const limitRaw = Number(searchParams.get('limit') || 50)
  const limit = Math.min(Math.max(limitRaw, 1), 200)

  try {
    let filter = 'id=gte.0'
    if (storeFilter && storeFilter !== 'All') {
      filter = `account_store=ilike.${encodeURIComponent(storeFilter)}`
    }

    const rows = (await supabaseSelectFilter('bank_account_audit_logs', filter, {
      limit,
      order: 'created_at.desc',
      select:
        'id,action_type,decision,reason_code,account_id,account_store,account_name,bank_name,actor_name,actor_role,actor_store,actor_employee_id,actor_employee_code,payload,created_at',
    })) as AuditRow[] | null

    const list = (rows || []).map((r) => ({
      id: Number(r.id || 0),
      actionType: String(r.action_type || ''),
      decision: String(r.decision || ''),
      reasonCode: r.reason_code ? String(r.reason_code) : null,
      accountId: r.account_id != null ? Number(r.account_id) : null,
      accountStore: String(r.account_store || '').trim(),
      accountName: String(r.account_name || '').trim(),
      bankName: String(r.bank_name || '').trim(),
      actorName: String(r.actor_name || '').trim(),
      actorRole: String(r.actor_role || '').trim(),
      actorStore: String(r.actor_store || '').trim(),
      actorEmployeeId: r.actor_employee_id != null ? Number(r.actor_employee_id) : null,
      actorEmployeeCode: r.actor_employee_code ? String(r.actor_employee_code) : null,
      payload: r.payload || null,
      createdAt: r.created_at ? String(r.created_at) : null,
    }))

    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('getBankAccountAuditLogs:', e)
    return NextResponse.json({ success: true, list: [] }, { headers })
  }
}
