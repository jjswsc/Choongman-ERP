/**
 * 메뉴별 매출 (수량·금액). pos 필터 지원.
 * menu_sale_price = 단가×수량, 모든 행 합산
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const importId = searchParams.get('importId')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const search = searchParams.get('search')?.trim().toLowerCase()

    if (!importId) {
      return NextResponse.json({ success: false, message: 'importId 필요' }, { headers })
    }

    let filter = `import_id=eq.${encodeURIComponent(importId)}`
    if (pos) filter += `&pos=eq.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_sales_details', filter, {
      limit: 100000,
      select: 'menu_name,qty,menu_sale_price',
    })) as { menu_name?: string; qty?: number; menu_sale_price?: number }[]

    const byMenu: Record<string, { qty: number; sales: number }> = {}
    for (const r of rows) {
      const name = String(r.menu_name || '').trim() || '(없음)'
      if (search && !name.toLowerCase().includes(search)) continue
      const qty = Math.max(0, Number(r.qty) || 0)
      const sales = Number(r.menu_sale_price) || 0
      if (!byMenu[name]) byMenu[name] = { qty: 0, sales: 0 }
      byMenu[name].qty += qty
      byMenu[name].sales += sales
    }

    const result = Object.entries(byMenu)
      .map(([name, v]) => ({ name, qty: v.qty, sales: v.sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 500)

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByMenu:', e)
    return NextResponse.json([], { headers })
  }
}
