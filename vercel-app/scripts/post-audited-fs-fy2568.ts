/**
 * FY2568(2025) 감사 재무제표 → 세무 장부 계정과목별 전기 + 스냅샷 upsert.
 *
 * - 기초(tax_opening): 전기 말 BS (ACT는 설립일 자본금)
 * - 발생(tax_adjustment): BS 증감(RE 제외) + 당기 손익 계정
 * - S&J/Jinwon/ACT의 2026-07-01 Flow 기초는 유지
 * - Bangna Bizzo 법인(영업=CM Union Mall) 2026-01-01 기초도 유지. CM Bangna(가맹)과 별개.
 *
 * 사전: audited_financial_statements_01_table.sql
 * npx tsx scripts/post-audited-fs-fy2568.ts --dry
 * npx tsx scripts/post-audited-fs-fy2568.ts
 * npx tsx scripts/post-audited-fs-fy2568.ts --skip-journals
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import {
  AUDITED_FS_FY2568,
  BANGNA_BIZZO_OPENING_DATE,
  BANGNA_BIZZO_OPERATING_STORE,
  BANGNA_BIZZO_TAX_ENTITY,
  BANGNA_BIZZO_TAX_ID,
  buildAuditedYearActivityLines,
  buildOpeningLinesFromAuditedBs,
  incorporationOpeningBs,
  type AuditedFinancialStatementSnapshot,
} from '../lib/audited-financial-statements'
import { accountLine } from '../lib/chart-of-accounts-mapping'
import { TAX_BOOK, voucherKindForSourceType, type TaxJournalLineDraft } from '../lib/tax-book'

const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '')
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')
  process.exit(1)
}

const headers: Record<string, string> = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

const dry = process.argv.includes('--dry')
const skipJournals = process.argv.includes('--skip-journals')
const skipSnapshots = process.argv.includes('--skip-snapshots')
const onlyTin = (() => {
  const i = process.argv.indexOf('--only')
  return i >= 0 ? String(process.argv[i + 1] || '').trim() : ''
})()

async function rest(p: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/${p}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${p}: ${text.slice(0, 800)}`)
  return text ? JSON.parse(text) : null
}

async function replaceJournal(input: {
  taxEntityCode: string
  sourceType: string
  sourceId: number
  accountingDate: string
  entryNo: string
  memo: string
  lines: TaxJournalLineDraft[]
  postedBy: string
}) {
  const existing = (await rest(
    `journal_entries?select=id&source_type=eq.${encodeURIComponent(input.sourceType)}&source_id=eq.${input.sourceId}&book=eq.${TAX_BOOK}&tax_entity_code=eq.${encodeURIComponent(input.taxEntityCode)}`
  )) as { id?: number }[]
  const oldIds = (existing || []).map((r) => Number(r.id || 0)).filter((id) => id > 0)
  if (oldIds.length) {
    const idList = oldIds.join(',')
    await rest(`journal_lines?journal_entry_id=in.(${idList})`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=minimal' },
    })
    await rest(`journal_entries?id=in.(${idList})`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=minimal' },
    })
    console.log('  replaced', oldIds)
  }

  const inserted = (await rest('journal_entries', {
    method: 'POST',
    body: JSON.stringify({
      entry_no: input.entryNo,
      accounting_date: input.accountingDate,
      source_type: input.sourceType,
      source_id: input.sourceId,
      store_name: input.taxEntityCode,
      memo: input.memo,
      posted_by: input.postedBy,
      book: TAX_BOOK,
      voucher_kind: voucherKindForSourceType(input.sourceType),
      tax_entity_code: input.taxEntityCode,
    }),
  })) as { id?: number }[]
  const entryId = Number(inserted?.[0]?.id || 0)
  if (!entryId) throw new Error('INSERT_ENTRY_FAILED')

  await rest('journal_lines', {
    method: 'POST',
    body: JSON.stringify(
      input.lines.map((ln, i) => {
        const meta = accountLine(ln.accountCode)
        return {
          journal_entry_id: entryId,
          line_no: i + 1,
          account_code: ln.accountCode,
          account_name: ln.accountName || meta.accountName,
          side: ln.side,
          amount: ln.amount,
          memo: null,
        }
      })
    ),
  })
  return entryId
}

async function upsertSnapshots() {
  const rows = AUDITED_FS_FY2568.map((r) => ({
    tax_id: r.taxId,
    tax_entity_code: r.taxEntityCode,
    entity_name_th: r.entityNameTh,
    entity_name_en: r.entityNameEn,
    fiscal_year_end: r.fiscalYearEnd,
    fiscal_year_be: r.fiscalYearBe,
    period_start: r.periodStart,
    period_end: r.periodEnd,
    source_label: r.sourceLabel,
    bs: r.bs,
    pl: r.pl,
    prior_bs: r.priorBs ?? null,
    prior_pl: r.priorPl ?? null,
    updated_at: new Date().toISOString(),
    updated_by: 'script:post-audited-fs-fy2568',
  }))
  console.log('snapshots', rows.length, dry ? '(dry)' : '')
  if (dry) return
  const inserted = await rest('audited_financial_statements?on_conflict=tax_id,fiscal_year_end', {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  console.log(
    'upserted',
    Array.isArray(inserted) ? inserted.length : inserted,
    (inserted || []).map((x: { tax_id?: string; id?: number }) => `${x.tax_id}#${x.id}`)
  )
}

function openingMeta(row: AuditedFinancialStatementSnapshot) {
  if (!row.priorBs) {
    return {
      date: row.periodStart,
      sourceId: Number(row.periodStart.replace(/-/g, '')),
      bs: incorporationOpeningBs(row.bs.shareCapital),
      label: '설립(자본금)',
    }
  }
  return {
    date: row.periodStart,
    sourceId: Number(row.periodStart.replace(/-/g, '')),
    bs: row.priorBs,
    label: '전기말 BS',
  }
}

async function postEntityYear(row: AuditedFinancialStatementSnapshot) {
  const open = openingMeta(row)
  const openLines = buildOpeningLinesFromAuditedBs(open.bs)
  const activityLines = buildAuditedYearActivityLines({
    openingBs: open.bs,
    endingBs: row.bs,
    pl: row.pl,
  })
  const slug = row.taxId.slice(-4)
  console.log('\n====', row.entityNameEn, row.taxEntityCode, '====')
  console.log({
    opening: open.date,
    openingLines: openLines.length,
    activityLines: activityLines.length,
    ni: row.pl.netIncome,
    dry,
  })

  if (dry) {
    console.log('opening sample', openLines.slice(0, 3))
    console.log('activity sample', activityLines.slice(0, 5))
    return
  }

  const openId = await replaceJournal({
    taxEntityCode: row.taxEntityCode,
    sourceType: 'tax_opening',
    sourceId: open.sourceId,
    accountingDate: open.date,
    entryNo: `JE-OPEN-${open.date}-${slug}`,
    memo: `감사FS YE2568 기초 ${open.label} ${row.entityNameEn}`,
    lines: openLines,
    postedBy: 'audited-fs-fy2568-script',
  })
  console.log('  opening entry', openId)

  const actId = await replaceJournal({
    taxEntityCode: row.taxEntityCode,
    sourceType: 'tax_adjustment',
    sourceId: 20251231,
    accountingDate: row.periodEnd,
    entryNo: `JE-FS2568-${row.periodEnd}-${slug}`,
    memo: `감사FS YE2568 당기 증감·손익(계정과목) ${row.entityNameEn}`,
    lines: activityLines,
    postedBy: 'audited-fs-fy2568-script',
  })
  console.log('  activity entry', actId)
}

/** Bangna Bizzo 법인(유니온몰) 2026-01-01 기초가 없으면 말 BS로 보강 */
async function ensureBangna2026Opening() {
  const bangna = AUDITED_FS_FY2568.find((r) => r.taxId === BANGNA_BIZZO_TAX_ID)
  if (!bangna) return
  const existing = (await rest(
    `journal_entries?select=id&source_type=eq.tax_opening&source_id=eq.20260101&book=eq.${TAX_BOOK}&tax_entity_code=eq.${encodeURIComponent(BANGNA_BIZZO_TAX_ENTITY)}`
  )) as { id?: number }[]
  if ((existing || []).length) {
    console.log(
      `\nBangna Bizzo(${BANGNA_BIZZO_OPERATING_STORE}) 2026-01-01 opening already present`,
      existing[0]?.id
    )
    return
  }
  const lines = buildOpeningLinesFromAuditedBs(bangna.bs)
  console.log(`\nBangna Bizzo(${BANGNA_BIZZO_OPERATING_STORE}) 2026-01-01 opening missing — posting`)
  if (dry) return
  const id = await replaceJournal({
    taxEntityCode: BANGNA_BIZZO_TAX_ENTITY,
    sourceType: 'tax_opening',
    sourceId: 20260101,
    accountingDate: BANGNA_BIZZO_OPENING_DATE,
    entryNo: `JE-OPEN-${BANGNA_BIZZO_OPENING_DATE}-union-mall-bizzo`,
    memo: `감사FS YE2568→세무 기초 ${BANGNA_BIZZO_OPENING_DATE} Bangna Bizzo 법인(${BANGNA_BIZZO_OPERATING_STORE}, CM Bangna 아님)`,
    lines,
    postedBy: 'audited-fs-fy2568-script',
  })
  console.log('  union-mall bizzo 2026 opening', id)
}

async function main() {
  const targets = onlyTin
    ? AUDITED_FS_FY2568.filter((r) => r.taxId === onlyTin || r.taxEntityCode.includes(onlyTin))
    : AUDITED_FS_FY2568
  if (!targets.length) throw new Error('NO_TARGETS')

  if (!skipSnapshots) {
    try {
      await upsertSnapshots()
    } catch (e) {
      const msg = String(e || '')
      if (msg.includes('404') || msg.includes('PGRST') || msg.includes('audited_financial_statements')) {
        console.error(
          '\n스냅샷 테이블이 없습니다. audited_financial_statements_01_table.sql 을 먼저 실행하세요.\n'
        )
        throw e
      }
      throw e
    }
  }

  if (!skipJournals) {
    for (const row of targets) {
      await postEntityYear(row)
    }
    if (!onlyTin || onlyTin.includes(BANGNA_BIZZO_TAX_ID) || onlyTin.includes('3161764')) {
      await ensureBangna2026Opening()
    }
  }

  console.log('\ndone')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
