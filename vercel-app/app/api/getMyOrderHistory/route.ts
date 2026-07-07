import { NextRequest, NextResponse } from 'next/server'
import { fetchMyOrderHistoryList, type OrderHistoryItem } from '@/lib/my-order-history-rpc'
import { parseListPagination, slicePage, DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-params'

export type { OrderHistoryItem }

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const store = String(searchParams.get('store') || '').trim()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const { page, pageSize } = parseListPagination(searchParams, null, 20)

  if (!store || !startStr || !endStr) {
    return NextResponse.json(
      { items: [], total: 0, page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE },
      { headers }
    )
  }

  try {
    const list = await fetchMyOrderHistoryList({ store, startStr, endStr })
    const total = list.length
    const items = slicePage(list, page, pageSize)
    return NextResponse.json({ items, total, page, pageSize }, { headers })
  } catch (e) {
    console.error('getMyOrderHistory:', e)
    return NextResponse.json(
      { items: [], total: 0, page, pageSize },
      { headers }
    )
  }
}
