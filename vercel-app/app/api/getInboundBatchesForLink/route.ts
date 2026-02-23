import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 통장 출금 입고 연동용 - 거래처별 입고 배치 목록 (vendor_code 또는 vendor_name으로 매칭) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const vendorCode = String(searchParams.get('vendorCode') || '').trim()
    const vendorName = String(searchParams.get('vendorName') || '').trim()
    if (!vendorCode && !vendorName) {
      return NextResponse.json([], { headers })
    }

    const rows = (await supabaseSelectFilter('inbound_batches', 'id=gt.0', {
      order: 'batch_date.desc',
      limit: 100,
      select: 'id,batch_date,vendor_name,vendor_code,total_amount,location',
    })) as {
      id?: number
      batch_date?: string
      vendor_name?: string
      vendor_code?: string
      total_amount?: number
      location?: string
    }[]

    const filtered = (rows || []).filter((r) => {
      const vc = String(r.vendor_code || '').trim()
      const vn = String(r.vendor_name || '').trim()
      if (vendorCode) return vc === vendorCode || vn === vendorCode
      if (vendorName) return vn === vendorName || vc === vendorName
      return false
    })

    return NextResponse.json(
      filtered.map((r) => ({
        id: r.id,
        batchDate: r.batch_date?.slice(0, 10),
        vendorName: r.vendor_name,
        totalAmount: Number(r.total_amount) || 0,
        location: r.location,
      })),
      { headers }
    )
  } catch (e) {
    console.error('getInboundBatchesForLink:', e)
    return NextResponse.json([], { headers })
  }
}
