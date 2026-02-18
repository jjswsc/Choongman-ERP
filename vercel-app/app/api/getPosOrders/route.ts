import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** POS 주문 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const status = String(searchParams.get('status') || '').trim()

  try {
    let rows: {
      id?: number
      order_no?: string
      store_code?: string
      order_type?: string
      table_name?: string
      memo?: string
      items_json?: string
      subtotal?: number
      vat?: number
      total?: number
      status?: string
      created_at?: string
    }[] = []

    const filters: string[] = []
    if (storeCode && storeCode !== 'All') {
      filters.push(`store_code=ilike.${encodeURIComponent(storeCode)}`)
    }
    if (status && status !== 'all') {
      filters.push(`status=eq.${encodeURIComponent(status)}`)
    }
    const filterStr = filters.length ? filters.join('&') : ''

    if (filterStr) {
      rows = (await supabaseSelectFilter('pos_orders', filterStr, {
        order: 'created_at.desc',
        limit: 500,
        select: 'id,order_no,store_code,order_type,table_name,memo,items_json,subtotal,vat,total,status,created_at',
      })) as typeof rows
    } else {
      rows = (await supabaseSelect('pos_orders', {
        order: 'created_at.desc',
        limit: 500,
        select: 'id,order_no,store_code,order_type,table_name,memo,items_json,subtotal,vat,total,status,created_at',
      })) as typeof rows
    }

    const startD = startStr ? new Date(startStr + 'T00:00:00') : null
    const endD = endStr ? new Date(endStr + 'T23:59:59') : null

    const list = (rows || [])
      .filter((r) => {
        const dt = r.created_at ? String(r.created_at).slice(0, 19) : ''
        if (!dt) return false
        if (startD && new Date(dt) < startD) return false
        if (endD && new Date(dt) > endD) return false
        return true
      })
      .map((r) => ({
        id: r.id,
        orderNo: String(r.order_no ?? ''),
        storeCode: String(r.store_code ?? ''),
        orderType: String(r.order_type ?? 'dine_in'),
        tableName: String(r.table_name ?? ''),
        memo: String(r.memo ?? ''),
        items: (() => {
          try {
            const arr = JSON.parse(r.items_json || '[]')
            return Array.isArray(arr) ? arr : []
          } catch {
            return []
          }
        })(),
        subtotal: Number(r.subtotal) ?? 0,
        vat: Number(r.vat) ?? 0,
        total: Number(r.total) ?? 0,
        status: String(r.status ?? 'pending'),
        createdAt: String(r.created_at ?? ''),
      }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosOrders:', e)
    return NextResponse.json([], { headers })
  }
}
