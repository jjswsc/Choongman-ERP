import { NextRequest, NextResponse } from 'next/server'
import { upsertPosMenuFromBody, type PosMenuUpsertApiBody } from '@/lib/pos-menu-upsert-server'

const MAX_ROWS = 2000

/** POS 메뉴 일괄 업로드 (코드 기준: 있으면 갱신, 없으면 신규). 프로모 연동 행은 건너뜀. */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) as { menus?: unknown }
    const menus = body.menus
    if (!Array.isArray(menus)) {
      return NextResponse.json(
        { success: false, message: 'menus 배열이 필요합니다.' },
        { headers }
      )
    }
    if (menus.length === 0) {
      return NextResponse.json(
        { success: false, message: '업로드할 행이 없습니다.' },
        { headers }
      )
    }
    if (menus.length > MAX_ROWS) {
      return NextResponse.json(
        { success: false, message: `한 번에 최대 ${MAX_ROWS}행까지 업로드할 수 있습니다.` },
        { headers }
      )
    }

    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (let i = 0; i < menus.length; i++) {
      const row = menus[i] as PosMenuUpsertApiBody
      const line = i + 1
      const code = String(row?.code ?? '').trim()
      const name = String(row?.name ?? '').trim()
      if (!code || !name) {
        errors.push(`${line}행: 코드·메뉴명 필수`)
        skipped++
        continue
      }

      const hadId = !!(row.id && String(row.id).trim())
      const result = await upsertPosMenuFromBody(
        { ...row, code, name, id: hadId ? String(row.id).trim() : undefined },
        { upsertByCode: !hadId }
      )

      if (!result.success) {
        if (/프로모션/.test(result.message)) {
          skipped++
          errors.push(`${line}행 (${code}): 프로모션 연동 메뉴 — 건너뜀`)
        } else {
          skipped++
          errors.push(`${line}행 (${code}): ${result.message}`)
        }
        continue
      }

      if (result.message === '수정되었습니다.') {
        updated++
      } else {
        inserted++
      }
    }

    return NextResponse.json(
      {
        success: errors.length === 0 || inserted + updated > 0,
        inserted,
        updated,
        skipped,
        errors: errors.slice(0, 50),
        errorsTruncated: errors.length > 50,
        message: `신규 ${inserted}건, 갱신 ${updated}건, 건너뜀/실패 ${skipped}건`,
      },
      { headers }
    )
  } catch (e) {
    console.error('importPosMenus:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '업로드 실패' },
      { headers }
    )
  }
}
