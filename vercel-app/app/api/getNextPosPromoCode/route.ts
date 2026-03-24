import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** P0001, P001, PROMO12 등에서 숫자 접미사 후보 */
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

/** 다음 프로모션 코드: pos_promos·pos_menus의 실제 코드 집합과 충돌하지 않을 때까지 증가 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const [promoRows, menuRows] = await Promise.all([
      supabaseSelect('pos_promos', { select: 'code', limit: 10000 }) as Promise<{ code?: string }[]>,
      supabaseSelect('pos_menus', { select: 'code', limit: 10000 }) as Promise<{ code?: string }[]>,
    ])

    const allCodes: string[] = [
      ...(promoRows || []).map((r) => String(r?.code ?? '').trim()),
      ...(menuRows || []).map((r) => String(r?.code ?? '').trim()),
    ].filter(Boolean)

    const codeSet = new Set(allCodes)
    let n = maxNumericSuffix(allCodes) + 1
    const maxAttempts = 50000
    for (let i = 0; i < maxAttempts; i++) {
      const width = Math.max(4, String(n).length)
      const candidate = `P${String(n).padStart(width, '0')}`
      if (!codeSet.has(candidate)) {
        return NextResponse.json({ code: candidate }, { headers })
      }
      n++
    }

    return NextResponse.json(
      { code: null, message: '사용 가능한 프로모 코드를 찾지 못했습니다.' },
      { status: 500, headers }
    )
  } catch (e) {
    console.error('getNextPosPromoCode:', e)
    return NextResponse.json({ code: null, message: String(e) }, { status: 500, headers })
  }
}
