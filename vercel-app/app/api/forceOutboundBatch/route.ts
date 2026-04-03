import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany, supabaseSelectFilter } from '@/lib/supabase-server'
import { sendNoticeToRecipients, getManagersByStore } from '@/lib/send-notice-util'

/** 강제 출고 - 본사 재고 차감 + 매장 재고 증가 (ForcePush + ForceOutbound) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const list = (Array.isArray(body) ? body : (body?.list || [])) as {
      date?: string
      deliveryDate?: string
      store: string
      code: string
      name?: string
      spec?: string
      qty: number | string
    }[]

    if (!list.length) {
      return NextResponse.json(
        { success: false, message: '출고할 목록이 없습니다.' },
        { headers }
      )
    }

    const uniqCodes = [
      ...new Set(
        list
          .map((d) => String(d.code || '').trim())
          .filter(Boolean)
      ),
    ]
    const priceByCode: Record<string, number> = {}
    if (uniqCodes.length > 0) {
      const codeFilter = `code=in.(${uniqCodes.join(',')})`
      const itemRows = (await supabaseSelectFilter('items', codeFilter, {
        select: 'code,price',
        limit: uniqCodes.length + 20,
      })) as { code?: string; price?: number | null }[]
      for (const ir of itemRows || []) {
        const c = String(ir.code || '').trim()
        if (c) priceByCode[c] = Number(ir.price) || 0
      }
    }

    const rows: Record<string, unknown>[] = []
    for (const d of list) {
      const qty = parseFloat(String(d.qty || 0).replace(/,/g, '')) || 0
      if (qty <= 0) continue
      const store = String(d.store || '').trim()
      const code = String(d.code || '').trim()
      if (!store || !code) continue

      const dateObj = d.date ? new Date(d.date) : new Date()
      const dateIso = dateObj.toISOString()
      const deliveryDate = (d.deliveryDate && String(d.deliveryDate).trim()) || null

      const snapPrice = priceByCode[code]
      const invoiceUnit =
        snapPrice != null && Number.isFinite(snapPrice) && snapPrice >= 0 ? snapPrice : null

      rows.push({
        location: store,
        item_code: code,
        item_name: String(d.name || '').trim(),
        spec: String(d.spec || '').trim() || '-',
        qty,
        log_date: dateIso,
        vendor_target: 'HQ',
        log_type: 'ForcePush',
        delivery_status: deliveryDate,
        invoice_unit_price: invoiceUnit,
      })
      rows.push({
        location: '본사',
        item_code: code,
        item_name: String(d.name || '').trim(),
        spec: String(d.spec || '').trim() || '-',
        qty: -qty,
        log_date: dateIso,
        vendor_target: store,
        log_type: 'ForceOutbound',
        delivery_status: deliveryDate,
        invoice_unit_price: invoiceUnit,
      })
    }

    if (!rows.length) {
      return NextResponse.json(
        { success: false, message: '유효한 출고 항목이 없습니다.' },
        { headers }
      )
    }

    await supabaseInsertMany('stock_logs', rows)
    const count = Math.floor(rows.length / 2)

    // 앱 내 공지: 출고된 각 매장의 매니저에게 알림
    try {
      const storeToCount = new Map<string, number>()
      for (const d of list) {
        const store = String(d.store || '').trim()
        if (!store) continue
        const qty = parseFloat(String(d.qty || 0).replace(/,/g, '')) || 0
        if (qty <= 0) continue
        storeToCount.set(store, (storeToCount.get(store) || 0) + 1)
      }
      const processorName = String(body?.processorName ?? body?.sender ?? '본사').trim()
      for (const [store, itemCount] of storeToCount) {
        const managers = await getManagersByStore(store)
        if (managers.length > 0) {
          await sendNoticeToRecipients({
            title: `${store} 강제 출고 완료`,
            content: `${itemCount}건의 품목이 해당 매장으로 출고되었습니다. 발주 내역에서 확인해 주세요.`,
            recipients: managers,
            sender: processorName || '본사',
          })
        }
      }
    } catch (noticeErr) {
      console.error('forceOutboundBatch notice:', noticeErr)
    }

    return NextResponse.json(
      { success: true, message: `✅ ${count}건의 강제 출고 및 매장 재고 반영이 완료되었습니다.` },
      { headers }
    )
  } catch (e) {
    console.error('forceOutboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '출고 처리 실패' },
      { headers }
    )
  }
}
