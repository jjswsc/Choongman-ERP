import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

function mapVendorType(v: string): 'purchase' | 'sales' | 'both' {
  const lower = String(v || '').toLowerCase().trim()
  if (lower === 'sales' || lower === '매출' || lower === '매출처') return 'sales'
  if (lower === 'both' || lower === '둘 다') return 'both'
  return 'purchase'
}

/** 관리자 거래처 관리 - Supabase vendors 테이블 전체 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('vendors', { order: 'id.asc', limit: 5000 })) as {
      id?: number
      code?: string
      name?: string
      type?: string
      manager?: string
      phone?: string
      addr?: string
      tax_id?: string
      memo?: string
      gps_name?: string
    }[] | null

    const list = (rows || [])
      .filter((row) => row?.code)
      .map((row) => {
        const t = mapVendorType(row.type || '')
        const gpsName = String(row.gps_name || '').trim()
        const fullName = String(row.name || '').trim()
        return {
          code: String(row.code),
          name: fullName,
          gps_name: gpsName,
          contact: String(row.manager || ''),
          phone: String(row.phone || ''),
          email: '',
          address: String(row.addr || ''),
          tax_no: String((row as { tax_id?: string }).tax_id || '').trim() || undefined,
          type: t,
          memo: String(row.memo || ''),
        }
      })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getVendors:', e)
    return NextResponse.json([], { headers })
  }
}
