import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 점검 항목 목록 (activeOnly=true 시 사용중인 것만) */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('activeOnly') === 'true'
  try {
    const rows = activeOnly
      ? await supabaseSelectFilter('checklist_items', 'use_flag=eq.true', { order: 'item_id.asc' })
      : await supabaseSelect('checklist_items', { order: 'item_id.asc' })
    const list = (rows || []).map((r: { item_id?: number; id?: number; main_cat?: string; sub_cat?: string; name?: string; use_flag?: boolean }) => ({
      id: r.item_id != null ? r.item_id : (r as { id?: number }).id,
      main: r.main_cat || '',
      sub: r.sub_cat || '',
      name: r.name || '',
      use: r.use_flag,
    }))
    return NextResponse.json(list)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('getChecklistItems:', msg)
    return NextResponse.json([], { status: 500 })
  }
}
