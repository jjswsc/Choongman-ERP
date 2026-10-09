/**
 * 구글 시트 INFLUENCER_DB(xlsx) → 인플루언서 명부 가져오기
 * FormData: file(필수), dryRun=1(미리보기), sheetName(선택), stores(JSON 배열, 매장명 매핑용)
 * 같은 TikTok 핸들은 병합, 기존 명부와 겹치면 빈 칸만 채움.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import {
  supabaseInsertMany,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'
import {
  fillEmptyInfluencerProfileFields,
  influencerProfileDedupeKey,
  parseInfluencerSheetRows,
  type InfluencerProfileDraft,
} from '@/lib/marketing-influencer-sheet-import'
import { profileFieldsToRow, profileRowToApi } from '@/lib/marketing-influencer-profile-db'

export const maxDuration = 60

const TABLE = 'marketing_influencer_profiles'

function sheetToRows(ws: XLSX.WorkSheet): unknown[][] {
  const ref = ws['!ref']
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)
  const rows: unknown[][] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      if (!cell) {
        row.push('')
        continue
      }
      const text = cell.t === 'n' ? cell.v : String(cell.w ?? cell.v ?? '')
      const target = String(cell.l?.Target ?? '').trim()
      const textStr = String(text ?? '')
      if (target && /^https?:\/\//i.test(target) && !/https?:\/\//i.test(textStr)) {
        if (/tiktok\.com|instagram\.com|facebook\.com|fb\.com/i.test(target)) row.push(target)
        else row.push(textStr ? `${textStr} ${target}` : target)
      } else {
        row.push(text)
      }
    }
    rows.push(row)
  }
  return rows
}

function pickSheetName(names: string[], requested: string): string {
  if (requested && names.includes(requested)) return requested
  return (
    names.find((n) => /influencer[_\s-]*db/i.test(n)) ||
    names.find((n) => /influencer/i.test(n)) ||
    names[0] ||
    ''
  )
}

function parseStoresField(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.map((x) => String(x ?? '').trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

type PreviewAction = 'insert' | 'update' | 'unchanged'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  const tenantError = assertSaasTenantWritable(tenantScope, { tableHint: TABLE, label: '인플루언서 명부' })
  if (tenantError) return NextResponse.json({ success: false, message: tenantError }, { status: 403, headers })

  try {
    const ct = req.headers.get('content-type') || ''
    if (!ct.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, message: 'multipart/form-data 필요' }, { headers })
    }
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
    const dryRun = String(form.get('dryRun') ?? '').trim() === '1'
    const stores = parseStoresField(form.get('stores'))

    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
    const sheetName = pickSheetName(wb.SheetNames, String(form.get('sheetName') ?? '').trim())
    const ws = sheetName ? wb.Sheets[sheetName] : undefined
    if (!ws) return NextResponse.json({ success: false, message: '시트를 찾을 수 없습니다.' }, { headers })

    const parsed = parseInfluencerSheetRows(sheetToRows(ws), stores)

    const existingRows = (await supabaseSelectFilter(TABLE, appendSaasTenantFilter('id=gt.0', tenantScope, TABLE), {
      limit: 5000,
    })) as Record<string, unknown>[]
    const existingByKey = new Map<string, ReturnType<typeof profileRowToApi>>()
    for (const r of existingRows || []) {
      const p = profileRowToApi(r)
      existingByKey.set(influencerProfileDedupeKey(p), p)
    }

    const toInsert: InfluencerProfileDraft[] = []
    const toUpdate: { id: string; patch: Record<string, unknown> }[] = []
    const preview: {
      action: PreviewAction
      displayName: string
      tiktokHandle: string
      pipelineStatus: string
      preferredStore: string
      tiktokFollowers: number | null
      rateMinThb: number | null
      sourceRows: number[]
      changedFields: string[]
    }[] = []

    for (const d of parsed.profiles) {
      const ex = existingByKey.get(influencerProfileDedupeKey(d))
      let action: PreviewAction = 'insert'
      let changedFields: string[] = []
      if (ex) {
        const patch = fillEmptyInfluencerProfileFields(ex, d)
        changedFields = Object.keys(patch)
        if (changedFields.length > 0) {
          action = 'update'
          toUpdate.push({ id: ex.id, patch: profileFieldsToRow(patch) })
        } else {
          action = 'unchanged'
        }
      } else {
        toInsert.push(d)
      }
      preview.push({
        action,
        displayName: d.displayName,
        tiktokHandle: d.tiktokHandle,
        pipelineStatus: d.pipelineStatus,
        preferredStore: d.preferredStore,
        tiktokFollowers: d.tiktokFollowers,
        rateMinThb: d.rateMinThb,
        sourceRows: d.sourceRows,
        changedFields,
      })
    }

    const summary = {
      sheetName,
      sheetNames: wb.SheetNames,
      headerRow: parsed.headerRow,
      dataRows: parsed.dataRows,
      skippedRows: parsed.skippedRows,
      mergedDuplicates: parsed.mergedDuplicates,
      profiles: parsed.profiles.length,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      unchanged: parsed.profiles.length - toInsert.length - toUpdate.length,
    }

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, summary, warnings: parsed.warnings, preview }, { headers })
    }

    const createdBy = String(auth.name || '').trim()
    const now = new Date().toISOString()
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200).map((d) => {
        const fields: Partial<InfluencerProfileDraft> = { ...d }
        delete fields.sourceRows
        return stampSaasTenantId(
          { ...profileFieldsToRow(fields), created_by: createdBy, updated_at: now },
          tenantScope,
          TABLE
        )
      })
      const res = (await supabaseInsertMany(TABLE, chunk)) as unknown[]
      inserted += Array.isArray(res) ? res.length : chunk.length
    }
    let updated = 0
    for (const u of toUpdate) {
      await supabaseUpdateByFilter(
        TABLE,
        appendSaasTenantFilter(`id=eq.${encodeURIComponent(u.id)}`, tenantScope, TABLE),
        { ...u.patch, updated_at: now }
      )
      updated++
    }

    return NextResponse.json(
      {
        success: true,
        dryRun: false,
        summary,
        warnings: parsed.warnings,
        message: `명부 가져오기 완료: 신규 ${inserted}명, 보완 ${updated}명, 변경 없음 ${summary.unchanged}명`,
      },
      { headers }
    )
  } catch (e) {
    const s = String(e)
    if (s.includes('42P01') || s.includes('PGRST205')) {
      return NextResponse.json(
        {
          success: false,
          message:
            '인플루언서 명부 테이블이 없습니다. sql/marketing_influencer_profiles_01_table.sql ~ 03 을 Supabase에서 실행해 주세요.',
        },
        { headers }
      )
    }
    console.error('importInfluencerProfilesXlsx:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '가져오기 실패' }, { headers })
  }
}
