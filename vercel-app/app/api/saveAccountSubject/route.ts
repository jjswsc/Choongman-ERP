import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

const VALID_TYPES = ['expense', 'revenue', 'asset', 'liability', 'equity', 'transfer'] as const

type ParentLink = { id?: number; parent_id?: number | null }

function parseOptionalInt(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function ancestorHasId(parentMap: Map<number, number | null>, startParent: number, ancestorId: number): boolean {
  let cur: number | null = startParent
  const seen = new Set<number>()
  while (cur != null) {
    if (cur === ancestorId) return true
    if (seen.has(cur)) break
    seen.add(cur)
    cur = parentMap.get(cur) ?? null
  }
  return false
}

/** 계정과목 저장 (추가/수정) — COA 트리·태국명·헤더·시스템 계정 보호 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const code = String(body.code || '').trim().toUpperCase()
    const name = String(body.name || '').trim()
    const nameEn = body.nameEn != null ? String(body.nameEn).trim() || null : null
    const nameTh = body.nameTh != null ? String(body.nameTh).trim() || null : null
    const type = String(body.type || 'expense').toLowerCase()
    const pAndLSection = body.pAndLSection != null ? String(body.pAndLSection).trim() || null : null
    const sortOrder = Number(body.sortOrder) ?? 0
    const parentId = parseOptionalInt(body.parentId ?? body.parent_id)
    const isHeader = Boolean(body.isHeader ?? body.is_header)

    const stRaw = body.statementType ?? body.statement_type
    const statementType =
      stRaw === undefined || stRaw === null || String(stRaw).trim() === ''
        ? null
        : String(stRaw).trim().toLowerCase()
    const nsRaw = body.normalSide ?? body.normal_side
    const normalSide =
      nsRaw === undefined || nsRaw === null || String(nsRaw).trim() === ''
        ? null
        : String(nsRaw).trim().toLowerCase()

    const ccRaw = body.coaClass ?? body.coa_class
    const coaClass =
      ccRaw === undefined || ccRaw === null || String(ccRaw).trim() === ''
        ? null
        : String(ccRaw).trim()

    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 과목명을 입력하세요.' }, { status: 400, headers })
    }

    if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
      return NextResponse.json(
        {
          success: false,
          message: '유형은 expense, revenue, asset, liability, equity, transfer 중 하나여야 합니다.',
        },
        { status: 400, headers }
      )
    }

    if (statementType != null && statementType !== 'bs' && statementType !== 'pl') {
      return NextResponse.json({ success: false, message: 'statement_type은 bs 또는 pl 이어야 합니다.' }, { status: 400, headers })
    }
    if (normalSide != null && normalSide !== 'debit' && normalSide !== 'credit') {
      return NextResponse.json({ success: false, message: 'normal_side는 debit 또는 credit 이어야 합니다.' }, { status: 400, headers })
    }
    if (coaClass != null && !['1', '2', '3', '4', '5'].includes(coaClass)) {
      return NextResponse.json({ success: false, message: 'coa_class는 1~5 또는 비움만 가능합니다.' }, { status: 400, headers })
    }

    const links = (await supabaseSelect('account_subjects', {
      select: 'id,parent_id',
      limit: 5000,
    })) as ParentLink[]
    const parentMap = new Map<number, number | null>()
    for (const r of links || []) {
      if (r.id == null) continue
      const pid = r.parent_id != null && !Number.isNaN(Number(r.parent_id)) ? Number(r.parent_id) : null
      parentMap.set(Number(r.id), pid)
    }

    if (parentId != null) {
      if (!parentMap.has(parentId)) {
        return NextResponse.json({ success: false, message: '상위 계정을 찾을 수 없습니다.' }, { status: 400, headers })
      }
      if (id && parentId === id) {
        return NextResponse.json({ success: false, message: '자기 자신을 상위로 지정할 수 없습니다.' }, { status: 400, headers })
      }
      if (id && ancestorHasId(parentMap, parentId, id)) {
        return NextResponse.json({ success: false, message: '상위 계정이 순환을 만듭니다.' }, { status: 400, headers })
      }
    }

    const codeDup = (await supabaseSelectFilter('account_subjects', `code=eq.${encodeURIComponent(code)}`, {
      limit: 2,
    })) as { id?: number }[]
    const codeRow = codeDup?.[0]

    const patch: Record<string, unknown> = {
      code,
      name,
      name_en: nameEn,
      name_th: nameTh,
      type,
      p_and_l_section: pAndLSection,
      sort_order: sortOrder,
      parent_id: parentId,
      is_header: isHeader,
      statement_type: statementType,
      normal_side: normalSide,
      coa_class: coaClass,
    }

    if (id) {
      const rows = (await supabaseSelectFilter('account_subjects', `id=eq.${id}`, { limit: 1 })) as {
        id?: number
        code?: string
        type?: string
        is_system?: boolean
      }[]
      const cur = rows?.[0]
      if (!cur?.id) {
        return NextResponse.json({ success: false, message: '해당 계정과목을 찾을 수 없습니다.' }, { status: 404, headers })
      }

      if (codeRow && codeRow.id !== id) {
        return NextResponse.json({ success: false, message: `코드 "${code}"가 이미 존재합니다.` }, { status: 400, headers })
      }

      if (cur.is_system) {
        if (String(cur.code || '').trim().toUpperCase() !== code) {
          return NextResponse.json({ success: false, message: '시스템 계정의 코드는 바꿀 수 없습니다.' }, { status: 400, headers })
        }
        if (type !== String(cur.type || '').toLowerCase()) {
          return NextResponse.json({ success: false, message: '시스템 계정의 유형은 바꿀 수 없습니다.' }, { status: 400, headers })
        }
      }

      await supabaseUpdate('account_subjects', id, patch)
      return NextResponse.json({ success: true, message: '수정되었습니다.', id }, { headers })
    }

    if (codeRow) {
      return NextResponse.json({ success: false, message: `코드 "${code}"가 이미 존재합니다.` }, { status: 400, headers })
    }

    patch.is_system = false

    const inserted = (await supabaseInsert('account_subjects', patch)) as { id?: number }[]
    const newId = Array.isArray(inserted) ? inserted[0]?.id : (inserted as { id?: number })?.id
    return NextResponse.json({ success: true, message: '등록되었습니다.', id: newId }, { headers })
  } catch (e) {
    console.error('saveAccountSubject:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
