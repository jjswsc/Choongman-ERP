import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  buildInboundVendorOrFilter,
  INBOUND_BATCH_VENDOR_LIMIT,
  loadInboundLinkedAmountByBatchId,
  resolveInboundVendorMatchValues,
  sortInboundBatchesForLink,
  type InboundBatchLinkRow,
} from '@/lib/inbound-batches-for-link-server'

function isOfficeStore(s: string): boolean {
  const x = String(s || '').trim()
  const xl = x.toLowerCase()
  return (
    x === '본사' ||
    x === 'Office' ||
    x === '오피스' ||
    x === '본점' ||
    xl === 'hq' ||
    xl.includes('office')
  )
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

    const matchValues = await resolveInboundVendorMatchValues(vendorCode, vendorName)
    const vendorFilter = buildInboundVendorOrFilter(matchValues)
    if (!vendorFilter) {
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

    const rows = (await supabaseSelectFilter('inbound_batches', `id=gt.0${vendorFilter}${locationFilter}`, {
      order: 'batch_date.desc',
      limit: INBOUND_BATCH_VENDOR_LIMIT,
      select: 'id,batch_date,vendor_name,vendor_code,total_amount,location',
    })) as InboundBatchLinkRow[]

    const batchIds = (rows || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
    const linkedByBatchId = await loadInboundLinkedAmountByBatchId(batchIds)
    const sorted = sortInboundBatchesForLink(rows || [], linkedByBatchId)

    return NextResponse.json(
      sorted.map((r) => ({
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
