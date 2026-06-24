/**
 * 미수금 receivable_transactions (주문·강제출고 등 매출 행) 수금 확인 플래그
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { canUpdateReceivableReceiveCheck } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { findConsolidatedBankReceiveBlockingManualCheck } from '@/lib/receivable-manual-receive-guard'

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
    const receiveDate = String(body.receiveDate ?? body.receive_date ?? '').trim().slice(0, 10)
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
      select: 'id,store_name,ref_type,amount,invoice_no,memo,receive_checked',
    })) as {
      id?: number
      store_name?: string
      ref_type?: string
      amount?: number
      invoice_no?: string
      memo?: string
      receive_checked?: boolean
    }[] | null
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

    const linkedFilter = `ref_type=eq.Receive&ref_id=eq.${id}`

    if (receiveChecked) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(receiveDate)) {
        return NextResponse.json(
          { success: false, message: '입금(수령)일을 입력해 주세요.' },
          { headers }
        )
      }
      const amountAbs = Math.abs(Number(row.amount ?? 0))
      if (amountAbs <= 0) {
        return NextResponse.json({ success: false, message: '매출 금액이 없습니다.' }, { headers })
      }
      const bankConsolidated = await findConsolidatedBankReceiveBlockingManualCheck(storeName, receiveDate)
      if (bankConsolidated) {
        return NextResponse.json(
          {
            success: false,
            code: 'RECEIVABLE_BANK_CONSOLIDATED_EXISTS',
            message: `해당 일자(${receiveDate})에 통장 통합 수금이 이미 반영되어 있습니다 (통장 #${bankConsolidated.bankTransactionId}, ฿${bankConsolidated.amountAbs.toLocaleString()}). 인보이스별 수금확인은 중복 수금이 됩니다. 통장 거래에서 「미수 연결」을 사용하거나, 통장 수금만 유지하세요.`,
          },
          { status: 409, headers }
        )
      }
      const label = String(row.invoice_no || row.memo || '').trim()
      const memo = label ? `수금확인 ${label}` : '수금확인'
      const linked = (await supabaseSelectFilter('receivable_transactions', linkedFilter, {
        limit: 1,
        select: 'id,bank_transaction_id',
      })) as { id?: number; bank_transaction_id?: number | null }[] | null
      if (linked?.[0]?.id) {
        await supabaseUpdate('receivable_transactions', linked[0].id, {
          trans_date: receiveDate,
          amount: -amountAbs,
          memo,
        })
      } else {
        await supabaseInsert('receivable_transactions', {
          store_name: storeName,
          amount: -amountAbs,
          ref_type: 'Receive',
          ref_id: id,
          trans_date: receiveDate,
          memo,
          receive_checked: false,
        })
      }
      await supabaseUpdate('receivable_transactions', id, { receive_checked: true })
    } else {
      await supabaseDeleteByFilter('receivable_transactions', linkedFilter)
      await supabaseUpdate('receivable_transactions', id, { receive_checked: false })
    }

    return NextResponse.json({ success: true, id, receiveChecked, receiveDate: receiveChecked ? receiveDate : undefined }, { headers })
  } catch (e) {
    console.error('updateReceivableReceiveCheck:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
