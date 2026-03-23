import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** P0001, P001, PROMO12 등 숫자 접미사 최대값 */
const CODE_PATTERNS = [/^P(\d+)$/i, /^PROMO(\d+)$/i]

function maxNumericSuffix(codes: Iterable<string>): number {
  let max = 0
  for (const raw of codes) {
    const c = String(raw ?? '').trim()
    for (const re of CODE_PATTERNS) {
      const m = c.match(re)
      if (m) {
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n) && n > max) max = n
      }
    }
  }
  return max
}

/** 다음 프로모션 코드 (pos_promos·pos_menus 충돌 방지 — 미러 메뉴가 동일 코드 사용) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const [promoRows, menuRows] = await Promise.all([
      supabaseSelect('pos_promos', { select: 'code', limit: 10000 }) as Promise<{ code?: string }[]>,
      supabaseSelect('pos_menus', { select: 'code', limit: 10000 }) as Promise<{ code?: string }[]>,
    ])

    const allCodes: string[] = [
      ...(promoRows || []).map((r) => String(r?.code ?? '')),
      ...(menuRows || []).map((r) => String(r?.code ?? '')),
    ]

    const nextNum = maxNumericSuffix(allCodes) + 1
    const width = Math.max(4, String(nextNum).length)
    const code = `P${String(nextNum).padStart(width, '0')}`

    return NextResponse.json({ code }, { headers })
  } catch (e) {
    console.error('getNextPosPromoCode:', e)
    return NextResponse.json({ code: null, message: String(e) }, { status: 500, headers })
  }
}
