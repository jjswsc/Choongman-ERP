import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import { serializePurchaseOrderCart, type PoCartMeta } from '@/lib/purchase-order-cart'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import {
  findDraftPurchaseOrderForBillingUpsert,
  normalizeBillingMonthYm,
  parsePoBillingKindFromBody,
} from '@/lib/po-billing-upsert'
import { bangkokDateToUtcRange } from '@/lib/attendance-utils'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const idempotencyKey = String(
      request.headers.get('x-idempotency-key') ??
        body.idempotencyKey ??
        body.idempotency_key ??
        body.localOrderNo ??
        ''
    ).trim()
    if (idempotencyKey) {
      const duplicate = await reserveRequestIdempotencyKey({
        scope: 'savePurchaseOrder',
        key: idempotencyKey,
        payload: {
          vendorCode: body.vendorCode ?? null,
          locationCode: body.locationCode ?? null,
          relatedStore: body.relatedStore ?? body.related_store ?? null,
          billingMonthYm: body.billingMonthYm ?? body.billing_month_ym ?? null,
        },
      })
      if (duplicate) {
        return NextResponse.json(
          { success: true, duplicate: true, message: '이미 처리된 요청입니다.' },
          { headers }
        )
      }
    }

    const vendorCode = String(body.vendorCode || '').trim()
    const vendorName = String(body.vendorName || '').trim()
    const locationName = String(body.locationName || '').trim()
    const locationAddress = String(body.locationAddress || '').trim()
    const locationCode = String(body.locationCode || '').trim()
    const cart = Array.isArray(body.cart) ? body.cart : []
    const userName = String(body.userName || '').trim()
    const withholdingTaxAmount = Number(body.withholdingTaxAmount ?? body.withholding_tax_amount ?? 0) || 0
    const withholdingTaxRate = body.withholdingTaxRate ?? body.withholding_tax_rate

    const relatedStore = String(body.relatedStore ?? body.related_store ?? '').trim()
    const storeVendorCode = String(body.storeVendorCode ?? body.store_vendor_code ?? '').trim()
    const storeVendorName = String(body.storeVendorName ?? body.store_vendor_name ?? '').trim()
    const poFormatLabel = String(body.poFormatLabel ?? body.po_format_label ?? '').trim()

    const billingMonthYmRaw = body.billingMonthYm ?? body.billing_month_ym
    const billingKindParsed = parsePoBillingKindFromBody(body.billingKind ?? body.billing_kind)
    const billingMonthYm = normalizeBillingMonthYm(
      billingMonthYmRaw != null ? String(billingMonthYmRaw) : ''
    )

    const billingUpsertEligible =
      Boolean(relatedStore) && billingMonthYm.length === 7 && billingKindParsed != null

    const orderDateRaw = String(body.orderDate ?? body.order_date ?? '').trim().slice(0, 10)
    const orderDateNorm = /^\d{4}-\d{2}-\d{2}$/.test(orderDateRaw) ? orderDateRaw : ''
    const referenceNoNorm = String(body.referenceNo ?? body.reference_no ?? '')
      .trim()
      .slice(0, 200)

    const meta: PoCartMeta | undefined =
      relatedStore ||
      storeVendorCode ||
      storeVendorName ||
      poFormatLabel ||
      billingUpsertEligible ||
      orderDateNorm ||
      referenceNoNorm
        ? {
            relatedStore: relatedStore || undefined,
            storeVendorCode: storeVendorCode || undefined,
            storeVendorName: storeVendorName || undefined,
            poFormatLabel: poFormatLabel || undefined,
            billingMonthYm: billingUpsertEligible ? billingMonthYm : undefined,
            billingKind: billingUpsertEligible ? billingKindParsed! : undefined,
            orderDate: orderDateNorm || undefined,
            referenceNo: referenceNoNorm || undefined,
          }
        : undefined

    if (!vendorCode || !vendorName || cart.length === 0) {
      return NextResponse.json(
        { success: false, message: 'vendorCode, vendorName, cart required' },
        { status: 400, headers }
      )
    }

    let subtotal = 0
    let taxableSubtotal = 0
    for (const c of cart) {
      const price = Number(c.price || c.cost || 0)
      const qty = Number(c.qty || 0)
      const amt = price * qty
      subtotal += amt
      const taxType = (c as { taxType?: string }).taxType
      const isExempt = taxType === 'exempt' || taxType === '면세' || taxType === '영세율' || taxType === 'zero'
      if (!isExempt) taxableSubtotal += amt
    }
    const vat = Math.round(taxableSubtotal * 0.07 * 100) / 100
    const total = Math.round((subtotal + vat) * 100) / 100

    const cartJson = serializePurchaseOrderCart(cart, meta)

    if (billingUpsertEligible) {
      const existing = await findDraftPurchaseOrderForBillingUpsert({
        vendorCode,
        locationCode,
        relatedStore,
        billingMonthYm,
        billingKind: billingKindParsed!,
      })
      if (existing) {
        const patch: Record<string, unknown> = {
          cart_json: cartJson,
          subtotal,
          vat,
          total,
          user_name: userName,
          vendor_name: vendorName,
          location_name: locationName,
          location_address: locationAddress,
        }
        if (withholdingTaxAmount > 0) {
          patch.withholding_tax_amount = withholdingTaxAmount
          if (withholdingTaxRate != null) patch.withholding_tax_rate = Number(withholdingTaxRate) || null
        } else {
          patch.withholding_tax_amount = null
          patch.withholding_tax_rate = null
        }
        if (orderDateNorm) {
          patch.created_at = bangkokDateToUtcRange(orderDateNorm).startISO
        }
        await supabaseUpdate('purchase_orders', existing.id, patch)
        return NextResponse.json(
          {
            success: true,
            id: existing.id,
            poNo: existing.po_no,
            updated: true,
            message: '발주 초안이 최신 내용으로 갱신되었습니다.',
          },
          { headers }
        )
      }
    }

    const poNoDatePart = orderDateNorm.replace(/-/g, '') || new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const poNo = 'PO-' + poNoDatePart + '-' + String(Date.now()).slice(-4)

    const row: Record<string, unknown> = {
      po_no: poNo,
      vendor_code: vendorCode,
      vendor_name: vendorName,
      location_name: locationName,
      location_address: locationAddress,
      location_code: locationCode,
      cart_json: cartJson,
      subtotal,
      vat,
      total,
      user_name: userName,
      status: 'Draft',
    }
    if (orderDateNorm) {
      row.created_at = bangkokDateToUtcRange(orderDateNorm).startISO
    }
    if (withholdingTaxAmount > 0) {
      row.withholding_tax_amount = withholdingTaxAmount
      if (withholdingTaxRate != null) row.withholding_tax_rate = Number(withholdingTaxRate) || null
    }

    const inserted = (await supabaseInsert('purchase_orders', row)) as { id?: number }[]
    const id = Array.isArray(inserted) && inserted[0]?.id != null ? inserted[0].id : null

    return NextResponse.json(
      { success: true, id, poNo, updated: false, message: '발주가 저장되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('savePurchaseOrder:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'Save failed' },
      { status: 500, headers }
    )
  }
}
