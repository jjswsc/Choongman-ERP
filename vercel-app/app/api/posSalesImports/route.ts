/**
 * pos_sales_imports 목록 조회 (GET) / 삭제 (DELETE)
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseDeleteByFilter,
} from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const yearMonth = searchParams.get('yearMonth')?.trim()

    let rows: { id?: string; file_name?: string; year_month?: string; row_count?: number; total_sales?: number; created_at?: string }[]
    if (yearMonth) {
      rows = (await supabaseSelectFilter(
        'pos_sales_imports',
        `year_month=eq.${encodeURIComponent(yearMonth)}`,
        { order: 'created_at.desc', limit: 50, select: 'id,file_name,year_month,row_count,total_sales,created_at' }
      )) as typeof rows
    } else {
      rows = (await supabaseSelect('pos_sales_imports', {
        order: 'created_at.desc',
        limit: 100,
        select: 'id,file_name,year_month,row_count,total_sales,created_at',
      })) as typeof rows
    }

    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('posSalesImports GET:', e)
    return NextResponse.json([], { headers })
  }
}

export async function DELETE(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')?.trim()
    if (!id) {
      return NextResponse.json({ success: false, message: 'id 필요' }, { headers })
    }
    await supabaseDeleteByFilter('pos_sales_imports', `id=eq.${encodeURIComponent(id)}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('posSalesImports DELETE:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}
