import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import {
  normalizePoMoneyOverride,
  parsePurchaseOrderCart,
  resolvePurchaseOrderMoneyTotals,
  serializePurchaseOrderCart,
  type PoCartLine,
  type PoCartMeta,
} from '@/lib/purchase-order-cart'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import {
  findDraftPurchaseOrderForBillingUpsert,
  normalizeBillingMonthYm,
  parsePoBillingKindFromBody,
} from '@/lib/po-billing-upsert'
import { bangkokDateToUtcRange } from '@/lib/attendance-utils'
import { syncTaxWithholdingLedgerForPurchaseOrder } from '@/lib/tax-ledger-auto-sync'
import { resolvePoIssuerStoreFromAuth } from '@/lib/po-issuer-scope'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const userRole = String(auth.role || '').trim()
    const userStore = String(auth.store || '').trim()
    const allowedStores = Array.from(
      new Set(
        [...(Array.isArray(auth.allowedStores) ? auth.allowedStores : []), userStore]
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      )
    )
    const authIssuerStore = resolvePoIssuerStoreFromAuth({ role: userRole, store: userStore })
    const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)
    if (isScopedRole && allowedStores.length === 0) {
      return NextResponse.json({ success: false, message: '접근 가능한 매장 정보가 없습니다.' }, { status: 403, headers })
    }
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
          issuerStore: body.issuerStore ?? body.issuer_store ?? null,
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
    const userName = String(auth.name || body.userName || '').trim()
    const withholdingTaxAmount = Number(body.withholdingTaxAmount ?? body.withholding_tax_amount ?? 0) || 0
    const withholdingTaxRate = body.withholdingTaxRate ?? body.withholding_tax_rate

    const relatedStore = String(body.relatedStore ?? body.related_store ?? '').trim()
    let issuerStore = String(body.issuerStore ?? body.issuer_store ?? '').trim()

    if (authIssuerStore) {
      issuerStore = authIssuerStore
      if (
        relatedStore &&
        storesMatchForGradeLookup(relatedStore, authIssuerStore)
      ) {
        return NextResponse.json(
          { success: false, message: '청구 대상은 자기 매장과 같을 수 없습니다.' },
          { status: 400, headers }
        )
      }
    } else if (isScopedRole && issuerStore) {
      return NextResponse.json(
        { success: false, message: '매장 발행 권한이 없습니다.' },
        { status: 403, headers }
      )
    } else if (
      issuerStore &&
      relatedStore &&
      storesMatchForGradeLookup(relatedStore, issuerStore)
    ) {
      return NextResponse.json(
        { success: false, message: '청구 대상은 발행 매장과 같을 수 없습니다.' },
        { status: 400, headers }
      )
    }

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
    const hasQuotationKey =
      Object.prototype.hasOwnProperty.call(body, 'quotationFileUrl') ||
      Object.prototype.hasOwnProperty.call(body, 'quotation_file_url')
    const quotationIn = String(body.quotationFileUrl ?? body.quotation_file_url ?? '').trim().slice(0, 2000)
    const quotationNameIn = String(body.quotationFileName ?? body.quotation_file_name ?? '').trim().slice(0, 200)

    const moneyOverrideIn = normalizePoMoneyOverride(
      body.moneyOverride ?? body.money_override ?? null
    )

    const meta: PoCartMeta | undefined =
      relatedStore ||
      issuerStore ||
      storeVendorCode ||
      storeVendorName ||
      poFormatLabel ||
      billingUpsertEligible ||
      orderDateNorm ||
      referenceNoNorm ||
      Boolean(quotationIn) ||
      moneyOverrideIn
        ? {
            issuerStore: issuerStore || undefined,
            relatedStore: relatedStore || undefined,
            storeVendorCode: storeVendorCode || undefined,
            storeVendorName: storeVendorName || undefined,
            poFormatLabel: poFormatLabel || undefined,
            billingMonthYm: billingUpsertEligible ? billingMonthYm : undefined,
            billingKind: billingUpsertEligible ? billingKindParsed! : undefined,
            orderDate: orderDateNorm || undefined,
            referenceNo: referenceNoNorm || undefined,
            ...(quotationIn
              ? { quotationFileUrl: quotationIn, quotationFileName: quotationNameIn || undefined }
              : {}),
            ...(moneyOverrideIn ? { moneyOverride: moneyOverrideIn } : {}),
          }
        : undefined

    if (!vendorCode || !vendorName || cart.length === 0) {
      return NextResponse.json(
        { success: false, message: 'vendorCode, vendorName, cart required' },
        { status: 400, headers }
      )
    }

    if (
      (body.moneyOverride != null || body.money_override != null) &&
      !moneyOverrideIn
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'moneyOverride invalid: subtotal/vat/total must be >= 0 and subtotal+vat ≈ total',
        },
        { status: 400, headers }
      )
    }

    const { subtotal, vat, total } = resolvePurchaseOrderMoneyTotals(
      cart as PoCartLine[],
      moneyOverrideIn
    )

    let cartJson = serializePurchaseOrderCart(cart, meta)

    if (billingUpsertEligible) {
      const existing = await findDraftPurchaseOrderForBillingUpsert({
        vendorCode,
        locationCode,
        relatedStore,
        billingMonthYm,
        billingKind: billingKindParsed!,
        issuerStore: issuerStore || undefined,
      })
      if (existing) {
        const prevMeta = parsePurchaseOrderCart(existing.cart_json).meta
        const merged: PoCartMeta = { ...(meta || {}) }
        if (!hasQuotationKey) {
          if (prevMeta?.quotationFileUrl) {
            merged.quotationFileUrl = prevMeta.quotationFileUrl
            merged.quotationFileName = prevMeta.quotationFileName
          }
        } else if (!quotationIn) {
          delete (merged as Record<string, unknown>).quotationFileUrl
          delete (merged as Record<string, unknown>).quotationFileName
        }
        cartJson = serializePurchaseOrderCart(cart, merged)
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
        await syncTaxWithholdingLedgerForPurchaseOrder(existing.id)
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
    if (id) await syncTaxWithholdingLedgerForPurchaseOrder(id)

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
