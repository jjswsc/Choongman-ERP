import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireMemberSession } from '@/lib/member-portal-session'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, context: RouteContext) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  if (!member) {
    return NextResponse.json({ success: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { id } = await context.params
  const orderId = Number(id || 0)
  if (!orderId) {
    return NextResponse.json({ success: false, message: 'invalid_order' }, { status: 400 })
  }

  try {
    const rows = (await supabaseSelectFilter('pos_orders', `id=eq.${orderId}`, {
      limit: 1,
      select: 'id,member_id,store_code,items_json,created_by,status,memo',
    })) as Array<{
      id?: number
      member_id?: number | null
      store_code?: string
      items_json?: string | null
      created_by?: string | null
      status?: string
      memo?: string | null
    }>
    const order = rows?.[0]
    if (!order?.id || Number(order.member_id || 0) !== Number(member.id)) {
      return NextResponse.json({ success: false, message: 'order_forbidden' }, { status: 403 })
    }
    if (!String(order.created_by || '').startsWith('member_portal:')) {
      return NextResponse.json({ success: false, message: 'order_forbidden' }, { status: 403 })
    }

    let items: Array<{
      menuId?: string
      optionId?: string
      optionCode?: string
      code?: string | number
      name?: string
      price?: number
      qty?: number
    }> = []
    try {
      const parsed = JSON.parse(String(order.items_json || '[]')) as unknown
      if (Array.isArray(parsed)) {
        items = parsed
          .map((it) => {
            const row = it as Record<string, unknown>
            const menuId = String(row.menuId || row.menu_id || '').trim()
            const name = String(row.name || '').trim()
            const qty = Math.max(1, Math.trunc(Number(row.qty || row.quantity || 1)))
            const price = Math.max(0, Number(row.price || 0))
            if (!menuId && !name) return null
            const optionId = String(row.optionId || row.option_id || '').trim()
            const optionCode = String(row.optionCode || row.option_code || '').trim()
            const code = row.code != null ? String(row.code) : undefined
            return {
              menuId: menuId || name,
              ...(optionId ? { optionId } : {}),
              ...(optionCode ? { optionCode } : {}),
              ...(code ? { code } : {}),
              name,
              price,
              qty,
            }
          })
          .filter(Boolean) as typeof items
      }
    } catch {
      items = []
    }

    return NextResponse.json({
      success: true,
      storeCode: String(order.store_code || ''),
      items,
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'reorder_failed' },
      { status: 500 }
    )
  }
}
