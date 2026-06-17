import { NextRequest, NextResponse } from 'next/server'
import { PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE } from '@/lib/bank-purchase-payment-via-expense'

/** @deprecated 매입 대금은 지출관리 → 지급예정(executeExpensePayment)으로만 집행 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')
  void request
  return NextResponse.json(
    { success: false, message: PURCHASE_PAYMENT_VIA_EXPENSE_ONLY_MESSAGE },
    { status: 400, headers }
  )
}
