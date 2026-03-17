import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelectFilter } from '@/lib/supabase-server'

function decodePayeeCode(raw: string | undefined): { payeeCode: string; withdrawalCategory: string } {
  const src = String(raw || '').trim()
  const marker = '::wm::'
  const idx = src.lastIndexOf(marker)
  if (idx < 0) return { payeeCode: src, withdrawalCategory: 'expense' }
  const payeeCode = src.slice(0, idx).trim()
  const withdrawalCategory = src.slice(idx + marker.length).trim().toLowerCase() || 'expense'
  return { payeeCode, withdrawalCategory }
}

function isPurchaseCategory(cat: string): boolean {
  const c = String(cat || '').toLowerCase()
  return c === 'purchase_payment' || c === 'purchase_advance'
}

/** 해당 매입처의 매입 지급예정(purchase accruals) 전부 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    const userRole = String(body.userRole || body.user_role || '').toLowerCase()
    const isOffice = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    if (!isOffice) {
      return NextResponse.json({ success: false, message: '본사 권한만 삭제할 수 있습니다.' }, { status: 403, headers })
    }
    if (!vendorCode) {
      return NextResponse.json({ success: false, message: '매입처 코드가 필요합니다.' }, { status: 400, headers })
    }

    const accrualRows = (await supabaseSelectFilter('expense_accruals', 'id=gt.0', {
      select: 'id,payee_code,status',
      limit: 5000,
    })) as { id?: number; payee_code?: string; status?: string }[] | null

    const toDelete: number[] = []
    for (const r of accrualRows || []) {
      const decoded = decodePayeeCode(r.payee_code)
      if (decoded.payeeCode !== vendorCode) continue
      if (!isPurchaseCategory(decoded.withdrawalCategory)) continue
      const status = String(r.status || '').toLowerCase()
      // planned(요청), approved(승인·미지급) 삭제 허용. paid(일부/전부 지급)는 지출 검색에서 삭제
      if (status !== 'planned' && status !== 'approved') continue
      if (r.id) toDelete.push(r.id)
    }

    for (const id of toDelete) {
      await supabaseDeleteByFilter('payable_transactions', `expense_accrual_id=eq.${id}`)
      await supabaseDeleteByFilter('expense_accruals', `id=eq.${id}`)
    }

    const msg = toDelete.length > 0
      ? `${toDelete.length}건 삭제되었습니다.`
      : '삭제할 항목이 없습니다. (이미 지급 완료된 건은 지출 검색에서 삭제해 주세요.)'
    return NextResponse.json(
      { success: true, message: msg, deletedCount: toDelete.length },
      { headers }
    )
  } catch (e) {
    console.error('deletePurchaseAccrualsByVendor:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
