import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

const KEYS = ['push_notice_enabled', 'push_order_approval_enabled'] as const

/** GET: 알림 설정 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const orFilter = `or=(${KEYS.map((k) => `key.eq.${k}`).join(',')})`
    const rows = (await supabaseSelectFilter(
      'system_settings',
      orFilter,
      { limit: 10 }
    )) as { key?: string; value_json?: number | boolean }[] | null

    const map: Record<string, boolean> = {
      push_notice_enabled: true,
      push_order_approval_enabled: true,
    }
    for (const r of rows || []) {
      const k = r.key ?? ''
      const v = r.value_json
      map[k] = v === 1 || v === true
    }
    return NextResponse.json(
      {
        pushNoticeEnabled: map.push_notice_enabled !== false,
        pushOrderApprovalEnabled: map.push_order_approval_enabled !== false,
      },
      { headers }
    )
  } catch (e) {
    console.error('getNotificationSettings:', e)
    return NextResponse.json(
      { pushNoticeEnabled: true, pushOrderApprovalEnabled: true },
      { headers }
    )
  }
}

/** POST: 알림 설정 업데이트 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const pushNoticeEnabled = body.pushNoticeEnabled
    const pushOrderApprovalEnabled = body.pushOrderApprovalEnabled

    const rows: Record<string, unknown>[] = []
    if (typeof pushNoticeEnabled === 'boolean') {
      rows.push({
        key: 'push_notice_enabled',
        value_json: pushNoticeEnabled ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
    }
    if (typeof pushOrderApprovalEnabled === 'boolean') {
      rows.push({
        key: 'push_order_approval_enabled',
        value_json: pushOrderApprovalEnabled ? 1 : 0,
        updated_at: new Date().toISOString(),
      })
    }
    if (rows.length > 0) {
      await supabaseUpsert('system_settings', rows, 'key')
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updateNotificationSettings:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
