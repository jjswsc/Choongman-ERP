import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { userCanAccessEmployeeStore, storeMatches } from '@/lib/admin-employee-store-access'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'

type RowIn = { job?: string; target_count?: number }

/** 매장×직무 적정인원 저장. 매니저·가맹점주는 자기 매장만 (saveSafetyStock과 동일) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!

    const userRole = (auth.role || '').toLowerCase()
    const userStore = (auth.store || '').trim()
    const isManagerOrFranchisee = userRole.includes('manager') || userRole.includes('franchisee')

    const body = (await request.json()) as { store?: string; rows?: RowIn[] }
    const store = String(body.store || '').trim()
    const rowsIn = Array.isArray(body.rows) ? body.rows : []

    if (!store || rowsIn.length === 0) {
      return NextResponse.json({ success: false, message: '매장과 저장할 행이 필요합니다.' }, { headers })
    }

    if (!userCanAccessEmployeeStore(auth.role || '', userStore, store)) {
      return NextResponse.json({ success: false, message: '해당 매장 데이터에 접근할 수 없습니다.' }, { headers })
    }

    if (isManagerOrFranchisee && userStore && store) {
      const storeNorm = store.toLowerCase()
      const userNorm = userStore.toLowerCase()
      const matches =
        storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm) || storeMatches(userStore, store)
      if (!matches) {
        return NextResponse.json(
          { success: false, message: '자기 매장만 적정인원을 수정할 수 있습니다.' },
          { headers }
        )
      }
    }

    const now = getBangkokDateTimeString()
    const updatedBy = String(auth.name || '').trim() || userStore
    const payload: Record<string, unknown>[] = []

    for (const r of rowsIn) {
      const job = String(r.job || '').trim()
      const target_count = Math.max(0, Math.floor(Number(r.target_count) || 0))
      if (!job) continue
      payload.push({
        store,
        job,
        target_count,
        updated_at: now,
        updated_by: updatedBy,
      })
    }

    if (payload.length === 0) {
      return NextResponse.json({ success: false, message: '유효한 직무 행이 없습니다.' }, { headers })
    }

    await supabaseUpsert('store_job_headcount', payload, 'store,job')

    return NextResponse.json({ success: true, message: '적정인원이 저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveStoreJobHeadcount:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (/relation|does not exist|not found/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          message: 'DB에 store_job_headcount 테이블이 없습니다. supabase_store_job_headcount.sql을 실행해 주세요.',
        },
        { headers }
      )
    }
    return NextResponse.json({ success: false, message: '저장에 실패했습니다.' }, { status: 500, headers })
  }
}
