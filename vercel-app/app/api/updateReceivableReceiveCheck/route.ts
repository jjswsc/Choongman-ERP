/**
 * 미수금 receivable_transactions (주문·강제출고 등 매출 행) 수금 확인 플래그
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { canUpdateReceivableReceiveCheck } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const id = Number(body.id ?? body.receivableId ?? 0)
    const receiveChecked = Boolean(body.receiveChecked ?? body.receive_checked)
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)

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
    const rt = String(row.ref_type || '')
    if (rt !== 'Order' && rt !== 'ForceOutbound' && rt !== 'AccountingPO') {
      return NextResponse.json(
        { success: false, message: '주문·강제출고·회계발주(미수) 행만 수금 확인을 변경할 수 있습니다.' },
        { headers }
      )
    }

    const storeName = String(row.store_name || '').trim()
    const roleAllowed = canUpdateReceivableReceiveCheck(userRole, userStore, storeName)
    const scopedAllowed =
      userRole.includes('franchisee') && allowedStores.some((s) => storesMatchForGradeLookup(s, storeName))
    if (!roleAllowed && !scopedAllowed) {
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
