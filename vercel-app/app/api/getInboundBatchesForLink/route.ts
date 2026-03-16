import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const OFFICE_STORES = ['입고등록', '본사', 'Office', '오피스', '본점']

function isOfficeStore(s: string): boolean {
  const x = String(s || '').trim()
  return x === '본사' || x === 'Office' || x === '오피스' || x === '본점' || x.toLowerCase().includes('office')
}

/** 통장 출금 입고 연동용 - 거래처별 입고 배치 목록 (vendor_code 또는 vendor_name으로 매칭)
 * vendorCode로 조회 시: vendors 테이블에서 code→name, gps_name 조회 후 입고의 vendor_code/vendor_name과 매칭
 * storeFilter: 선택된 통장 계좌의 매장 - 매장별로 입고 배치가 달라야 함
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const vendorCode = String(searchParams.get('vendorCode') || '').trim()
    const vendorName = String(searchParams.get('vendorName') || '').trim()
    const storeFilter = String(searchParams.get('storeFilter') || '').trim()
    if (!vendorCode && !vendorName) {
      return NextResponse.json([], { headers })
    }

    let locationFilter = ''
    if (storeFilter) {
      if (isOfficeStore(storeFilter)) {
        locationFilter = `&location=in.(입고등록,본사,Office,오피스,본점)`
      } else {
        locationFilter = `&location=ilike.${encodeURIComponent(storeFilter)}`
      }
    }

    const rows = (await supabaseSelectFilter('inbound_batches', `id=gt.0${locationFilter}`, {
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

    let matchValues: string[] = []
    if (vendorCode) {
      matchValues = [vendorCode]
      try {
        const vendorRows = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(vendorCode)}`, {
          select: 'code,name,gps_name',
          limit: 1,
        })) as { code?: string; name?: string; gps_name?: string }[]
        if (vendorRows?.[0]) {
          const v = vendorRows[0]
          const vn = String(v.name || '').trim()
          const gn = String(v.gps_name || '').trim()
          if (vn && !matchValues.includes(vn)) matchValues.push(vn)
          if (gn && !matchValues.includes(gn)) matchValues.push(gn)
        }
      } catch (_) {
        /* vendors 없으면 code만 사용 */
      }
    } else if (vendorName) {
      matchValues = [vendorName]
    }

    const filtered = (rows || []).filter((r) => {
      const vc = String(r.vendor_code || '').trim()
      const vn = String(r.vendor_name || '').trim()
      return matchValues.some((m) => vc === m || vn === m)
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
