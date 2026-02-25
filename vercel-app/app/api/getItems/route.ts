import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

const ITEMS_SELECT = 'id,code,category,name,spec,unit,price,cost,image,vendor,tax,outbound_location,description,purchase_source'

/** 관리자 품목 관리 - Supabase items 테이블 조회. scope=outbound|order 시 본사 전용만 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const scope = String(searchParams.get('scope') || '').toLowerCase().trim()
  const isHqOnly = scope === 'outbound' || scope === 'order'

  try {
    const rows = isHqOnly
      ? ((await supabaseSelectFilter(
          'items',
          'or=(purchase_source.eq.hq,purchase_source.is.null)',
          { order: 'id.asc', limit: 5000, select: ITEMS_SELECT }
        )) as {
        id?: number
        code?: string
        category?: string
        name?: string
        spec?: string
        unit?: string
        price?: number
        cost?: number
        image?: string
        vendor?: string
        tax?: string
        outbound_location?: string
        description?: string
        purchase_source?: string
      }[] | null)
      : ((await supabaseSelect('items', { order: 'id.asc', limit: 5000, select: ITEMS_SELECT })) as {
      id?: number
      code?: string
      category?: string
      name?: string
      spec?: string
      unit?: string
      price?: number
      cost?: number
      image?: string
      vendor?: string
      tax?: string
      outbound_location?: string
      description?: string
      purchase_source?: string
    }[] | null)

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
          outboundLocation: String(row.outbound_location || ''),
          spec: String(row.spec || ''),
          unit: String(row.unit || ''),
          price: Number(row.price) || 0,
          cost: Number(row.cost) || 0,
          taxType,
          imageUrl: String(row.image || ''),
          hasImage: !!(row.image && String(row.image).trim()),
          description: row.description ? String(row.description).trim() : '',
          purchaseSource: ((row.purchase_source ?? 'hq') === 'store' ? 'store' : 'hq') as 'hq' | 'store',
        }
      })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getItems:', e)
    return NextResponse.json([], { headers })
  }
}
