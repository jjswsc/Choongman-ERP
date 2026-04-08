import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseUpdate,
  supabaseInsertMany,
} from '@/lib/supabase-server'
import { upsertReceivableFromOrder } from '@/lib/receivable-payable'
import { sendNoticeToRecipients, getLogisticRecipients } from '@/lib/send-notice-util'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'
import { postStorePurchaseJournal, hasJournalForSource } from '@/lib/accounting-posting'
import { computeOrderHqReceivableTotal } from '@/lib/order-receivable-hq'

const TZ = 'Asia/Bangkok'

function parseReceivedIndices(s: string | undefined): number[] {
  if (!s) return []
  try {
    const a = JSON.parse(s)
    if (!Array.isArray(a)) return []
    return a.map(Number).filter((n) => Number.isFinite(n) && n >= 0)
  } catch {
    return []
  }
}

function parseImageUrlList(raw: string | undefined): string[] {
  if (!raw) return []
  const t = String(raw).trim()
  if (!t) return []
  if (t.startsWith('[')) {
    try {
      const p = JSON.parse(t)
      return Array.isArray(p) ? p.filter((u) => typeof u === 'string' && u.trim().length > 0).map(String) : []
    } catch {
      return []
    }
  }
  return [t]
}

function normalizeDeliveryStatus(ds: string | undefined): string {
  const s = String(ds || '').trim()
  if (s === '일부 배송 완료') return '일부배송완료'
  if (s === '배송 완료') return '배송완료'
  return s
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const body = await request.json()
    const orderId = Number(body.orderRowId ?? body.row ?? body.orderId)
    const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : ''
    const imageUrlsRaw = body.imageUrls
    const imageUrls: string[] = Array.isArray(imageUrlsRaw)
      ? imageUrlsRaw.filter((u: unknown) => typeof u === 'string' && u.trim().length > 0).map((u: string) => String(u).trim())
      : []
    const isPartialReceive = Boolean(body.isPartialReceive)
    const inspectedIndicesRaw: number[] = Array.isArray(body.inspectedIndices) ? body.inspectedIndices : []
    const receivedQtysRaw = body.receivedQtys && typeof body.receivedQtys === 'object' ? body.receivedQtys : null

    if (!orderId || isNaN(orderId)) {
      return NextResponse.json(
        { success: false, message: '❌ 잘못된 주문 번호입니다.' },
        { headers }
      )
    }

    const orders = (await supabaseSelectFilter('orders', 'id=eq.' + orderId, {
      limit: 1,
      select:
        'status,delivery_status,cart_json,store_name,received_indices,received_qty_json,original_order_qty_json,image_url',
    })) as unknown[]
    if (!orders?.length) {
      return NextResponse.json({ success: false, message: '❌ 해당 주문이 없습니다.' }, { headers })
    }

    const o = orders[0] as {
      status?: string
      delivery_status?: string
      cart_json?: string
      store_name?: string
      received_indices?: string
      received_qty_json?: string
      original_order_qty_json?: string
      image_url?: string
    }
    if (o.status !== 'Approved') {
      return NextResponse.json(
        { success: false, message: '❌ 승인된 주문만 수령 처리할 수 있습니다.' },
        { headers }
      )
    }

    const ds = normalizeDeliveryStatus(o.delivery_status)
    if (ds === '배송완료') {
      return NextResponse.json(
        { success: false, message: '❌ 이미 수령 완료된 주문입니다.' },
        { headers }
      )
    }

    let cart: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[] = []
    try {
      cart = JSON.parse((o.cart_json as string) || '[]')
    } catch {}
    if (!cart.length) {
      return NextResponse.json({ success: false, message: '❌ 주문 품목이 없습니다.' }, { headers })
    }

    const store = String(o.store_name || '')
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })

    const getQtyForIdx = (idx: number): number => {
      if (receivedQtysRaw) {
        const v = receivedQtysRaw[String(idx)] ?? receivedQtysRaw[idx]
        if (typeof v === 'number' && v >= 0) return Math.floor(v)
      }
      return Number(cart[idx]?.qty || 0)
    }

    const isContinuation = ds === '일부배송완료'
    const prevReceived = new Set(parseReceivedIndices(o.received_indices))

    let itemsToInbound: { code?: string; name?: string; spec?: string; qty: number; price?: number }[]
    let deliveryStatus: string
    let patch: Record<string, unknown>
    let cartForReceivable: { code?: string; name?: string; spec?: string; qty?: number; price?: number }[]

    if (isContinuation) {
      const newIndices = [...new Set(inspectedIndicesRaw.map(Number).filter((n) => Number.isFinite(n) && n >= 0))].sort(
        (a, b) => a - b
      )
      if (newIndices.length === 0) {
        return NextResponse.json(
          { success: false, message: '❌ 수령할 품목을 최소 1개 이상 선택해 주세요.' },
          { headers }
        )
      }
      for (const idx of newIndices) {
        if (idx >= cart.length || !cart[idx]) {
          return NextResponse.json(
            { success: false, message: '❌ 잘못된 품목 번호가 포함되어 있습니다.' },
            { headers }
          )
        }
        if (prevReceived.has(idx)) {
          return NextResponse.json(
            { success: false, message: '❌ 이미 수령 처리된 품목은 다시 선택할 수 없습니다.' },
            { headers }
          )
        }
      }

      itemsToInbound = newIndices.map((idx) => {
        const item = cart[idx]!
        const qty = getQtyForIdx(idx)
        return { ...item, qty }
      })

      const hasQtyAdjustments = newIndices.some((idx) => {
        const orig = Number(cart[idx]?.qty || 0)
        return getQtyForIdx(idx) !== orig
      })

      const directMapKeys = itemsToInbound.map((it) => String(it.code || '').trim()).filter(Boolean)
      const directMap = directMapKeys.length > 0 ? await getDirectSettlementMap(directMapKeys) : {}

      const inboundRows = itemsToInbound.map((item) => ({
        location: store,
        item_code: item.code,
        item_name: item.name || '',
        spec: item.spec || '-',
        qty: Number(item.qty) || 0,
        log_date: today,
        vendor_target: 'From HQ',
        log_type: 'Inbound',
      }))

      const hqOutboundRows = itemsToInbound
        .filter((item) => !directMap[String(item.code || '').trim()])
        .map((item) => {
          const p = Number(item.price)
          return {
            location: '본사',
            item_code: item.code,
            item_name: item.name || '',
            spec: item.spec || '-',
            qty: -(Number(item.qty) || 0),
            log_date: today,
            vendor_target: store,
            log_type: 'Outbound',
            order_id: orderId,
            invoice_unit_price: Number.isFinite(p) && p >= 0 ? p : null,
          }
        })

      if (inboundRows.length) await supabaseInsertMany('stock_logs', inboundRows)
      if (hqOutboundRows.length) await supabaseInsertMany('stock_logs', hqOutboundRows)

      const mergedReceived = [...new Set([...prevReceived, ...newIndices])].sort((a, b) => a - b)
      deliveryStatus = mergedReceived.length >= cart.length ? '배송완료' : '일부배송완료'

      patch = { delivery_status: deliveryStatus, received_indices: JSON.stringify(mergedReceived) }

      const existingImages = parseImageUrlList(o.image_url)
      const mergedImages = [...existingImages, ...imageUrls]
      if (mergedImages.length > 0) {
        patch.image_url = JSON.stringify(mergedImages)
      } else if (imageUrl) {
        patch.image_url = imageUrl
      }

      let newCart: { code?: string; name?: string; price?: number; qty: number; spec?: string }[] = []
      if (hasQtyAdjustments && receivedQtysRaw) {
        let prevQtyMap: Record<string, number> = {}
        try {
          prevQtyMap = JSON.parse(o.received_qty_json || '{}') || {}
        } catch {}
        newIndices.forEach((idx) => {
          prevQtyMap[String(idx)] = getQtyForIdx(idx)
        })
        patch.received_qty_json = JSON.stringify(prevQtyMap)

        let prevOrigMap: Record<string, number> = {}
        try {
          prevOrigMap = JSON.parse(o.original_order_qty_json || '{}') || {}
        } catch {}
        newIndices.forEach((idx) => {
          const orig = Number(cart[idx]?.qty || 0)
          const received = getQtyForIdx(idx)
          if (received !== orig) prevOrigMap[String(idx)] = orig
        })
        if (Object.keys(prevOrigMap).length > 0) {
          patch.original_order_qty_json = JSON.stringify(prevOrigMap)
        }

        newCart = cart.map((item, idx) => ({
          ...item,
          qty: newIndices.includes(idx) ? getQtyForIdx(idx) : Number(item.qty || 0),
        }))
        let subtotal = 0
        newCart.forEach((it) => {
          subtotal += Number(it.price || 0) * Number(it.qty || 0)
        })
        const vat = Math.round(subtotal * 0.07)
        const total = subtotal + vat
        patch.cart_json = JSON.stringify(newCart.map(({ code, name, price, qty, spec }) => ({ code, name, price, qty, spec })))
        patch.subtotal = subtotal
        patch.vat = vat
        patch.total = total
        cartForReceivable = newCart
      } else {
        cartForReceivable = cart
      }
    } else {
      if (isPartialReceive && inspectedIndicesRaw.length === 0) {
        return NextResponse.json(
          { success: false, message: '❌ 수령할 품목을 최소 1개 이상 선택해 주세요.' },
          { headers }
        )
      }

      deliveryStatus = isPartialReceive ? '일부배송완료' : '배송완료'

      itemsToInbound =
        isPartialReceive && inspectedIndicesRaw.length > 0
          ? inspectedIndicesRaw
              .map((idx) => {
                const item = cart[idx]
                if (!item) return null
                const qty = getQtyForIdx(idx)
                return { ...item, qty }
              })
              .filter(Boolean) as { code?: string; name?: string; spec?: string; qty: number }[]
          : cart.map((item, idx) => ({ ...item, qty: getQtyForIdx(idx) }))

      const hasQtyAdjustments = cart.some((c, i) => {
        const orig = Number(c.qty || 0)
        const received = getQtyForIdx(i)
        return received !== orig
      })

      const itemCodes = itemsToInbound.map((it) => String(it.code || '').trim()).filter(Boolean)
      const directMap = itemCodes.length > 0 ? await getDirectSettlementMap(itemCodes) : {}

      const inboundRows = itemsToInbound.map((item) => ({
        location: store,
        item_code: item.code,
        item_name: item.name || '',
        spec: item.spec || '-',
        qty: Number(item.qty) || 0,
        log_date: today,
        vendor_target: 'From HQ',
        log_type: 'Inbound',
      }))

      const hqOutboundRows = itemsToInbound
        .filter((item) => !directMap[String(item.code || '').trim()])
        .map((item) => {
          const p = Number((item as { price?: number }).price)
          return {
            location: '본사',
            item_code: item.code,
            item_name: item.name || '',
            spec: item.spec || '-',
            qty: -(Number(item.qty) || 0),
            log_date: today,
            vendor_target: store,
            log_type: 'Outbound',
            order_id: orderId,
            invoice_unit_price: Number.isFinite(p) && p >= 0 ? p : null,
          }
        })

      if (inboundRows.length) await supabaseInsertMany('stock_logs', inboundRows)
      if (hqOutboundRows.length) await supabaseInsertMany('stock_logs', hqOutboundRows)

      patch = { delivery_status: deliveryStatus }
      if (isPartialReceive && inspectedIndicesRaw.length > 0) {
        patch.received_indices = JSON.stringify(
          [...new Set(inspectedIndicesRaw.map(Number))].sort((a, b) => a - b)
        )
      } else if (!isPartialReceive) {
        patch.received_indices = JSON.stringify(cart.map((_, i) => i))
      }
      if (imageUrls.length > 0) {
        patch.image_url = JSON.stringify(imageUrls)
      } else if (imageUrl) {
        patch.image_url = imageUrl
      }

      let newCart: { code?: string; name?: string; price?: number; qty: number; spec?: string }[] = []
      if (hasQtyAdjustments && receivedQtysRaw) {
        const qtyMap: Record<string, number> = {}
        const originalQtyMap: Record<string, number> = {}
        const indices =
          isPartialReceive && inspectedIndicesRaw.length > 0 ? inspectedIndicesRaw : cart.map((_, i) => i)
        indices.forEach((idx) => {
          const orig = Number(cart[idx]?.qty || 0)
          const received = getQtyForIdx(idx)
          qtyMap[String(idx)] = received
          if (orig !== received) originalQtyMap[String(idx)] = orig
        })
        patch.received_qty_json = JSON.stringify(qtyMap)
        if (Object.keys(originalQtyMap).length > 0) {
          patch.original_order_qty_json = JSON.stringify(originalQtyMap)
        }
        newCart = cart.map((item, idx) => ({
          ...item,
          qty: getQtyForIdx(idx),
        }))
        let subtotal = 0
        newCart.forEach((it) => {
          subtotal += Number(it.price || 0) * Number(it.qty || 0)
        })
        const vat = Math.round(subtotal * 0.07)
        const total = subtotal + vat
        patch.cart_json = JSON.stringify(newCart.map(({ code, name, price, qty, spec }) => ({ code, name, price, qty, spec })))
        patch.subtotal = subtotal
        patch.vat = vat
        patch.total = total
      }
      cartForReceivable =
        newCart.length > 0 ? newCart : cart.map((item, idx) => ({ ...item, qty: getQtyForIdx(idx) }))
    }

    await supabaseUpdate('orders', orderId, patch)

    try {
      const logisticRecipients = await getLogisticRecipients()
      if (logisticRecipients.length > 0) {
        await sendNoticeToRecipients({
          title: `매장 수령 완료: ${store}`,
          content: `${store}에서 주문 수령(받기)을 완료했습니다.`,
          recipients: logisticRecipients,
          sender: '시스템',
        })
      }
    } catch (noticeErr) {
      console.error('processOrderReceive notice:', noticeErr)
    }

    const storeName = String(o.store_name || '').trim()
    const transDate = today
    if (storeName) {
      const { totalHQ } = await computeOrderHqReceivableTotal(cartForReceivable)
      await upsertReceivableFromOrder({ orderId, storeName, total: totalHQ, transDate })
      if (totalHQ > 0) {
        const alreadyPosted = await hasJournalForSource('store_purchase', orderId)
        if (!alreadyPosted) {
          try {
            await postStorePurchaseJournal({
              orderId,
              transDate,
              amount: totalHQ,
              storeName,
              memo: '주문 수령(본사정산분) 자동분개',
            })
          } catch (postingErr) {
            console.error('processOrderReceive posting:', postingErr)
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: '완료되었습니다.' }, { headers })
  } catch (e) {
    console.error('processOrderReceive:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
