import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

const PREFIX_BY_MAIN: Record<string, string> = {
  Chicken: 'C',
  Korean: 'K',
  Side: 'S',
  Drinks: 'D',
}

/** GET ?mainCategory=Chicken → 다음 코드 C0013 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const mainCategory = req.nextUrl.searchParams.get('mainCategory')?.trim()
    if (!mainCategory) {
      return NextResponse.json({ code: null, message: 'mainCategory 파라미터가 필요합니다.' }, { headers })
    }

    const prefix = PREFIX_BY_MAIN[mainCategory]
    if (!prefix) {
      return NextResponse.json({ code: null, message: `지원하지 않는 대분류: ${mainCategory}` }, { headers })
    }

    const rows = (await supabaseSelect('pos_menus', {
      select: 'code',
      limit: 10000,
    })) as { code?: string }[]

    const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i')
    let maxNum = 0
    for (const row of rows || []) {
      const c = String(row?.code ?? '').trim()
      const m = c.match(pattern)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > maxNum) maxNum = n
      }
    }

    const nextCode = `${prefix}${String(maxNum + 1).padStart(3, '0')}`
    return NextResponse.json({ code: nextCode }, { headers })
  } catch (e) {
    console.error('getNextPosMenuCode:', e)
    return NextResponse.json({ code: null, message: String(e) }, { status: 500, headers })
  }
}
