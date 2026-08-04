import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  assertInventoryTenantWritable,
  resolveInventoryTenantScope,
  stampInventoryTenantId,
} from '@/lib/inventory-tenant-scope'
import { getBangkokEndOfDayUtcIso, getBangkokTodayDateString } from '@/lib/bangkok-time'

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 화면 기준일(asOfDate)에 맞춘 log_date.
 * - 과거일: 방콕 EOD → 기준일 조회(log_date <= EOD)에 포함
 * - 오늘/미지정: 현재 시각
 */
function resolveAdjustLogDate(asOfDateRaw: string | undefined): { ok: true; logDate: string } | { ok: false; message: string } {
  const asOf = String(asOfDateRaw || '').trim()
  if (!asOf) {
    return { ok: true, logDate: new Date().toISOString() }
  }
  if (!YMD_RE.test(asOf)) {
    return { ok: false, message: '기준일 형식이 올바르지 않습니다. (YYYY-MM-DD)' }
  }
  const today = getBangkokTodayDateString()
  if (asOf > today) {
    return { ok: false, message: '미래 날짜로는 재고를 조정할 수 없습니다.' }
  }
  if (asOf === today) {
    return { ok: true, logDate: new Date().toISOString() }
  }
  try {
    return { ok: true, logDate: getBangkokEndOfDayUtcIso(asOf) }
  } catch {
    return { ok: false, message: '기준일 형식이 올바르지 않습니다. (YYYY-MM-DD)' }
  }
}

/** 재고 조정 - 오피스 직원 또는 매니저(자기 매장만) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) return authResult.errorResponse
    const auth = authResult.auth!
    const tenantScope = await resolveInventoryTenantScope({ auth })
    const writeBlock = assertInventoryTenantWritable(tenantScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { status: 400, headers })
    }

    const body = await request.json() as {
      store?: string
      itemCode?: string
      itemName?: string
      spec?: string
      diffQty?: number
      memo?: string
      /** 재고 목록 기준일(방콕 YYYY-MM-DD). 과거일이면 그 날 EOD로 저장 */
      asOfDate?: string
    }

    const userRole = String(auth.role || '').toLowerCase()
    const userStore = (auth.store || '').trim()
    const isOffice = ['director', 'secretary', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
    const isManager = userRole.includes('manager') || userRole.includes('franchisee')

    if (!isOffice && !isManager) {
      return NextResponse.json(
        { success: false, message: '재고 조정 권한이 없습니다.' },
        { headers }
      )
    }

    if (isManager && userStore) {
      const store = String(body.store || '').trim()
      const storeNorm = store.toLowerCase()
      const userNorm = userStore.toLowerCase()
      const matches = storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm)
      if (!matches) {
        return NextResponse.json(
          { success: false, message: '자기 매장만 재고 조정할 수 있습니다.' },
          { headers }
        )
      }
    }

    const store = String(body.store || '').trim()
    const itemCode = String(body.itemCode || '').trim()
    const diffQty = Number(body.diffQty)
    if (!store || !itemCode) {
      return NextResponse.json(
        { success: false, message: '매장과 품목 코드가 필요합니다.' },
        { headers }
      )
    }
    if (diffQty === 0 || isNaN(diffQty)) {
      return NextResponse.json(
        { success: false, message: '조정 수량을 입력해 주세요.' },
        { headers }
      )
    }

    const logResolved = resolveAdjustLogDate(body.asOfDate)
    if (!logResolved.ok) {
      return NextResponse.json({ success: false, message: logResolved.message }, { headers })
    }

    await supabaseInsert('stock_logs', stampInventoryTenantId({
      location: store,
      item_code: itemCode,
      item_name: String(body.itemName || '').trim(),
      spec: String(body.spec || '').trim() || 'Adjustment',
      qty: diffQty,
      log_date: logResolved.logDate,
      vendor_target: body.memo ? String(body.memo).trim() : '재고조정',
      log_type: 'Adjustment',
    }, tenantScope))

    return NextResponse.json({ success: true, message: '재고가 조정되었습니다.' }, { headers })
  } catch (e) {
    console.error('adjustStock:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '재고 조정 실패' },
      { headers }
    )
  }
}
