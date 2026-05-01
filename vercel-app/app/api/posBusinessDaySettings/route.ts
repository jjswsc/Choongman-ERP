import { NextRequest, NextResponse } from 'next/server'
import {
  normalizePosBusinessHours,
  POS_BUSINESS_DAY_DEFAULT_HOURS,
  POS_BUSINESS_DAY_DEFAULT_START,
  type PosBusinessHoursConfig,
} from '@/lib/pos-business-day'
import {
  authCanSavePosBusinessDayForStore,
  authCanSavePosBusinessDayGlobal,
  loadPosBusinessDaySettingsContext,
  resolvePosBusinessHoursFromContext,
  upsertPosBusinessDayGlobal,
  upsertPosBusinessDayStoreOverride,
} from '@/lib/pos-business-day-server'
import { requireAuth } from '@/lib/verify-auth'
import { normStoreKey } from '@/lib/store-list-keys'

function parseHoursBody(body: unknown): PosBusinessHoursConfig | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const sh = Number(o.hour ?? o.startHour)
  const sm = Number(o.minute ?? o.startMinute ?? 0)
  if (!Number.isFinite(sh)) return null
  const ehRaw = o.endHour ?? o.endH
  const emRaw = o.endMinute ?? o.endM
  const eh = Number.isFinite(Number(ehRaw)) ? Number(ehRaw) : sh
  const em = Number.isFinite(Number(emRaw)) ? Number(emRaw) : sm
  return normalizePosBusinessHours({
    start: { hour: sh, minute: sm },
    end: { hour: eh, minute: em },
  })
}

function parseStoreCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const s = String(o.storeCode ?? o.store ?? '').trim()
  return s || null
}

function dtoFromHours(h: PosBusinessHoursConfig) {
  const x = normalizePosBusinessHours(h)
  return {
    hour: x.start.hour,
    minute: x.start.minute,
    endHour: x.end.hour,
    endMinute: x.end.minute,
  }
}

/**
 * GET: ?storeCode= — 해당 매장에 적용되는 영업 시작·종료(매장 덮어쓰기 없으면 전사 기본)
 * storeCode 없음: 전사 기본값만(하위 호환·POS 초기 로드)
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(request.url)
    const storeParam = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
    const ctx = await loadPosBusinessDaySettingsContext()
    const effective = resolvePosBusinessHoursFromContext(ctx, storeParam || null)
    const nk = normStoreKey(storeParam)
    const hasStoreOverride = Boolean(nk && ctx.byNormKey.has(nk))
    const scope: 'store_override' | 'org_default' = hasStoreOverride ? 'store_override' : 'org_default'
    const g = ctx.globalDefault

    return NextResponse.json(
      {
        ...dtoFromHours(effective),
        defaultHour: POS_BUSINESS_DAY_DEFAULT_START.hour,
        defaultMinute: POS_BUSINESS_DAY_DEFAULT_START.minute,
        defaultEndHour: POS_BUSINESS_DAY_DEFAULT_START.hour,
        defaultEndMinute: POS_BUSINESS_DAY_DEFAULT_START.minute,
        globalHour: g.start.hour,
        globalMinute: g.start.minute,
        globalEndHour: g.end.hour,
        globalEndMinute: g.end.minute,
        scope,
        storeCode: storeParam || null,
        hasStoreOverride,
      },
      { headers }
    )
  } catch (e) {
    console.error('posBusinessDaySettings GET:', e)
    const d = POS_BUSINESS_DAY_DEFAULT_HOURS
    return NextResponse.json(
      {
        ...dtoFromHours(d),
        defaultHour: POS_BUSINESS_DAY_DEFAULT_START.hour,
        defaultMinute: POS_BUSINESS_DAY_DEFAULT_START.minute,
        defaultEndHour: POS_BUSINESS_DAY_DEFAULT_START.hour,
        defaultEndMinute: POS_BUSINESS_DAY_DEFAULT_START.minute,
        globalHour: d.start.hour,
        globalMinute: d.start.minute,
        globalEndHour: d.end.hour,
        globalEndMinute: d.end.minute,
        scope: 'org_default' as const,
        storeCode: null,
        hasStoreOverride: false,
      },
      { headers }
    )
  }
}

/**
 * POST: { hour, minute, endHour?, endMinute? } 전사 기본
 * | + storeCode 매장 덮어쓰기
 * | { reset: true, storeCode } 매장 덮어쓰기 제거
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  try {
    const body = await request.json().catch(() => null)
    const reset =
      body && typeof body === 'object' && (body as { reset?: unknown }).reset === true
    const storeCode = parseStoreCode(body)

    if (reset) {
      if (!storeCode) {
        return NextResponse.json(
          { success: false, message: 'reset 시 storeCode 필요' },
          { status: 400, headers }
        )
      }
      if (!authCanSavePosBusinessDayForStore(auth, storeCode)) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
      }
      await upsertPosBusinessDayStoreOverride(storeCode, null)
      const ctx = await loadPosBusinessDaySettingsContext()
      const eff = resolvePosBusinessHoursFromContext(ctx, storeCode)
      return NextResponse.json({ success: true, ...dtoFromHours(eff), storeCode, reset: true }, { headers })
    }

    const hours = parseHoursBody(body)
    if (!hours) {
      return NextResponse.json({ success: false, message: 'hour/minute 필요' }, { status: 400, headers })
    }

    if (storeCode) {
      if (!authCanSavePosBusinessDayForStore(auth, storeCode)) {
        return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
      }
      await upsertPosBusinessDayStoreOverride(storeCode, hours)
      return NextResponse.json({ success: true, ...dtoFromHours(hours), storeCode }, { headers })
    }

    if (!authCanSavePosBusinessDayGlobal(auth)) {
      return NextResponse.json(
        { success: false, message: '전사 기본값은 본사 권한에서만 저장할 수 있습니다.' },
        { status: 403, headers }
      )
    }
    await upsertPosBusinessDayGlobal(hours)
    return NextResponse.json({ success: true, ...dtoFromHours(hours) }, { headers })
  } catch (e) {
    console.error('posBusinessDaySettings POST:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
