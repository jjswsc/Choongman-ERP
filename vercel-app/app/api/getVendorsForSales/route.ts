import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { sortVendorsByDisplayName } from '@/lib/vendor-sort'

function mapVendorType(v: string): 'purchase' | 'sales' | 'both' {
  const lower = String(v || '').toLowerCase().trim()
  if (lower === 'sales' || lower === '매출' || lower === '매출처') return 'sales'
  if (lower === 'both' || lower === '둘 다') return 'both'
  return 'purchase'
}

/** 매출 수령처용 거래처 목록: type이 sales 또는 both인 거래처 (매장 + 판매처) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const detail = request.nextUrl.searchParams.get('detail') === '1'
    const rows = (await supabaseSelect('vendors', { order: 'id.asc', limit: 5000 })) as {
      code?: string
      name?: string
      type?: string
      gps_name?: string
      sales_outlet?: string
      addr?: string
      tax_id?: string
      phone?: string
      bank_account_no?: string
    }[] | null

    const salesRows = (rows || [])
      .filter((row) => row?.code)
      .filter((row) => {
        const t = mapVendorType(row.type || '')
        return t === 'sales' || t === 'both'
      })

    if (detail) {
      const list = salesRows.map((row) => {
        const salesOutlet = String(row.sales_outlet || '').trim() || null
        const gpsName = String(row.gps_name || '').trim() || null
        const legalName = String(row.name || '').trim()
        return {
          code: String(row.code || '').trim(),
          name: legalName || String(row.code),
          address: String(row.addr || '').trim(),
          taxId: String(row.tax_id || '').trim(),
          phone: String(row.phone || '').trim(),
          bankAccountNo: String(row.bank_account_no || '').trim() || null,
          salesOutlet,
          gpsName,
        }
      })
      return NextResponse.json(sortVendorsByDisplayName(list), { headers })
    }

    const list = salesRows.map((row) => {
      const salesOutlet = String(row.sales_outlet || '').trim()
      const gpsName = String(row.gps_name || '').trim()
      const fullName = String(row.name || '').trim()
      return {
        code: String(row.code || '').trim(),
        name: salesOutlet || gpsName || fullName || String(row.code),
      }
    })

    return NextResponse.json(sortVendorsByDisplayName(list), { headers })
  } catch (e) {
    console.error('getVendorsForSales:', e)
    return NextResponse.json([], { headers })
  }
}
