import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

export interface PosDeliveryApp {
  id: number
  code: string
  name: string
  matchKeywords: string[]
  displayOrder: number
  enabled: boolean
  dineOutEnabled: boolean
  accentColor: string | null
  storeCode: string | null
}

/** POS 배달앱 설정 조회 - 전역(store_code null) + 매장 오버라이드 병합 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const includeDisabled = searchParams.get('includeDisabled') === 'true'

  try {
    const all = await supabaseSelect('pos_delivery_apps', {
      select: 'id,code,name,match_keywords,display_order,enabled,dine_out_enabled,accent_color,store_code',
      order: 'display_order.asc',
      limit: 1000,
    }) as {
      id?: number
      code?: string
      name?: string
      match_keywords?: string[]
      display_order?: number
      enabled?: boolean
      dine_out_enabled?: boolean
      accent_color?: string
      store_code?: string | null
    }[]

    const rows = Array.isArray(all) ? all : []
    const global = rows.filter((r) => r.store_code == null || r.store_code === '')
    const storeOverrides = storeCode ? rows.filter((r) => String(r.store_code || '') === storeCode) : []

    const byCode = new Map<string, typeof rows[0]>()
    for (const r of global) {
      if (r.code && (includeDisabled || r.enabled !== false)) {
        byCode.set(r.code, r)
      }
    }
    for (const r of storeOverrides) {
      if (r.code && (includeDisabled || r.enabled !== false)) {
        byCode.set(r.code, r)
      }
    }

    const list: PosDeliveryApp[] = Array.from(byCode.values())
      .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0))
      .map((r) => ({
        id: Number(r.id) || 0,
        code: String(r.code || ''),
        name: String(r.name || ''),
        matchKeywords: Array.isArray(r.match_keywords) ? r.match_keywords.filter((k) => typeof k === 'string') : [],
        displayOrder: Number(r.display_order) || 0,
        enabled: r.enabled !== false,
        dineOutEnabled: r.dine_out_enabled !== false,
        accentColor: r.accent_color ? String(r.accent_color) : null,
        storeCode: r.store_code ? String(r.store_code) : null,
      }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosDeliveryApps:', e)
    return NextResponse.json([], { headers })
  }
}
