/**
 * 구글 시트(xlsx) → 인플루언서 명부 + 업로드 기록 가져오기
 * FormData: file(필수), dryRun=1(미리보기), sheetName(선택), stores(JSON 배열, 매장명 매핑용), jobs=0(작업 시트 제외)
 * - INFLUENCER_DB(+Hired): 같은 TikTok 핸들은 병합, 기존 명부와 겹치면 빈 칸만 채움
 * - CAMPAIGN_TRACKER(+Hired ผลงาน): 작업·비용·지급 상태·결과물 링크 → 업로드 기록. external_ref 로 재가져오기 중복 방지
 * 지급예정(accrual) 연동은 하지 않는다(업로드 기록 화면에서 저장 시 연동).
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
import {
  buildInfluencerPostFillPatch,
  matchExistingInfluencerPost,
  parseInfluencerJobSheets,
  type ExistingInfluencerPostRow,
  type InfluencerPostDraft,
} from '@/lib/marketing-influencer-job-import'
import { formatFollowersShort, normalizeTiktokHandle } from '@/lib/marketing-influencer-profile'
import { profileFieldsToRow, profileRowToApi } from '@/lib/marketing-influencer-profile-db'

export const maxDuration = 60

const TABLE = 'marketing_influencer_profiles'
const POSTS = 'marketing_influencers'
/** SQL 06 미실행 DB에서는 이 컬럼들을 빼고 저장 */
const JOB_COLUMNS = ['payment_status', 'paid_at', 'external_ref'] as const

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
      const text = cell.t === 'n' || cell.t === 'b' ? cell.v : String(cell.w ?? cell.v ?? '')
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

function isColumnSchemaError(e: unknown): boolean {
  const s = String(e)
  return (
    s.includes('42703') ||
    s.includes('PGRST204') ||
    s.includes('schema cache') ||
    /Could not find the .* column/i.test(s) ||
    /column .* does not exist/i.test(s)
  )
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

function ymd(v: unknown): string | null {
  const s = str(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function postRowToExisting(row: Record<string, unknown>): ExistingInfluencerPostRow {
  const links: Record<string, string> = {}
  if (row.platform_links && typeof row.platform_links === 'object' && !Array.isArray(row.platform_links)) {
    for (const [k, v] of Object.entries(row.platform_links as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) links[k] = v.trim()
    }
  }
  return {
    id: str(row.id),
    profileId: row.profile_id != null ? str(row.profile_id) : null,
    name: str(row.name),
    contactName: str(row.contact_name),
    contactPhone: str(row.contact_phone),
    branchReview: str(row.branch_review),
    shootingDate: ymd(row.shooting_date),
    publishDate: ymd(row.publish_date),
    budget: num(row.budget),
    actualCost: num(row.actual_cost),
    status: str(row.status) || 'finish',
    contentFormat: str(row.content_format),
    paymentStatus: str(row.payment_status),
    paidAt: ymd(row.paid_at),
    externalRef: str(row.external_ref),
    platformLinks: links,
    note: str(row.note),
    expenseAccrualId: row.expense_accrual_id != null && row.expense_accrual_id !== '' ? str(row.expense_accrual_id) : null,
  }
}

function withoutJobColumns(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row }
  for (const c of JOB_COLUMNS) delete rest[c]
  return rest
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
    const includeJobs = String(form.get('jobs') ?? '1').trim() !== '0'
    const stores = parseStoresField(form.get('stores'))

    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
    const sheetName = pickSheetName(wb.SheetNames, String(form.get('sheetName') ?? '').trim())
    const ws = sheetName ? wb.Sheets[sheetName] : undefined
    if (!ws) return NextResponse.json({ success: false, message: '시트를 찾을 수 없습니다.' }, { headers })

    const parsed = parseInfluencerSheetRows(sheetToRows(ws), stores)
    const warnings = [...parsed.warnings]

    const hiredName = wb.SheetNames.find((n) => n !== sheetName && /^\s*hired\s*$|จ้างแล้ว/i.test(n)) || ''
    const trackerName = wb.SheetNames.find((n) => n !== sheetName && /tracker|campaign[_\s-]*job/i.test(n)) || ''
    const hiredRows = includeJobs && hiredName ? sheetToRows(wb.Sheets[hiredName]!) : null
    const trackerRows = includeJobs && trackerName ? sheetToRows(wb.Sheets[trackerName]!) : null

    // Hired 시트의 프로필 정보도 명부에 병합(빈 칸만)
    const draftByKey = new Map<string, InfluencerProfileDraft>()
    for (const d of parsed.profiles) draftByKey.set(influencerProfileDedupeKey(d), d)
    if (hiredRows) {
      const hp = parseInfluencerSheetRows(hiredRows, stores)
      for (const h of hp.profiles) {
        const k = influencerProfileDedupeKey(h)
        const prev = draftByKey.get(k)
        if (prev) {
          Object.assign(prev, fillEmptyInfluencerProfileFields(prev, h))
          for (const s of h.sheetSeqs) if (!prev.sheetSeqs.includes(s)) prev.sheetSeqs.push(s)
        } else {
          draftByKey.set(k, h)
        }
      }
    }
    const profileDrafts = [...draftByKey.values()]

    const jobs = includeJobs
      ? parseInfluencerJobSheets({ trackerRows, hiredRows, profiles: profileDrafts, stores })
      : { posts: [] as InfluencerPostDraft[], warnings: [] as string[], trackerRows: 0, hiredLinkRows: 0 }
    warnings.push(...jobs.warnings)

    // 작업이 있는 인플루언서는 섭외 상태를 '채용'으로
    const jobKeys = new Set(jobs.posts.map((p) => p.profileKey).filter(Boolean))
    for (const d of profileDrafts) {
      if (jobKeys.has(influencerProfileDedupeKey(d)) && ['waiting', 'interested', 'got_rate', 'high_rate'].includes(d.pipelineStatus)) {
        d.pipelineStatus = 'hired'
      }
    }

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

    for (const d of profileDrafts) {
      const ex = existingByKey.get(influencerProfileDedupeKey(d))
      let action: PreviewAction = 'insert'
      let changedFields: string[] = []
      if (ex) {
        const patch = fillEmptyInfluencerProfileFields(ex, d)
        if (ex.pipelineStatus !== 'hired' && d.pipelineStatus === 'hired' && jobKeys.has(influencerProfileDedupeKey(d))) {
          patch.pipelineStatus = 'hired'
        }
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

    // 업로드 기록 매칭
    let existingPosts: ExistingInfluencerPostRow[] = []
    if (jobs.posts.length) {
      const rows = (await supabaseSelectFilter(POSTS, appendSaasTenantFilter('id=gt.0', tenantScope, POSTS), {
        limit: 8000,
        order: 'id.asc',
      })) as Record<string, unknown>[]
      existingPosts = (rows || []).map(postRowToExisting)
    }
    const taken = new Set<string>()
    const postPlans: {
      draft: InfluencerPostDraft
      action: PreviewAction
      matchedId: string | null
      patch: Record<string, unknown>
    }[] = []
    for (const draft of jobs.posts) {
      const profileId = draft.profileKey ? existingByKey.get(draft.profileKey)?.id ?? null : null
      const handle = draft.profileKey.startsWith('tt:') ? draft.profileKey.slice(3) : normalizeTiktokHandle(draft.name)
      const match = matchExistingInfluencerPost(draft, { profileId, handle }, existingPosts, taken)
      if (match) {
        taken.add(match.id)
        const patch = buildInfluencerPostFillPatch(match, draft, profileId)
        postPlans.push({ draft, action: Object.keys(patch).length ? 'update' : 'unchanged', matchedId: match.id, patch })
      } else {
        postPlans.push({ draft, action: 'insert', matchedId: null, patch: {} })
      }
    }

    const postsPreview = postPlans.map((p) => ({
      action: p.action,
      matchedId: p.matchedId,
      externalRef: p.draft.externalRef,
      source: p.draft.source,
      sourceRow: p.draft.sourceRow,
      name: p.draft.name,
      contactName: p.draft.contactName,
      store: p.draft.store,
      shootingDate: p.draft.shootingDate,
      publishDate: p.draft.publishDate,
      status: p.draft.status,
      paymentStatus: p.draft.paymentStatus,
      budget: p.draft.budget,
      actualCost: p.draft.actualCost,
      linkCount: Object.keys(p.draft.platformLinks).length,
      changedFields: Object.keys(p.patch),
    }))

    const postsSummary = {
      trackerSheet: trackerName,
      hiredSheet: hiredName,
      trackerRows: jobs.trackerRows,
      hiredLinkRows: jobs.hiredLinkRows,
      total: postPlans.length,
      toInsert: postPlans.filter((p) => p.action === 'insert').length,
      toUpdate: postPlans.filter((p) => p.action === 'update').length,
      unchanged: postPlans.filter((p) => p.action === 'unchanged').length,
    }

    const summary = {
      sheetName,
      sheetNames: wb.SheetNames,
      headerRow: parsed.headerRow,
      dataRows: parsed.dataRows,
      skippedRows: parsed.skippedRows,
      mergedDuplicates: parsed.mergedDuplicates,
      profiles: profileDrafts.length,
      toInsert: toInsert.length,
      toUpdate: toUpdate.length,
      unchanged: profileDrafts.length - toInsert.length - toUpdate.length,
      posts: postsSummary,
    }

    if (dryRun) {
      return NextResponse.json({ success: true, dryRun: true, summary, warnings, preview, postsPreview }, { headers })
    }

    const createdBy = String(auth.name || '').trim()
    const now = new Date().toISOString()
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200).map((d) =>
        stampSaasTenantId({ ...profileFieldsToRow(d), created_by: createdBy, updated_at: now }, tenantScope, TABLE)
      )
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

    let postsInserted = 0
    let postsUpdated = 0
    let jobColumnsMissing = false
    if (postPlans.some((p) => p.action !== 'unchanged')) {
      // 새로 만든 명부 ID 포함해 다시 조회
      const freshRows = (await supabaseSelectFilter(TABLE, appendSaasTenantFilter('id=gt.0', tenantScope, TABLE), {
        limit: 5000,
        select: 'id,tiktok_handle,display_name',
      })) as Record<string, unknown>[]
      const idByKey = new Map<string, string>()
      for (const r of freshRows || []) {
        idByKey.set(
          influencerProfileDedupeKey({ tiktokHandle: str(r.tiktok_handle), displayName: str(r.display_name) }),
          str(r.id)
        )
      }

      const runWithFallback = async (row: Record<string, unknown>, run: (r: Record<string, unknown>) => Promise<unknown>) => {
        if (jobColumnsMissing) return run(withoutJobColumns(row))
        try {
          return await run(row)
        } catch (e) {
          if (!isColumnSchemaError(e) || !JOB_COLUMNS.some((c) => String(e).includes(c))) throw e
          jobColumnsMissing = true
          return run(withoutJobColumns(row))
        }
      }

      for (const plan of postPlans) {
        const d = plan.draft
        const profileId = d.profileKey ? idByKey.get(d.profileKey) ?? null : null
        if (plan.action === 'update' && plan.matchedId) {
          const patch = { ...plan.patch }
          if (!patch.profile_id && profileId && !existingPosts.find((e) => e.id === plan.matchedId)?.profileId) {
            patch.profile_id = Number(profileId)
          }
          await runWithFallback(patch, (r) =>
            supabaseUpdateByFilter(POSTS, appendSaasTenantFilter(`id=eq.${plan.matchedId}`, tenantScope, POSTS), r)
          )
          postsUpdated++
        } else if (plan.action === 'insert') {
          const prof = draftByKey.get(d.profileKey)
          const followers = prof
            ? Math.max(prof.tiktokFollowers || 0, prof.instagramFollowers || 0, prof.facebookFollowers || 0)
            : 0
          const row = stampSaasTenantId(
            {
              campaign_id: null,
              profile_id: profileId ? Number(profileId) : null,
              name: d.name,
              contact_name: d.contactName,
              contact_phone: d.contactPhone,
              provided_menus: [],
              followers: followers > 0 ? formatFollowersShort(followers) : '',
              content_format: d.contentFormat,
              content_topic: '',
              status: d.status,
              branch_review: d.store,
              hire_type: d.hireType,
              budget: d.budget,
              actual_cost: d.actualCost,
              shooting_date: d.shootingDate,
              publish_date: d.publishDate,
              platform_links: d.platformLinks,
              note: d.note,
              payment_status: d.paymentStatus,
              paid_at: d.paidAt,
              external_ref: d.externalRef,
            },
            tenantScope,
            POSTS
          )
          await runWithFallback(row, (r) => supabaseInsertMany(POSTS, [r]))
          postsInserted++
        }
      }
      if (jobColumnsMissing) {
        warnings.push(
          '지급 상태·시트 행 키 컬럼이 없어 일부 값을 저장하지 못했습니다. sql/marketing_influencer_profiles_06_post_job_columns.sql 실행 후 다시 가져오면 채워집니다.'
        )
      }
    }

    const postMsg = postPlans.length
      ? ` / 업로드 기록: 신규 ${postsInserted}건, 보완 ${postsUpdated}건, 변경 없음 ${postsSummary.unchanged}건`
      : ''
    return NextResponse.json(
      {
        success: true,
        dryRun: false,
        summary,
        warnings,
        message: `명부 가져오기 완료: 신규 ${inserted}명, 보완 ${updated}명, 변경 없음 ${summary.unchanged}명${postMsg}`,
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
