import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { escapeIlikePattern } from '@/lib/postgrest-ilike'
import { ORDERS_COMBINED_PENDING_COLS, STOCK_LOG_OUTBOUND_HISTORY_COLS } from '@/lib/postgrest-narrow-select'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'
import {
  type OrderCartLine,
  formatDateBangkok,
  formatDateHourMinBangkok,
  findReceivedCartLineIndex,
  findLineRemarksInOrderCart,
  getLineRemarksFromCartLine,
  frozenInvoiceUnitPriceFromLog,
  unitPriceFromOutboundLogSnapshot,
} from '@/lib/outbound-order-line-match'
import { isInternalForceOutboundTarget } from '@/lib/internal-outbound'
import {
  buildHqWarehouseOutboundStockLogsFilter,
  isOutboundLogDateInBangkokYmdRange,
} from '@/lib/hq-outbound-income-total'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  ensureErpStoreMatchIndex,
  storeMatchesIncomeFilterWithIndex,
} from '@/lib/accounting-store-match'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { postgrestQuotedInList } from '@/lib/office-store-canonical'
import {
  applyOutboundBillPlacedStatus,
  unmatchedOutboundBillLookupIds,
} from '@/lib/outbound-invoice-print-status'

export const dynamic = 'force-dynamic'

export interface OutboundHistoryItem {
  date: string
  target: string
  type: 'Force' | 'Outbound'
  name: string
  code: string
  spec: string
  qty: number
  amount: number
  orderRowId?: string
  deliveryStatus?: string
  deliveryDate?: string
  orderDate?: string
  invoiceNo?: string
  /** @deprecated use receiveImageUrls[0] - 첫 번째 수령 사진 (썸네일용) */
  receiveImageUrl?: string
  /** 수령 사진 URL 배열 (다중 지원) */
  receiveImageUrls?: string[]
  receivedIndices?: number[]
  totalOrderItems?: number
  /** 원본 주문 수량 (수령 시 조정된 경우 표시용) - 하위 호환 */
  originalOrderQty?: number
  /** 수량 변경 이력 [원본, 승인후?, 수령후] - 3단계 표기용 */
  qtyStages?: number[]
  /** 품목별 출고지(창고) - items.outbound_location */
  outboundLocation?: string
  /** 미수령 품목 여부 (부분 배송 시 누락 품목 표시용) */
  isUnreceived?: boolean
  /** stock_logs 행 id — 출고 로그 단가 수정 API용 (실제 출고 로그에서 온 행만) */
  stockLogId?: number
  /** 주문 cart line_remarks — 송장 품목 하단 */
  lineRemarks?: string
  /** 출고 로그 스냅샷 단가 — 응답 전 제거 */
  frozenUnitPrice?: number
  /** 인보이스 인쇄(=วางบิล) 완료 여부 */
  billPlaced?: boolean
  /** 인보이스 인쇄(=วางบิล) 처리 시각 (방콕 문자열) */
  billPlacedAt?: string
  /**
   * 주문 전체 보강으로 조회 기간 밖 stock_log가 포함된 줄.
   * 행 상세·ลูกหนี้ 맞춤용이며 기간 총액/요약에서는 제외한다.
   */
  outsidePeriodRange?: boolean
  /** stock_logs.reference_no — 강제출고 시 입력한 세금계산서/참조번호 */
  referenceNo?: string
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || 'All').trim()
  const typeFilter = String(searchParams.get('typeFilter') || searchParams.get('type') || 'All').trim()
  const itemSearch = String(searchParams.get('itemSearch') || searchParams.get('item') || '').trim()

  if (!startStr || !endStr) {
    return NextResponse.json([], { headers })
  }
  const auth = await getVerifiedAuth(request, { skipSaasGate: true })
  const tenantScope = await resolveInventoryTenantScope({ auth })
  if (isInventoryTenantQueryBlocked(tenantScope)) {
    return NextResponse.json([], { headers })
  }

  try {
    const attachBillPlacedStatus = async (rows: OutboundHistoryItem[]) => {
      const invoiceNos = [...new Set(rows.map((r) => String(r.invoiceNo || '').trim()).filter(Boolean))]
      const statusSelect = { select: 'invoice_no,printed,printed_at', limit: 10000 } as const
      try {
        if (invoiceNos.length > 0) {
          const inList = postgrestQuotedInList(invoiceNos)
          if (inList) {
            const statusRows = (await supabaseSelectFilter(
              'outbound_invoice_print_status',
              `invoice_no=in.(${inList})`,
              { ...statusSelect, limit: Math.min(invoiceNos.length + 20, 10000) }
            )) as { invoice_no?: string; printed?: boolean; printed_at?: string }[]
            applyOutboundBillPlacedStatus(rows, statusRows || [])
          }
        }
        const unmatched = unmatchedOutboundBillLookupIds(rows)
        const suffixIds = [...unmatched.orderIds, ...unmatched.forceStockLogIds]
        const CHUNK = 40
        for (let i = 0; i < suffixIds.length; i += CHUNK) {
          const chunk = suffixIds.slice(i, i + CHUNK)
          const orFilter = chunk.map((id) => `invoice_no.like.*-${id}`).join(',')
          const extra = (await supabaseSelectFilter(
            'outbound_invoice_print_status',
            `or=(${orFilter})`,
            statusSelect
          )) as { invoice_no?: string; printed?: boolean; printed_at?: string }[]
          if (extra?.length) applyOutboundBillPlacedStatus(rows, extra)
        }
      } catch (statusErr) {
        console.error('getCombinedOutboundHistory: print status join failed', statusErr)
      }
      return rows
    }

    const storeMatchIndex = await ensureErpStoreMatchIndex()
    const matchesVendorFilter = (target: string) => {
      if (!vendorFilter || vendorFilter === 'All' || vendorFilter === '전체 매출처') return true
      return storeMatchesIncomeFilterWithIndex(target, vendorFilter, storeMatchIndex)
    }

    const items = (await supabaseSelectFilter(
      'items',
      appendInventoryTenantFilter('', tenantScope),
      { order: 'id.asc', select: 'code,spec,price,outbound_location', limit: 10000 }
    )) as { code?: string; spec?: string; price?: number; outbound_location?: string }[]
    const itemMap: Record<string, { spec: string; price: number; outboundLocation: string }> = {}
    for (const it of items || []) {
      const c = String(it.code || '').trim()
      itemMap[c] = {
        spec: String(it.spec || '').trim() || '-',
        price: Number(it.price) || 0,
        outboundLocation: String(it.outbound_location || '').trim() || '(미지정)',
      }
    }

    // 손익 본사 창고 출고와 동일: 본사 창고 location + 기간 + 매출처(변형 ilike)
    const itemPart = itemSearch
      ? `&or=(item_code.ilike.${encodeURIComponent(`%${escapeIlikePattern(itemSearch)}%`)},item_name.ilike.${encodeURIComponent(`%${escapeIlikePattern(itemSearch)}%`)})`
      : ''
    const outboundBase = `log_type=eq.Outbound&${buildHqWarehouseOutboundStockLogsFilter({
      startStr,
      endStr,
      vendorFilter,
    })}`
    const forceBase = `log_type=eq.ForceOutbound&${buildHqWarehouseOutboundStockLogsFilter({
      startStr,
      endStr,
      vendorFilter,
    })}`

    const [outboundLogs, forceLogs] = await Promise.all([
      supabaseSelectFilterAllPages('stock_logs', appendInventoryTenantFilter(`${outboundBase}${itemPart}`, tenantScope), {
        order: 'log_date.desc',
        select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
        pageSize: 8000,
        maxRows: 100000,
      }),
      supabaseSelectFilterAllPages('stock_logs', appendInventoryTenantFilter(`${forceBase}${itemPart}`, tenantScope), {
        order: 'log_date.desc',
        select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
        pageSize: 8000,
        maxRows: 100000,
      }),
    ])

    const allLogs = [
      ...((outboundLogs || []) as {
        id?: number
        log_type?: string
        log_date?: string
        vendor_target?: string
        item_code?: string
        item_name?: string
        qty?: number
        order_id?: number
        delivery_status?: string
        invoice_unit_price?: number | string | null
        reference_no?: string | null
      }[]),
      ...((forceLogs || []) as {
        id?: number
        log_type?: string
        log_date?: string
        vendor_target?: string
        item_code?: string
        item_name?: string
        qty?: number
        order_id?: number
        delivery_status?: string
        invoice_unit_price?: number | string | null
        reference_no?: string | null
      }[]),
    ]

    // 기간·품목 검색에 걸린 주문이 있으면, 해당 주문의 출고 로그 전체를 보강(ลูกหนี้=주문 전체 합과 맞춤).
    // 예: 7/9 로그만 기간에 있어도 6월 분할 출고 품목이 ▶ 상세·합계에 포함됨.
    const seedOrderIds = [
      ...new Set(
        allLogs
          .filter((r) => String(r.log_type || '') === 'Outbound' && Number(r.order_id) > 0)
          .map((r) => Number(r.order_id))
      ),
    ]
    const seedOrderIdSet = new Set(seedOrderIds)
    if (seedOrderIds.length > 0) {
      const seenLogIds = new Set(
        allLogs.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0)
      )
      const ORDER_ID_CHUNK = 200
      try {
        for (let i = 0; i < seedOrderIds.length; i += ORDER_ID_CHUNK) {
          const chunk = seedOrderIds.slice(i, i + ORDER_ID_CHUNK)
          const orderIn = chunk.join(',')
          const extraOutbound = (await supabaseSelectFilterAllPages(
            'stock_logs',
            appendInventoryTenantFilter(
              `log_type=eq.Outbound&order_id=in.(${orderIn})&is_deleted=is.false`,
              tenantScope
            ),
            {
              order: 'log_date.desc',
              select: STOCK_LOG_OUTBOUND_HISTORY_COLS,
              pageSize: 8000,
              maxRows: 100000,
            }
          )) as typeof allLogs
          for (const row of extraOutbound || []) {
            const sid = Number(row.id)
            if (Number.isFinite(sid) && sid > 0 && seenLogIds.has(sid)) continue
            if (sid > 0) seenLogIds.add(sid)
            allLogs.push(row)
          }
        }
      } catch (backfillErr) {
        // 보강 실패해도 기간 내 로그는 유지 (전체 [] 방지)
        console.warn('getCombinedOutboundHistory: order outbound backfill skipped', backfillErr)
      }
    }

    allLogs.sort((a, b) => new Date(b.log_date || 0).getTime() - new Date(a.log_date || 0).getTime())

    /** 주문 출고(stock_logs) 줄 금액 = cart 단가×수량 (회계 미수금과 일치) */
    const orderCartByOrderId: Record<string, OrderCartLine[]> = {}
    const logOrderIds = new Set<number>()
    for (const row of allLogs || []) {
      if (String(row.log_type || '') === 'Outbound' && row.order_id != null) {
        const oid = Number(row.order_id)
        if (oid > 0) logOrderIds.add(oid)
      }
    }
    if (logOrderIds.size > 0) {
      const idsFilter = `id=in.(${[...logOrderIds].join(',')})`
      const cartRows = (await supabaseSelectFilter('orders', idsFilter, {
        select: 'id,cart_json',
        limit: logOrderIds.size + 50,
      })) as { id?: number; cart_json?: string }[]
      for (const cr of cartRows || []) {
        const oid = cr.id
        if (oid == null) continue
        let cart: OrderCartLine[] = []
        try {
          if (cr.cart_json) cart = JSON.parse(cr.cart_json) || []
        } catch {
          cart = []
        }
        orderCartByOrderId[String(oid)] = cart
      }
    }

    const list: OutboundHistoryItem[] = []

    // 승인된 주문 중 아직 수령 전인 건도 목록에 포함 (주문 직후 인보이스 인쇄 가능)
    const typeFilterOkForOrder =
      !typeFilter || typeFilter === 'All' || typeFilter === 'Order'
    if (typeFilterOkForOrder) {
      const orderDateFilter = `status=eq.Approved&order_date=gte.${startStr}&order_date=lte.${endStr}T23:59:59.999`
      const deliveryDateFilter = `status=eq.Approved&delivery_date=gte.${startStr}&delivery_date=lte.${endStr}`
      const [ordersByOrderDate, ordersByDeliveryDate] = await Promise.all([
        supabaseSelectFilter('orders', orderDateFilter, {
          limit: 5000,
          select: ORDERS_COMBINED_PENDING_COLS,
        }),
        supabaseSelectFilter('orders', deliveryDateFilter, {
          limit: 5000,
          select: ORDERS_COMBINED_PENDING_COLS,
        }),
      ])
      const seenOrderIds = new Set<number>()
      const approvedOrders = [
        ...(ordersByOrderDate || []),
        ...(ordersByDeliveryDate || []),
      ] as {
        id?: number
        store_name?: string
        order_date?: string
        delivery_date?: string
        cart_json?: string
        received_indices?: string | number[] | null
      }[]
      for (const o of approvedOrders) {
        const oid = o.id
        if (!oid || seenOrderIds.has(oid)) continue
        const recIdx = o.received_indices
        const hasReceived =
          recIdx != null &&
          (Array.isArray(recIdx) ? recIdx.length > 0 : (() => {
            try {
              const parsed = typeof recIdx === 'string' ? JSON.parse(recIdx) : recIdx
              return Array.isArray(parsed) && parsed.length > 0
            } catch {
              return false
            }
          })())
        if (hasReceived) continue
        seenOrderIds.add(oid)

        const target = String(o.store_name || '').trim()
        if (!matchesVendorFilter(target)) continue

        let cart: OrderCartLine[] = []
        try {
          if (o.cart_json) cart = JSON.parse(o.cart_json) || []
        } catch {}
        const orderDateStr = (o.order_date || '').slice(0, 10)
        const deliveryDateStr = (o.delivery_date || '').slice(0, 16)
        for (const p of cart) {
          const code = String(p.code || '').trim()
          const name = String(p.name || '').trim()
          if (!code || !name) continue
          const qty = Math.abs(Number(p.qty) || 0)
          if (qty <= 0) continue
          const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
          const price = Number(p.price) ?? info.price
          const amount = price * qty
          const lineRemarks = getLineRemarksFromCartLine(p)
          list.push({
            date: orderDateStr,
            target,
            type: 'Outbound',
            name,
            code,
            spec: String(p.spec || info.spec || '').trim() || '-',
            qty,
            amount,
            orderRowId: String(oid),
            deliveryStatus: '배송중',
            deliveryDate: deliveryDateStr || undefined,
            orderDate: orderDateStr || undefined,
            outboundLocation: info.outboundLocation,
            ...(lineRemarks ? { lineRemarks } : {}),
          })
        }
      }
    }

    for (const row of allLogs || []) {
      const type = String(row.log_type || '')
      if (type !== 'Outbound' && type !== 'ForceOutbound') continue

      const oidNum = Number(row.order_id)
      const inPeriod = isOutboundLogDateInBangkokYmdRange(row.log_date, startStr, endStr)
      const allowOutsideRange =
        !inPeriod &&
        type === 'Outbound' &&
        Number.isFinite(oidNum) &&
        oidNum > 0 &&
        seedOrderIdSet.has(oidNum)
      if (!inPeriod && !allowOutsideRange) continue
      const rowDate = new Date(row.log_date || '')
      if (Number.isNaN(rowDate.getTime())) continue

      const target = String(row.vendor_target || '')
      if (!matchesVendorFilter(target)) continue

      const typeCode = type === 'ForceOutbound' ? 'Force' : 'Outbound'
      const filterOk =
        !typeFilter ||
        typeFilter === 'All' ||
        typeCode === typeFilter ||
        (typeFilter === 'Order' && typeCode === 'Outbound')
      if (!filterOk) continue

      const code = String(row.item_code || '').trim()
      const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
      const orderRowId = typeCode === 'Outbound' && row.order_id ? String(row.order_id) : ''
      const deliveryStatus =
        row.delivery_status && String(row.delivery_status).trim()
          ? String(row.delivery_status).trim()
          : typeCode === 'Outbound'
            ? '배송중'
            : ''
      const dateStr = formatDateBangkok(rowDate)
      const deliveryDateStr = typeCode === 'Force' ? formatDateHourMinBangkok(rowDate) : ''

      const deliveryDateForItem =
        typeCode === 'Force' && row.delivery_status && String(row.delivery_status).match(/^\d{4}-\d{2}-\d{2}/)
          ? String(row.delivery_status).substring(0, 10)
          : typeCode === 'Force'
            ? deliveryDateStr || undefined
            : undefined
      const qtyAbs = Math.abs(Number(row.qty) || 0)
      const cartForPrice =
        orderRowId && orderCartByOrderId[orderRowId]?.length ? orderCartByOrderId[orderRowId] : undefined
      const unitPrice = unitPriceFromOutboundLogSnapshot(
        row,
        cartForPrice,
        code,
        String(row.item_name || '').trim(),
        info.price
      )
      const isInternalUseForce = typeCode === 'Force' && isInternalForceOutboundTarget(target)
      const lineAmount = isInternalUseForce ? 0 : Math.round(unitPrice * qtyAbs * 100) / 100
      const frozen = frozenInvoiceUnitPriceFromLog(row)
      const sid = row.id != null ? Number(row.id) : NaN
      const fromCartLr = findLineRemarksInOrderCart(
        cartForPrice,
        code,
        String(row.item_name || '').trim()
      )
      const refNo = String(row.reference_no || '').trim()
      list.push({
        date: dateStr,
        target,
        type: typeCode,
        name: String(row.item_name || '').trim(),
        code,
        spec: info.spec,
        qty: qtyAbs,
        amount: lineAmount,
        orderRowId: orderRowId || undefined,
        deliveryStatus: deliveryStatus || undefined,
        deliveryDate: deliveryDateForItem || undefined,
        outboundLocation: info.outboundLocation,
        stockLogId: Number.isFinite(sid) && sid > 0 ? sid : undefined,
        frozenUnitPrice: frozen,
        ...(allowOutsideRange ? { outsidePeriodRange: true } : {}),
        ...(fromCartLr ? { lineRemarks: fromCartLr } : {}),
        ...(refNo ? { referenceNo: refNo } : {}),
      })
    }

    list.sort((a, b) => {
      const da = a.orderDate || a.date
      const db = b.orderDate || b.date
      if (da !== db) return db.localeCompare(da)
      const ta = (a.target || '').localeCompare(b.target || '')
      if (ta !== 0) return ta
      return (b.orderRowId || '').localeCompare(a.orderRowId || '')
    })

    // 인보이스 번호
    // - 주문 연동 출고: IV{yyyymmdd}-{orderId} (승인 주문·로그 Outbound, 미수금(주문)과 동일)
    // - 강제출고(주문 없음): orderRowId 없음 → 강제출고 미수금(IVF…)과 맞추기 위해 IVF{yyyymmdd}-{stockLogId}
    for (const r of list) {
      const datePart = (r.date || "").replace(/\D/g, "").slice(0, 8)
      if (r.orderRowId && datePart.length >= 8) {
        r.invoiceNo = `IV${datePart}-${r.orderRowId}`
      } else if (r.type === "Force" && r.stockLogId != null && r.stockLogId > 0 && datePart.length >= 8) {
        r.invoiceNo = `IVF${datePart}-${r.stockLogId}`
      }
    }

    const orderRowIds = list
      .map((r) => r.orderRowId)
      .filter((id): id is string => !!id)
      .filter((id, i, arr) => arr.indexOf(id) === i)

    if (orderRowIds.length > 0) {
      const orderMap: Record<string, {
        store_name?: string
        delivery_status?: string
        delivery_date?: string
        delivery_dates_by_outbound?: Record<string, string>
        order_date?: string
        received_indices?: number[]
        received_qty_json?: Record<string, number>
        original_order_qty_json?: Record<string, number>
        approved_original_qty_json?: Record<string, number>
        cart?: OrderCartLine[]
      }> = {}

      // image_url 제외하여 대용량 수령 사진 전송 방지, 일괄 조회로 N+1 해소
      const idsFilter = `id=in.(${orderRowIds.join(',')})`
      const selectCols = 'id,store_name,delivery_status,delivery_date,delivery_dates_by_outbound,order_date,received_indices,received_qty_json,original_order_qty_json,approved_original_qty_json,cart_json'
      const ordsAll = (await supabaseSelectFilter('orders', idsFilter, {
        select: selectCols,
        limit: orderRowIds.length + 10,
      })) as {
        id?: number
        delivery_status?: string
        delivery_date?: string
        delivery_dates_by_outbound?: string
        order_date?: string
        received_indices?: string | number[]
        received_qty_json?: string
        original_order_qty_json?: string
        approved_original_qty_json?: string
        cart_json?: string
      }[]

      for (const o of ordsAll || []) {
        const oid = String(o.id ?? '')
        if (!oid) continue
        let recIdx: number[] = []
        try {
          if (o.received_indices) {
            recIdx = Array.isArray(o.received_indices)
              ? o.received_indices
              : JSON.parse(String(o.received_indices))
          }
        } catch {}
        let recQtyMap: Record<string, number> = {}
        try {
          if (o.received_qty_json) recQtyMap = JSON.parse(String(o.received_qty_json)) || {}
        } catch {}
        let origQtyMap: Record<string, number> = {}
        try {
          if (o.original_order_qty_json) origQtyMap = JSON.parse(String(o.original_order_qty_json)) || {}
        } catch {}
        let approvedOrigQtyMap: Record<string, number> = {}
        try {
          if (o.approved_original_qty_json) approvedOrigQtyMap = JSON.parse(String(o.approved_original_qty_json)) || {}
        } catch {}
        let cart: OrderCartLine[] = []
        try {
          if (o.cart_json) cart = JSON.parse(o.cart_json) || []
        } catch {}
        let deliveryDatesByOutbound: Record<string, string> | undefined
        try {
          const raw = (o as { delivery_dates_by_outbound?: string }).delivery_dates_by_outbound
          if (raw && typeof raw === 'string') {
            const parsed = JSON.parse(raw) as Record<string, string>
            if (parsed && typeof parsed === 'object') deliveryDatesByOutbound = parsed
          }
        } catch {}
        orderMap[oid] = {
          store_name: (o as { store_name?: string }).store_name,
          delivery_status: o.delivery_status,
          delivery_date: o.delivery_date,
          delivery_dates_by_outbound: deliveryDatesByOutbound,
          order_date: o.order_date,
          received_indices: recIdx,
          received_qty_json: Object.keys(recQtyMap).length > 0 ? recQtyMap : undefined,
          original_order_qty_json: Object.keys(origQtyMap).length > 0 ? origQtyMap : undefined,
          approved_original_qty_json: Object.keys(approvedOrigQtyMap).length > 0 ? approvedOrigQtyMap : undefined,
          cart,
        }
      }

      for (const r of list) {
        const key = r.orderRowId
        if (!key || !orderMap[key]) continue
        const o = orderMap[key]
        if (o.order_date) r.orderDate = o.order_date.slice(0, 10)
        if (o.delivery_status === '배송완료' || o.delivery_status === '일부배송완료' || o.delivery_status === '일부 배송 완료') {
          r.deliveryStatus = o.delivery_status === '일부 배송 완료' ? '일부배송완료' : o.delivery_status
        }
        // receiveImageUrls는 클릭 시 getOrderReceivePhoto에서 별도 로드
        const outboundLoc = r.outboundLocation || '(미지정)'
        const perOutbound = o.delivery_dates_by_outbound?.[outboundLoc]
        if (perOutbound) r.deliveryDate = perOutbound.slice(0, 16)
        else if (o.delivery_date) r.deliveryDate = o.delivery_date.slice(0, 16)
        if (o.received_indices && o.received_indices.length > 0) {
          r.receivedIndices = o.received_indices
          r.totalOrderItems = (o.cart && o.cart.length) ? o.cart.length : o.received_indices.length
        }
      }

      const filteredList: OutboundHistoryItem[] = []
      // 동일 cart 줄에 stock_log가 여러 건(분할·다회 출고)이어도 모두 유지.
      // 예전 usedByOrder continue 는 출고 화면 품목·합계를 줄여 ลูกหนี้(전 로그 합산)와 어긋남.
      for (const r of list) {
        const key = r.orderRowId
        if (!key || !orderMap[key]) {
          filteredList.push(r)
          continue
        }
        const o = orderMap[key]
        if (!o.received_indices || o.received_indices.length === 0) {
          filteredList.push(r)
          continue
        }
        const cart = o.cart || []
        const code = String(r.code || '').trim()
        const name = String(r.name || '').trim()
        const matchIdx = findReceivedCartLineIndex(cart, o.received_indices!, code, name)
        let cartItem: OrderCartLine | undefined
        if (matchIdx >= 0) {
          cartItem = cart[matchIdx]
        }
        const finalQty = r.qty
        if (cartItem) {
          const cartLr = getLineRemarksFromCartLine(cartItem)
          if (cartLr) r.lineRemarks = cartLr
          const origAtReceive = o.original_order_qty_json?.[String(matchIdx)]
          const approvedOrig = o.approved_original_qty_json?.[String(matchIdx)]
          const cartQty = Number(cartItem?.qty ?? 0)
          const qtyStages: number[] = []
          if (approvedOrig != null && approvedOrig !== cartQty) {
            qtyStages.push(approvedOrig)
          }
          const midQty = origAtReceive ?? cartQty
          if (qtyStages.length > 0) {
            if (midQty !== approvedOrig && midQty !== finalQty) qtyStages.push(midQty)
          } else if (origAtReceive != null && origAtReceive !== finalQty) {
            qtyStages.push(origAtReceive)
          }
          if (qtyStages.length > 0 && finalQty !== (qtyStages[qtyStages.length - 1] ?? 0)) {
            qtyStages.push(finalQty)
          }
          if (qtyStages.length >= 2) {
            r.qtyStages = qtyStages
            if (qtyStages.length === 2) r.originalOrderQty = qtyStages[0]
          }
          if (r.frozenUnitPrice != null && Number.isFinite(r.frozenUnitPrice)) {
            r.amount = r.frozenUnitPrice * finalQty
          } else {
            const infoRow = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
            const cartP = Number(cartItem.price)
            const lineUnit = Number.isFinite(cartP) ? cartP : infoRow.price
            r.amount = lineUnit * finalQty
          }
        }
        // cart 매칭 실패 시에도 출고 줄 유지(이전에는 continue 로 빠져 인보이스 합이 크게 어긋날 수 있었음)
        filteredList.push(r)
      }

      // 부분 배송 주문: 미수령 품목도 출고 목록에 추가 (어떤 품목이 누락되었는지 확인 가능하도록)
      const sampleByOrder: Record<string, OutboundHistoryItem> = {}
      for (const r of filteredList) {
        if (r.orderRowId && !sampleByOrder[r.orderRowId]) sampleByOrder[r.orderRowId] = r
      }
      for (const oid of orderRowIds) {
        const o = orderMap[oid]
        if (!o?.received_indices?.length || !o.cart?.length) continue
        const recIdxSet = new Set(o.received_indices)
        const target = String(o.store_name || '').trim()
        if (!target) continue
        const sample = sampleByOrder[oid]
        const baseDate = sample?.date || (o.order_date?.slice(0, 10) ?? '')
        const baseInvoiceNo = sample?.invoiceNo ?? ''
        for (let ci = 0; ci < o.cart.length; ci++) {
          if (recIdxSet.has(ci)) continue
          const c = o.cart[ci]
          if (!c || !c.name) continue
          const code = String(c.code || '').trim()
          const info = itemMap[code] || { spec: '-', price: 0, outboundLocation: '(미지정)' }
          const qty = Number(c.qty || 0)
          const cartUnit = Number(c.price)
          const unitPrice = Number.isFinite(cartUnit) ? cartUnit : info.price
          const amount = unitPrice * qty
          const uLr = getLineRemarksFromCartLine(c)
          filteredList.push({
            date: baseDate,
            target,
            type: 'Outbound',
            name: String(c.name || '').trim(),
            code,
            spec: String(c.spec || info.spec || '').trim() || '-',
            qty,
            amount,
            orderRowId: oid,
            deliveryStatus: '미수령',
            deliveryDate: o.delivery_date?.slice(0, 16),
            orderDate: o.order_date?.slice(0, 10),
            invoiceNo: baseInvoiceNo,
            outboundLocation: info.outboundLocation,
            originalOrderQty: qty,
            isUnreceived: true,
            ...(uLr ? { lineRemarks: uLr } : {}),
          })
        }
      }

      // 직접정산(지두방) 품목: 인보이스 금액에서 제외 (가격 0 처리)
      const codes = [...new Set(filteredList.map((r) => r.code).filter(Boolean))]
      const directMap = codes.length ? await getDirectSettlementMap(codes) : {}
      for (const r of filteredList) {
        if (r.code && directMap[r.code]) r.amount = 0
      }

      for (const r of filteredList) delete r.frozenUnitPrice
      const withBillPlaced = await attachBillPlacedStatus(filteredList)
      return NextResponse.json(withBillPlaced, { headers })
    }

    // 직접정산(지두방) 품목: 인보이스 금액에서 제외 (가격 0 처리)
    const codes = [...new Set(list.map((r) => r.code).filter(Boolean))]
    const directMap = codes.length ? await getDirectSettlementMap(codes) : {}
    for (const r of list) {
      if (r.code && directMap[r.code]) r.amount = 0
    }

    for (const r of list) delete r.frozenUnitPrice
    const withBillPlaced = await attachBillPlacedStatus(list)
    return NextResponse.json(withBillPlaced, { headers })
  } catch (e) {
    if (tenantScope.enforce && isMissingInventoryTenantIdColumnError(e)) {
      markInventoryTenantIdColumnMissing()
    }
    console.error('getCombinedOutboundHistory:', e)
    const message = e instanceof Error ? e.message : String(e || 'getCombinedOutboundHistory failed')
    return NextResponse.json({ error: message }, { status: 500, headers })
  }
}
