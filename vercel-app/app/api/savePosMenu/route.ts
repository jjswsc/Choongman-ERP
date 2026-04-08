import { NextRequest, NextResponse } from 'next/server'
import { upsertPosMenuFromBody } from '@/lib/pos-menu-upsert-server'

/** POS 메뉴 저장 (등록/수정) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as Parameters<typeof upsertPosMenuFromBody>[0]
    const result = await upsertPosMenuFromBody(body, { upsertByCode: false })
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('savePosMenu:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
