import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseUpdateByFilter,
  supabaseUpsert,
} from '@/lib/supabase-server'

type MenuRow = {
  id?: number
  code?: string
}

type DeliveryPolicyRow = {
  app_code?: string
  menu_id?: number
}

const KNOWN_DELIVERY_APPS = ['grab', 'lineman', 'shopee'] as const

function toInt(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json()
    const storeCode = String(body?.storeCode ?? '').trim()
    const imageUrl = String(body?.imageUrl ?? '').trim()
    const requestedMenuCode = String(body?.menuCode ?? '').trim()
    const requestedMenuId = toInt(body?.menuId)

    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode_required' }, { status: 400, headers })
    }
    if (!imageUrl) {
      return NextResponse.json({ success: false, message: 'imageUrl_required' }, { status: 400, headers })
    }
    if (!requestedMenuCode && requestedMenuId <= 0) {
      return NextResponse.json(
        { success: false, message: 'menuCode_or_menuId_required' },
        { status: 400, headers }
      )
    }

    let resolvedMenuCode = requestedMenuCode
    if (!resolvedMenuCode && requestedMenuId > 0) {
      const one = (await supabaseSelectFilter(
        'pos_menus',
        `id=eq.${requestedMenuId}`,
        { limit: 1, select: 'id,code' }
      )) as MenuRow[] | null
      resolvedMenuCode = String(one?.[0]?.code ?? '').trim()
    }

    const targetMenus = resolvedMenuCode
      ? ((await supabaseSelectFilter(
          'pos_menus',
          `code=eq.${encodeURIComponent(resolvedMenuCode)}`,
          { limit: 5000, select: 'id,code' }
        )) as MenuRow[] | null) || []
      : requestedMenuId > 0
        ? [{ id: requestedMenuId, code: '' }]
        : []

    const targetMenuIds = Array.from(
      new Set(
        targetMenus
          .map((row) => toInt(row.id))
          .filter((id) => id > 0)
      )
    )
    if (targetMenuIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'target_menu_not_found' },
        { status: 404, headers }
      )
    }

    const nowIso = new Date().toISOString()
    for (const menuId of targetMenuIds) {
      await supabaseUpdateByFilter(
        'pos_menus',
        `id=eq.${menuId}`,
        {
          image: imageUrl,
          updated_at: nowIso,
        }
      )
    }

    const deliveryPolicies = ((await supabaseSelectFilter(
      'pos_delivery_menu_policies',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { limit: 10000, select: 'app_code,menu_id' }
    )) as DeliveryPolicyRow[] | null) || []

    const targetIdSet = new Set<number>(targetMenuIds)
    const deliveryImageRows = deliveryPolicies
      .map((row) => {
        const menuId = toInt(row.menu_id)
        const appCodeRaw = String(row.app_code ?? '').trim().toLowerCase()
        const appCode = KNOWN_DELIVERY_APPS.includes(appCodeRaw as (typeof KNOWN_DELIVERY_APPS)[number])
          ? appCodeRaw
          : ''
        if (!appCode || !targetIdSet.has(menuId)) return null
        return {
          store_code: storeCode,
          app_code: appCode,
          menu_id: menuId,
          image_url: imageUrl,
          updated_at: nowIso,
        }
      })
      .filter((row): row is {
        store_code: string
        app_code: string
        menu_id: number
        image_url: string
        updated_at: string
      } => !!row)

    if (deliveryImageRows.length > 0) {
      await supabaseUpsert(
        'pos_delivery_menu_images',
        deliveryImageRows,
        'store_code,app_code,menu_id'
      )
    }

    return NextResponse.json(
      {
        success: true,
        normalizedMenuCode: resolvedMenuCode || null,
        touchedMenuCount: targetMenuIds.length,
        touchedDeliveryImageCount: deliveryImageRows.length,
      },
      { headers }
    )
  } catch (e) {
    console.error('syncPosMenuImageCrossChannels:', e)
    return NextResponse.json(
      { success: false, message: String(e ?? 'unknown_error') },
      { status: 500, headers }
    )
  }
}
