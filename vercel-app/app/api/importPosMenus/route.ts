import { NextRequest, NextResponse } from 'next/server'
import { upsertPosMenuFromBody, type PosMenuUpsertApiBody } from '@/lib/pos-menu-upsert-server'
import { resolvePosCatalogTenantScope } from '@/lib/pos-catalog-tenant-scope'
import { requireAuth } from '@/lib/verify-auth'

const MAX_ROWS = 2000

function normalizeStoreCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const v of raw) {
    const code = String(v || '').trim()
    if (!code) continue
    if (out.some((x) => x.toLowerCase() === code.toLowerCase())) continue
    out.push(code)
  }
  return out
}

/** POS 메뉴 일괄 업로드 (코드 기준: 있으면 갱신, 없으면 신규). 프로모 연동 행은 건너뜀. */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) {
    const res = authResult.errorResponse
    res.headers.set('Access-Control-Allow-Origin', '*')
    return res
  }
  const auth = authResult.auth
  const changedBy =
    String(auth.name || '').trim() || String(auth.employeeCode || '').trim() || 'importPosMenus'

  try {
    const body = (await req.json()) as { menus?: unknown; storeCodes?: unknown }
    const menus = body.menus
    const storeCodes = normalizeStoreCodes(body.storeCodes)
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
    if (storeCodes.length === 0) {
      return NextResponse.json(
        { success: false, message: '신규 메뉴는 노출 매장을 1개 이상 선택해야 합니다.' },
        { headers }
      )
    }

    const catalogScope = await resolvePosCatalogTenantScope({
      auth,
      storeCode: storeCodes[0] || auth.store || null,
    })

    let inserted = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []
    const errorDetails: { line: number; code?: string; message: string }[] = []

    for (let i = 0; i < menus.length; i++) {
      const row = menus[i] as PosMenuUpsertApiBody
      const line = i + 1
      const code = String(row?.code ?? '').trim()
      const name = String(row?.name ?? '').trim()
      if (!code || !name) {
        const message = '코드와 메뉴명이 필요합니다.'
        errors.push(`${line}행: ${message}`)
        errorDetails.push({ line, code: code || undefined, message })
        skipped++
        continue
      }

      const hadId = !!(row.id && String(row.id).trim())
      const result = await upsertPosMenuFromBody(
        {
          ...row,
          code,
          name,
          id: hadId ? String(row.id).trim() : undefined,
          storeCodes,
        },
        { upsertByCode: !hadId, catalogScope, changedBy }
      )

      if (!result.success) {
        if (/프로모션/.test(result.message)) {
          skipped++
          const message = '프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.'
          errors.push(`${line}행 (${code}): ${message}`)
          errorDetails.push({ line, code, message })
        } else {
          skipped++
          errors.push(`${line}행 (${code}): ${result.message}`)
          errorDetails.push({ line, code, message: result.message })
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
        errorDetails: errorDetails.slice(0, 50),
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
