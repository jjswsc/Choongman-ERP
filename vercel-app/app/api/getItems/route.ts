import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 관리자 품목 관리 - Supabase items 테이블 전체 조회 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const rows = (await supabaseSelect('items', { order: 'id.asc', limit: 5000 })) as {
      id?: number
      code?: string
      category?: string
      name?: string
      spec?: string
      price?: number
      cost?: number
      image?: string
      vendor?: string
      tax?: string
    }[] | null

    const list = (rows || [])
      .filter((row) => row?.code)
      .map((row) => {
        const tax = String(row.tax || '').trim()
        const taxType = tax === '면세' ? 'exempt' : tax === '영세율' ? 'zero' : 'taxable'
        return {
          code: String(row.code),
          name: String(row.name || ''),
          category: String(row.category || ''),
          vendor: String(row.vendor || ''),
          spec: String(row.spec || ''),
          price: Number(row.price) || 0,
          cost: Number(row.cost) || 0,
          taxType,
          imageUrl: String(row.image || ''),
          hasImage: !!(row.image && String(row.image).trim()),
        }
      })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getItems:', e)
    return NextResponse.json([], { headers })
  }
}
