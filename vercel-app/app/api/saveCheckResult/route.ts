import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter, supabaseInsert } from '@/lib/supabase-server'

/** 점검 결과 저장 (id 있으면 수정, 없으면 신규) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const dateStr = String(body.date || '').trim().slice(0, 10)
    const store = String(body.store || '').trim()
    const inspector = String(body.inspector || '').trim()
    const summary = String(body.summary || '').trim()
    const memo = String(body.memo || '').trim()
    const jsonData = typeof body.jsonData === 'string' ? body.jsonData : JSON.stringify(body.jsonData || [])

    if (!dateStr || dateStr.length < 10) {
      return NextResponse.json({ success: false, msg: '날짜 형식 오류' }, { status: 400 })
    }

    if (id) {
      const existing = await supabaseSelectFilter('check_results', `id=eq.${encodeURIComponent(id)}`, { limit: 1 }) as { id?: string }[]
      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('check_results', `id=eq.${encodeURIComponent(id)}`, {
          check_date: dateStr,
          store_name: store,
          inspector,
          summary,
          memo,
          json_data: jsonData,
        })
        return NextResponse.json({ success: true, result: 'UPDATED' })
      }
    }

    // 같은 날짜·매장에 이미 점검 결과가 있으면 UPDATE (duplicate key 방지)
    const dupFilter = `check_date=eq.${encodeURIComponent(dateStr)}&store_name=eq.${encodeURIComponent(store)}`
    const existingByDateStore = (await supabaseSelectFilter('check_results', dupFilter, { limit: 1 })) as { id?: string }[]
    if (existingByDateStore && existingByDateStore.length > 0) {
      const existId = existingByDateStore[0].id
      if (existId != null && String(existId).trim()) {
        await supabaseUpdateByFilter('check_results', `id=eq.${encodeURIComponent(String(existId))}`, {
          check_date: dateStr,
          store_name: store,
          inspector,
          summary,
          memo,
          json_data: jsonData,
        })
        return NextResponse.json({ success: true, result: 'UPDATED' })
      }
    }

    const newId = `${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${store}`
    await supabaseInsert('check_results', {
      id: newId,
      check_date: dateStr,
      store_name: store,
      inspector,
      summary,
      memo,
      json_data: jsonData,
    })
    return NextResponse.json({ success: true, result: 'SAVED' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('saveCheckResult:', msg)
    return NextResponse.json({ success: false, msg: '저장 실패: ' + msg }, { status: 500 })
  }
}
