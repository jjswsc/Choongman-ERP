import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'

/** POS 결제 수단 설정 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const cardKeys = Array.isArray(body?.cardKeys) ? body.cardKeys.filter((k: unknown) => typeof k === 'string') : []
    const qrKeys = Array.isArray(body?.qrKeys) ? body.qrKeys.filter((k: unknown) => typeof k === 'string') : []

    if (!storeCode) {
      return NextResponse.json(
        { success: false, message: 'storeCode가 필요합니다.' },
        { headers }
      )
    }

    const existing = (await supabaseSelectFilter('pos_payment_settings', `store_code=eq.${encodeURIComponent(storeCode)}`, { limit: 1 })) as { store_code?: string }[] | null

    const row = {
      store_code: storeCode,
      card_keys: cardKeys.length > 0 ? cardKeys : ['Visa', 'Master', 'Amex', 'JCB', 'Other'],
      qr_keys: qrKeys.length > 0 ? qrKeys : ['TrueMoney', 'WeChat', 'Alipay', 'PromptPay', 'LINE Pay', 'Shopee Pay', 'Other'],
      updated_at: new Date().toISOString(),
    }

    if (existing?.length) {
      await supabaseUpdateByFilter('pos_payment_settings', `store_code=eq.${encodeURIComponent(storeCode)}`, row)
    } else {
      await supabaseInsert('pos_payment_settings', row)
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosPaymentSettings:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
