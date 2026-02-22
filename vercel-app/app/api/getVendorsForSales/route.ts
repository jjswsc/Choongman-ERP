import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

function mapVendorType(v: string): 'purchase' | 'sales' | 'both' {
  const lower = String(v || '').toLowerCase().trim()
  if (lower === 'sales' || lower === '매출' || lower === '매출처') return 'sales'
  if (lower === 'both' || lower === '둘 다') return 'both'
  return 'purchase'
}

/** 매출 수령처용 거래처 목록: type이 sales 또는 both인 거래처 (매장 + 판매처) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('vendors', { order: 'id.asc', limit: 5000 })) as {
      code?: string
      name?: string
      type?: string
      gps_name?: string
    }[] | null

    const list = (rows || [])
      .filter((row) => row?.code)
      .filter((row) => {
        const t = mapVendorType(row.type || '')
        return t === 'sales' || t === 'both'
      })
      .map((row) => {
        const gpsName = String(row.gps_name || '').trim()
        const fullName = String(row.name || '').trim()
        return {
          name: gpsName || fullName || String(row.code),
        }
      })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getVendorsForSales:', e)
    return NextResponse.json([], { headers })
  }
}
