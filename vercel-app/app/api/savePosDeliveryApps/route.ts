import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

/** POS 배달앱 설정 저장 - 관리자 전용 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const items = Array.isArray(body?.items) ? body.items : []
    const storeCode = String(body?.storeCode ?? '').trim() || null

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'items 필드가 비어있습니다.' },
        { headers }
      )
    }

    for (const item of items) {
      const id = item.id != null ? Number(item.id) : null
      const code = String(item.code ?? '').trim()
      const name = String(item.name ?? '').trim()
      const matchKeywords = Array.isArray(item.matchKeywords)
        ? (item.matchKeywords as unknown[]).filter((k: unknown) => typeof k === 'string').slice(0, 20) as string[]
        : Array.isArray(item.match_keywords)
          ? (item.match_keywords as unknown[]).filter((k: unknown) => typeof k === 'string').slice(0, 20) as string[]
          : []
      const displayOrder = Number(item.displayOrder ?? item.display_order ?? 0) || 0
      const enabled = item.enabled !== false
      const dineOutEnabled = item.dine_out_enabled !== false
      const accentColor = item.accentColor ?? item.accent_color ? String(item.accentColor ?? item.accent_color).trim() || null : null

      if (!code) continue

      const row = {
        code,
        name: name || code,
        match_keywords: matchKeywords,
        display_order: displayOrder,
        enabled,
        dine_out_enabled: dineOutEnabled,
        accent_color: accentColor,
        store_code: storeCode,
        updated_at: new Date().toISOString(),
      }

      if (id && id > 0) {
        const existing = (await supabaseSelectFilter('pos_delivery_apps', `id=eq.${id}`, { limit: 1 })) as { id?: number }[] | null
        if (existing?.length) {
          await supabaseUpdate('pos_delivery_apps', id, row)
        } else {
          await supabaseInsert('pos_delivery_apps', { ...row, store_code: storeCode })
        }
      } else {
        const existing = (await supabaseSelectFilter(
          'pos_delivery_apps',
          `code=eq.${encodeURIComponent(code)}&store_code=${storeCode ? `eq.${encodeURIComponent(storeCode)}` : 'is.null'}`,
          { limit: 1 }
        )) as { id?: number }[] | null
        if (existing?.length) {
          await supabaseUpdateByFilter(
            'pos_delivery_apps',
            `code=eq.${encodeURIComponent(code)}&store_code=${storeCode ? `eq.${encodeURIComponent(storeCode)}` : 'is.null'}`,
            row
          )
        } else {
          await supabaseInsert('pos_delivery_apps', { ...row, store_code: storeCode })
        }
      }
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosDeliveryApps:', e)
    return NextResponse.json(
      { success: false, message: String(e) },
      { headers }
    )
  }
}
