import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!

    const userRole = (auth.role || '').trim()
    const userStore = (auth.store || '').trim()
    const storeParam = String(new URL(request.url).searchParams.get('store') || '').trim()

    let rows: { store?: string; job?: string; target_count?: number; updated_at?: string }[] = []
    try {
      rows = (await supabaseSelect('store_job_headcount', {
        select: 'store,job,target_count,updated_at',
        order: 'store.asc,job.asc',
        limit: 10000,
      })) as typeof rows
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/relation|does not exist|not found/i.test(msg)) {
        return NextResponse.json({ list: [] as unknown[], _note: 'table_missing' }, { headers })
      }
      throw e
    }

    const list = (rows || []).filter((r) => {
      const st = String(r.store || '').trim()
      if (!st) return false
      if (storeParam && st !== storeParam) return false
      return userCanAccessEmployeeStore(userRole, userStore, st)
    })

    return NextResponse.json(
      {
        list: list.map((r) => ({
          store: String(r.store || '').trim(),
          job: String(r.job || '').trim(),
          target_count: Math.max(0, Number(r.target_count) || 0),
          updated_at: r.updated_at != null ? String(r.updated_at) : '',
        })),
      },
      { headers }
    )
  } catch (e) {
    console.error('getStoreJobHeadcount:', e)
    return NextResponse.json(
      { list: [], message: '조회에 실패했습니다.' },
      { status: 500, headers }
    )
  }
}
