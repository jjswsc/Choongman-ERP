import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter, supabaseInsert } from '@/lib/supabase-server'
import { syncDailyPlanOnStoreCheck } from '@/lib/daily-plan-hooks'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'

type ExistingCheck = { id?: string; inspector?: string | null }

/** 점검 결과 저장 (id 있으면 수정, 없으면 신규). 점검자는 로그인 이름 — 수정 시 최초 점검자 유지 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const dateStr = String(body.date || '').trim().slice(0, 10)
    const store = String(body.store || '').trim()
    const authed = await tryVerifyBearerFromRequest(request).catch(() => null)
    const inspector = String(authed?.name || body.inspector || '').trim()
    const summary = String(body.summary || '').trim()
    const memo = String(body.memo || '').trim()
    const jsonData = typeof body.jsonData === 'string' ? body.jsonData : JSON.stringify(body.jsonData || [])

    if (!dateStr || dateStr.length < 10) {
      return NextResponse.json({ success: false, msg: '날짜 형식 오류' }, { status: 400 })
    }

    const updateExisting = async (row: ExistingCheck) => {
      const keepInspector = String(row.inspector || '').trim() || inspector
      await supabaseUpdateByFilter('check_results', `id=eq.${encodeURIComponent(String(row.id))}`, {
        check_date: dateStr,
        store_name: store,
        inspector: keepInspector,
        summary,
        memo,
        json_data: jsonData,
      })
      await syncDailyPlanOnStoreCheck({ store, date: dateStr, inspector })
      return NextResponse.json({ success: true, result: 'UPDATED', id: String(row.id), inspector: keepInspector })
    }

    if (id) {
      const existing = (await supabaseSelectFilter('check_results', `id=eq.${encodeURIComponent(id)}`, { limit: 1 })) as ExistingCheck[]
      if (existing && existing.length > 0) return updateExisting(existing[0])
    }

    // 같은 날짜·매장에 이미 점검 결과가 있으면 UPDATE (duplicate key 방지)
    const dupFilter = `check_date=eq.${encodeURIComponent(dateStr)}&store_name=eq.${encodeURIComponent(store)}`
    const existingByDateStore = (await supabaseSelectFilter('check_results', dupFilter, { limit: 1 })) as ExistingCheck[]
    const dup = existingByDateStore?.[0]
    if (dup?.id != null && String(dup.id).trim()) return updateExisting(dup)

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
    await syncDailyPlanOnStoreCheck({ store, date: dateStr, inspector })
    return NextResponse.json({ success: true, result: 'SAVED', id: newId, inspector })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('saveCheckResult:', msg)
    return NextResponse.json({ success: false, msg: '저장 실패: ' + msg }, { status: 500 })
  }
}
