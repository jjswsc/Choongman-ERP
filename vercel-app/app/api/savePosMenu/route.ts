import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { upsertPosMenuFromBody } from '@/lib/pos-menu-upsert-server'
import {
  resolveMenuStoreCodesForGrabSync,
  triggerGrabMenuNotificationPerStoreCodes,
} from '@/lib/grab-menu-sync-trigger'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { writePosMenuAuditTrail } from '@/lib/pos-menu-audit'

function normalizeStoreCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const code = String(v || '').trim()
    if (!code) continue
    if (out.some((x) => x.toLowerCase() === code.toLowerCase())) continue
    out.push(code)
  }
  return out.sort((a, b) => a.localeCompare(b))
}

async function loadMenuAuditSnapshot(menuId: string): Promise<Record<string, unknown> | null> {
  const id = String(menuId || '').trim()
  if (!id) return null
  type AuditMenuRow = {
    id?: number
    code?: string
    name?: string
    category?: string
    category_main?: string
    price?: number
    price_delivery?: number | null
    image?: string
    vat_included?: boolean
    is_active?: boolean
    sort_order?: number
    delivery_app_fee_percent?: number | null
    sell_hall?: boolean | null
    sell_delivery?: boolean | null
    sell_packaging?: boolean | null
  }
  let rows: AuditMenuRow[] | null = null
  try {
    rows = (await supabaseSelectFilter(
      'pos_menus',
      `id=eq.${encodeURIComponent(id)}`,
      {
        limit: 1,
        select:
          'id,code,name,category,category_main,price,price_delivery,image,vat_included,is_active,sort_order,delivery_app_fee_percent,sell_hall,sell_delivery,sell_packaging',
      }
    )) as AuditMenuRow[] | null
  } catch {
    rows = (await supabaseSelectFilter(
      'pos_menus',
      `id=eq.${encodeURIComponent(id)}`,
      {
        limit: 1,
        select: 'id,code,name,category,category_main,price,price_delivery,image,vat_included,is_active,sort_order,delivery_app_fee_percent',
      }
    )) as AuditMenuRow[] | null
  }
  const row = rows?.[0]
  if (!row?.id) return null
  let scopeRows: { store_code?: string | null; enabled?: boolean | null }[] = []
  try {
    scopeRows = (await supabaseSelectFilter(
      'pos_menu_store_scopes',
      `menu_id=eq.${encodeURIComponent(String(row.id))}`,
      { limit: 1000, select: 'store_code,enabled' }
    )) as { store_code?: string | null; enabled?: boolean | null }[] | null || []
  } catch {
    scopeRows = []
  }
  const storeCodes = normalizeStoreCodes(
    scopeRows
      .filter((r) => r.enabled !== false)
      .map((r) => String(r.store_code || '').trim())
      .filter(Boolean)
  )
  return {
    id: row.id,
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    categoryMain: String(row.category_main ?? ''),
    price: Number(row.price ?? 0),
    priceDelivery: row.price_delivery != null ? Number(row.price_delivery) : null,
    imageUrl: String(row.image ?? ''),
    vatIncluded: row.vat_included !== false,
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0),
    deliveryAppFeePercent:
      row.delivery_app_fee_percent != null ? Number(row.delivery_app_fee_percent) : null,
    sellHall: row.sell_hall !== false,
    sellDelivery: row.sell_delivery !== false,
    sellPackaging: row.sell_packaging !== false,
    storeCodes,
  }
}

/** POS 메뉴 저장 (등록/수정) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as Parameters<typeof upsertPosMenuFromBody>[0]
    const isNewMenu = !String(body.id || '').trim()
    const isImageOnly = body.imageOnly === true
    const storeCodes =
      Array.isArray(body.storeCodes)
        ? body.storeCodes.map((x) => String(x || '').trim()).filter(Boolean)
        : []
    if (isNewMenu && !isImageOnly && storeCodes.length === 0) {
      return NextResponse.json(
        { success: false, message: '신규 메뉴는 노출 매장을 1개 이상 선택해야 합니다.' },
        { headers }
      )
    }
    const beforeId = String(body.id || '').trim()
    const beforeSnapshot = beforeId ? await loadMenuAuditSnapshot(beforeId) : null
    const result = await upsertPosMenuFromBody(body, { upsertByCode: false })
    if (result.success) {
      const changed = result.syncHint?.changedFields || []
      const hasMenuImpact =
        changed.length === 0 ||
        changed.includes('insert') ||
        changed.includes('name') ||
        changed.includes('category') ||
        changed.includes('category_main') ||
        changed.includes('price') ||
        changed.includes('price_delivery') ||
        changed.includes('image') ||
        changed.includes('sell_delivery') ||
        changed.includes('description_default') ||
        changed.includes('description_delivery') ||
        changed.includes('description_table')
      if (hasMenuImpact) {
        const reason = result.syncHint?.imageChanged ? 'menu_image_changed' : 'menu_updated'
        const menuIdForSync = String(result.newId || body.id || '').trim()
        void (async () => {
          const storeCodesForGrab = await resolveMenuStoreCodesForGrabSync({
            menuId: menuIdForSync || null,
            bodyStoreCodes: body.storeCodes,
            bodyStoreCode: (body as { storeCode?: string }).storeCode,
          })
          await triggerGrabMenuNotificationPerStoreCodes({
            reason,
            storeCodes: storeCodesForGrab,
            partnerMerchantID: result.syncHint?.partnerMerchantID ?? null,
            syncPromoTargetPriceCampaigns:
              changed.includes('price_delivery') || changed.includes('price'),
          })
        })()
      }
      try {
        const menuId = String(result.newId || body.id || '').trim()
        if (menuId) {
          const afterSnapshot = await loadMenuAuditSnapshot(menuId)
          if (afterSnapshot) {
            const auth = await getVerifiedAuth(req).catch(() => null)
            await writePosMenuAuditTrail({
              menuId: Number(menuId),
              menuCode: String(afterSnapshot.code ?? body.code ?? ''),
              actionType: beforeSnapshot ? 'update' : 'create',
              actor: auth
                ? {
                    name: auth.name || null,
                    role: auth.role || null,
                    store: auth.store || null,
                    employeeCode: auth.employeeCode || null,
                    employeeId: auth.employeeId ?? null,
                  }
                : null,
              source: 'api/savePosMenu',
              reason: Array.isArray(changed) && changed.length > 0 ? changed.join(',') : null,
              before: beforeSnapshot,
              after: afterSnapshot,
              detail: {
                requestIncludesStoreCodes: Array.isArray(body.storeCodes),
                requestStoreCodes: normalizeStoreCodes(body.storeCodes),
                syncChangedFields: changed,
              },
            })
          }
        }
      } catch (auditErr) {
        console.warn('savePosMenu audit skipped:', auditErr)
      }
    }
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('savePosMenu:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
