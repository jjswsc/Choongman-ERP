/**
 * 미수금 receivable_transactions (주문 행) 수금 확인 플래그
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { canUpdateReceivableReceiveCheck } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const id = Number(body.id ?? body.receivableId ?? 0)
    const receiveChecked = Boolean(body.receiveChecked ?? body.receive_checked)
    const userStore = String(body.userStore || body.user_store || '').trim()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()

    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: '유효한 id가 필요합니다.' }, { headers })
    }

    const rows = (await supabaseSelectFilter(`receivable_transactions`, `id=eq.${id}`, {
      limit: 1,
    })) as { id?: number; store_name?: string; ref_type?: string }[] | null
    const row = rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ success: false, message: '해당 미수금 내역을 찾을 수 없습니다.' }, { headers })
    }
    if (String(row.ref_type || '') !== 'Order') {
      return NextResponse.json(
        { success: false, message: '주문(미수) 행만 수금 확인을 변경할 수 있습니다.' },
        { headers }
      )
    }

    const storeName = String(row.store_name || '').trim()
    if (!canUpdateReceivableReceiveCheck(userRole, userStore, storeName)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { headers })
    }

    await supabaseUpdate('receivable_transactions', id, { receive_checked: receiveChecked })
    return NextResponse.json({ success: true, id, receiveChecked }, { headers })
  } catch (e) {
    console.error('updateReceivableReceiveCheck:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
