import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import type { BroadcastTargetPayload } from '@/lib/broadcast-target-selection'
import { estimateNoticeRecipientCount, type NoticeEmpRow } from '@/lib/notice-recipient-estimate'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const body = await request.json()
    const payload: BroadcastTargetPayload = {
      targetStore: String(body?.targetStore ?? body?.target_store ?? '전체').trim(),
      targetRole: String(body?.targetRole ?? body?.target_role ?? '전체').trim(),
      targetPermissionGroup: String(
        body?.targetPermissionGroup ?? body?.target_permission_group ?? ''
      ).trim(),
      targetRecipients: Array.isArray(body?.targetRecipients)
        ? body.targetRecipients.map((r: { store?: string; name?: string }) => ({
            store: String(r?.store ?? '').trim(),
            name: String(r?.name ?? '').trim(),
          }))
        : undefined,
    }

    const rows = (await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,name,job,role,resign_date',
    })) as {
      store?: string
      name?: string
      job?: string
      role?: string
      resign_date?: string
    }[]

    const employees: NoticeEmpRow[] = (rows || []).map((e) => ({
      store: String(e.store || '').trim(),
      name: String(e.name || '').trim(),
      job: String(e.job || '').trim(),
      role: String(e.role || '').trim(),
      resignDate: String(e.resign_date || '').trim(),
    }))

    const count = estimateNoticeRecipientCount(employees, payload)
    return NextResponse.json({ success: true, count }, { headers })
  } catch (e) {
    console.error('estimateNoticeRecipients:', e)
    return NextResponse.json(
      { success: false, message: 'Failed', count: 0 },
      { status: 500, headers }
    )
  }
}
