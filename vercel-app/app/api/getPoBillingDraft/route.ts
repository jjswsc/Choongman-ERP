/**
 * 매장·기간 POS 매출 + po_billing_settings 로 청구 라인 초안 (발주 카트에 넣기용)
 * 매출 관리(posSales*)와 동일: POS 영업일 라벨·완료 건·total 합산.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { fetchPosSalesOrdersForBusinessRange } from '@/lib/pos-sales-fetch-rows'
import {
  aggregatePoBillingSales,
  buildPoBillingDraftLines,
  PO_BILLING_ORDER_ROW_SELECT,
  type PoBillingDraftMode,
  type PoBillingOrderRow,
  type PoBillingSettingRow,
} from '@/lib/po-billing'

function parseDraftMode(raw: string | null): PoBillingDraftMode {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'royalty' || s === 'delivery_gp' || s === 'grab_gp' || s === 'all') return s
  return 'all'
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(request.url)
    const store = String(searchParams.get('store') || '').trim()
    const startStr = String(searchParams.get('startStr') || '').trim()
    const endStr = String(searchParams.get('endStr') || '').trim()
    const royaltyLabel = String(searchParams.get('labelRoyalty') || '').trim()
    const deliveryLabel = String(searchParams.get('labelDelivery') || '').trim()
    const grabLabel = String(searchParams.get('labelGrab') || '').trim()
    const mode = parseDraftMode(searchParams.get('mode'))

    if (!store || !startStr || !endStr) {
      return NextResponse.json(
        { success: false, message: 'store, startStr, endStr 필요' },
        { status: 400, headers }
      )
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: [store],
      select: PO_BILLING_ORDER_ROW_SELECT,
      queryLabel: 'getPoBillingDraft',
    })
    const orderRows = rows as PoBillingOrderRow[]

    if (truncated) headers.set('X-Sales-Truncated', '1')

    const snap = aggregatePoBillingSales(orderRows)

    const settingRows = (await supabaseSelectFilter(
      'po_billing_settings',
      `store_name=ilike.${encodeURIComponent(store)}`,
      { limit: 5 }
    )) as Record<string, unknown>[]

    const pick =
      (settingRows || []).find((r) => String(r.store_name || '').trim().toLowerCase() === store.toLowerCase()) ??
      settingRows?.[0]

    const settings: PoBillingSettingRow = {
      store_name: store,
      royalty_pct: Number(pick?.royalty_pct) || 0,
      delivery_gp_pct: Number(pick?.delivery_gp_pct) || 0,
      grab_gp_pct: Number(pick?.grab_gp_pct) || 0,
      label_royalty: pick?.label_royalty != null ? String(pick.label_royalty) : null,
      label_delivery_gp: pick?.label_delivery_gp != null ? String(pick.label_delivery_gp) : null,
      label_grab_gp: pick?.label_grab_gp != null ? String(pick.label_grab_gp) : null,
    }

    const periodLabel = `${startStr} ~ ${endStr}`
    const lines = buildPoBillingDraftLines(
      settings,
      snap,
      periodLabel,
      {
        royalty: royaltyLabel || 'Royalty',
        deliveryGp: deliveryLabel || 'Delivery GP',
        grabGp: grabLabel || 'Grab GP',
      },
      mode
    )

    return NextResponse.json(
      {
        success: true,
        snapshot: snap,
        settings: {
          royalty_pct: settings.royalty_pct,
          delivery_gp_pct: settings.delivery_gp_pct,
          grab_gp_pct: settings.grab_gp_pct,
        },
        lines,
        truncated,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPoBillingDraft:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '실패', lines: [] },
      { status: 500, headers }
    )
  }
}
