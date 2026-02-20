/**
 * 결제(매입 대금 지급) / 수령(매출 대금 수령) 수동 입력
 * - type: 'payable' | 'receivable'
 * - vendorCode (payable) | storeName (receivable)
 * - amount: 음수 (지급/수령 시 잔액 감소)
 * - transDate, memo
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const type = String(body.type || '').trim().toLowerCase()
    const vendorCode = String(body.vendorCode || body.vendor_code || '').trim()
    const storeName = String(body.storeName || body.store_name || '').trim()
    const amount = Number(body.amount ?? 0)
    const transDate = String(body.transDate || body.trans_date || '').trim().slice(0, 10)
    const memo = String(body.memo || '').trim()

    if (type !== 'payable' && type !== 'receivable') {
      return NextResponse.json(
        { success: false, message: 'type은 payable 또는 receivable이어야 합니다.' },
        { headers }
      )
    }
    if (!transDate || transDate.length < 10) {
      return NextResponse.json(
        { success: false, message: '거래일을 입력해 주세요.' },
        { headers }
      )
    }
    if (amount === 0) {
      return NextResponse.json(
        { success: false, message: '금액을 입력해 주세요.' },
        { headers }
      )
    }

    if (type === 'payable') {
      if (!vendorCode) {
        return NextResponse.json(
          { success: false, message: '매입처(vendorCode)를 입력해 주세요.' },
          { headers }
        )
      }
      await supabaseInsert('payable_transactions', {
        vendor_code: vendorCode,
        amount: -Math.abs(amount),
        ref_type: 'Payment',
        ref_id: null,
        trans_date: transDate,
        memo: memo || '대금 지급',
      })
      return NextResponse.json({ success: true, message: '지급 내역이 등록되었습니다.' }, { headers })
    }

    if (!storeName) {
      return NextResponse.json(
        { success: false, message: '매출처(storeName)를 입력해 주세요.' },
        { headers }
      )
    }
    await supabaseInsert('receivable_transactions', {
      store_name: storeName,
      amount: -Math.abs(amount),
      ref_type: 'Receive',
      ref_id: null,
      trans_date: transDate,
      memo: memo || '대금 수령',
    })
    return NextResponse.json({ success: true, message: '수령 내역이 등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('addBalanceTransaction:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { headers }
    )
  }
}
