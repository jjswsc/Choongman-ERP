/**
 * 구글 시트 INFLUENCER_DB(xlsx 내보내기) → 인플루언서 명부 초안. 순수 함수.
 */
import {
  cleanSheetCell,
  extractThaiPhone,
  isSheetPlaceholder,
  mapSheetStoreToErp,
  mapThaiPipelineStatus,
  minRateAcross,
  normalizeInstagramHandle,
  normalizeTiktokHandle,
  parseFollowersCount,
  parseSheetDateYmd,
  splitContentCategories,
  type InfluencerPipelineStatus,
} from './marketing-influencer-profile'

export type InfluencerProfileFields = {
  displayName: string
  contentCategories: string[]
  tiktokUrl: string
  tiktokHandle: string
  tiktokFollowers: number | null
  instagramUrl: string
  instagramHandle: string
  instagramFollowers: number | null
  facebookUrl: string
  facebookFollowers: number | null
  contact: string
  contactName: string
  contactPhone: string
  rateTiktok: string
  rateInstagram: string
  rateFacebook: string
  ratePackage: string
  rateMinThb: number | null
  rateIncludes: string
  extraCost: string
  preferredStore: string
  rateInquiredAt: string | null
  pipelineStatus: InfluencerPipelineStatus
  rateCardUrl: string
  note: string
}

export type InfluencerProfileDraft = InfluencerProfileFields & { sourceRows: number[] }

export type InfluencerSheetParseResult = {
  profiles: InfluencerProfileDraft[]
  warnings: string[]
  headerRow: number
  dataRows: number
  skippedRows: number
  mergedDuplicates: number
}

export function emptyInfluencerProfileFields(): InfluencerProfileFields {
  return {
    displayName: '',
    contentCategories: [],
    tiktokUrl: '',
    tiktokHandle: '',
    tiktokFollowers: null,
    instagramUrl: '',
    instagramHandle: '',
    instagramFollowers: null,
    facebookUrl: '',
    facebookFollowers: null,
    contact: '',
    contactName: '',
    contactPhone: '',
    rateTiktok: '',
    rateInstagram: '',
    rateFacebook: '',
    ratePackage: '',
    rateMinThb: null,
    rateIncludes: '',
    extraCost: '',
    preferredStore: '',
    rateInquiredAt: null,
    pipelineStatus: 'waiting',
    rateCardUrl: '',
    note: '',
  }
}

type ColKey =
  | 'name'
  | 'category'
  | 'tiktokUrl'
  | 'tiktokFollowers'
  | 'instagramUrl'
  | 'instagramFollowers'
  | 'facebookUrl'
  | 'facebookFollowers'
  | 'contact'
  | 'rateTiktok'
  | 'rateInstagram'
  | 'rateFacebook'
  | 'ratePackage'
  | 'rateIncludes'
  | 'extraCost'
  | 'store'
  | 'inquiredAt'
  | 'status'
  | 'rateCard'
  | 'note'

/** 시트 기본 열 순서(A=ลำดับ) — 헤더를 못 찾을 때 사용 */
const DEFAULT_COLS: Record<ColKey, number> = {
  name: 1,
  category: 2,
  tiktokUrl: 3,
  tiktokFollowers: 4,
  instagramUrl: 5,
  instagramFollowers: 6,
  facebookUrl: 7,
  facebookFollowers: 8,
  contact: 9,
  rateTiktok: 10,
  rateInstagram: 11,
  rateFacebook: 12,
  ratePackage: 13,
  rateIncludes: 14,
  extraCost: 15,
  store: 16,
  inquiredAt: 17,
  status: 18,
  rateCard: 19,
  note: 20,
}

function normHeader(v: unknown): string {
  return String(v ?? '')
    .replace(/[=\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function headerToKey(h: string): ColKey | null {
  if (!h) return null
  const has = (s: string) => h.includes(s)
  if (has('ผู้ติดตาม') || has('follower')) {
    if (has('tiktok')) return 'tiktokFollowers'
    if (has('instagram')) return 'instagramFollowers'
    if (has('facebook')) return 'facebookFollowers'
    return null
  }
  if (has('เรท') || has('rate')) {
    if (has('card') || has('ลิงก์')) return 'rateCard'
    if (has('tiktok')) return 'rateTiktok'
    if (has('instagram')) return 'rateInstagram'
    if (has('facebook')) return 'rateFacebook'
    if (has('แพ็กเกจ') || has('package')) return 'ratePackage'
    if (has('วันที่') || has('date')) return 'inquiredAt'
  }
  if (h === 'tiktok') return 'tiktokUrl'
  if (h === 'instagram') return 'instagramUrl'
  if (h === 'facebook') return 'facebookUrl'
  if (has('ชื่ออินฟลู') || has('ชื่อช่อง') || h === 'name') return 'name'
  if (has('ประเภทคอนเทนต์') || has('content type') || has('category')) return 'category'
  if (has('ช่องทางติดต่อ') || has('contact')) return 'contact'
  if (has('รายละเอียดที่รวม') || has('include')) return 'rateIncludes'
  if (has('ค่าใช้จ่ายเพิ่มเติม') || has('extra')) return 'extraCost'
  if (has('พื้นที่รับงาน') || has('store') || has('area')) return 'store'
  if (has('วันที่') || has('date')) return 'inquiredAt'
  if (has('สถานะ') || has('status')) return 'status'
  if (has('หมายเหตุ') || has('note') || has('memo')) return 'note'
  return null
}

function detectHeader(rows: unknown[][]): { headerRow: number; cols: Record<ColKey, number> } | null {
  const scan = Math.min(rows.length, 8)
  for (let r = 0; r < scan; r++) {
    const row = rows[r] || []
    const cols: Partial<Record<ColKey, number>> = {}
    row.forEach((cell, idx) => {
      const k = headerToKey(normHeader(cell))
      if (k && cols[k] == null) cols[k] = idx
    })
    if (cols.tiktokUrl != null && cols.name != null) {
      return { headerRow: r, cols: { ...DEFAULT_COLS, ...cols } as Record<ColKey, number> }
    }
  }
  return null
}

type Platform = 'tiktok' | 'instagram' | 'facebook'

function urlPlatform(s: string): Platform | null {
  if (/tiktok\.com\//i.test(s)) return 'tiktok'
  if (/instagram\.com\//i.test(s)) return 'instagram'
  if (/facebook\.com\//i.test(s) || /fb\.com\//i.test(s)) return 'facebook'
  return null
}

const PLATFORM_URL_COL: Record<Platform, ColKey> = {
  tiktok: 'tiktokUrl',
  instagram: 'instagramUrl',
  facebook: 'facebookUrl',
}

const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
}

export function influencerProfileDedupeKey(p: Pick<InfluencerProfileFields, 'tiktokHandle' | 'displayName'>): string {
  const h = (p.tiktokHandle || '').trim().toLowerCase()
  if (h) return `tt:${h}`
  return `nm:${(p.displayName || '').trim().toLowerCase()}`
}

const TEXT_FIELDS = [
  'displayName',
  'tiktokUrl',
  'tiktokHandle',
  'instagramUrl',
  'instagramHandle',
  'facebookUrl',
  'contact',
  'contactName',
  'contactPhone',
  'rateTiktok',
  'rateInstagram',
  'rateFacebook',
  'ratePackage',
  'rateIncludes',
  'extraCost',
  'preferredStore',
  'rateCardUrl',
] as const

const NUM_FIELDS = ['tiktokFollowers', 'instagramFollowers', 'facebookFollowers', 'rateMinThb'] as const

/**
 * 기존 값이 비어 있는 필드만 incoming 으로 채운 patch.
 * 섭외 상태는 기존이 waiting 일 때만 덮어쓰고, 문의일은 더 최근 값으로.
 */
export function fillEmptyInfluencerProfileFields(
  existing: InfluencerProfileFields,
  incoming: InfluencerProfileFields
): Partial<InfluencerProfileFields> {
  const patch: Partial<InfluencerProfileFields> = {}
  for (const f of TEXT_FIELDS) {
    if (!String(existing[f] || '').trim() && String(incoming[f] || '').trim()) {
      ;(patch as Record<string, unknown>)[f] = incoming[f]
    }
  }
  for (const f of NUM_FIELDS) {
    if (existing[f] == null && incoming[f] != null) (patch as Record<string, unknown>)[f] = incoming[f]
  }
  const cats = [...existing.contentCategories]
  for (const c of incoming.contentCategories) if (!cats.includes(c)) cats.push(c)
  if (cats.length !== existing.contentCategories.length) patch.contentCategories = cats
  if (existing.pipelineStatus === 'waiting' && incoming.pipelineStatus !== 'waiting') {
    patch.pipelineStatus = incoming.pipelineStatus
  }
  if (incoming.rateInquiredAt && (!existing.rateInquiredAt || incoming.rateInquiredAt > existing.rateInquiredAt)) {
    patch.rateInquiredAt = incoming.rateInquiredAt
  }
  const en = existing.note.trim()
  const inn = incoming.note.trim()
  if (inn && !en.includes(inn)) patch.note = en ? `${en}\n${inn}` : inn
  return patch
}

export function parseInfluencerSheetRows(
  rows: unknown[][],
  stores: readonly string[] = []
): InfluencerSheetParseResult {
  const warnings: string[] = []
  const detected = detectHeader(rows)
  const headerRow = detected?.headerRow ?? 0
  const cols = detected?.cols ?? DEFAULT_COLS
  if (!detected) warnings.push('헤더(TikTok·이름 열)를 찾지 못해 기본 열 순서(A=ลำดับ, B=이름 …)로 읽었습니다.')

  const byKey = new Map<string, InfluencerProfileDraft>()
  let dataRows = 0
  let skippedRows = 0
  let mergedDuplicates = 0

  for (let r = headerRow + 1; r < rows.length; r++) {
    const raw = rows[r] || []
    const sheetRowNo = r + 1
    if (raw.every((c) => isSheetPlaceholder(c))) continue
    dataRows++

    const cells = raw.map((c) => cleanSheetCell(c))
    const at = (k: ColKey) => cells[cols[k]] ?? ''
    const usedIdx = new Set<number>()
    const urls: Record<Platform, string> = { tiktok: '', instagram: '', facebook: '' }
    const shiftedNotes: string[] = []

    for (const p of ['tiktok', 'instagram', 'facebook'] as Platform[]) {
      const idx = cols[PLATFORM_URL_COL[p]]
      const v = cells[idx] ?? ''
      if (!v) continue
      if (urlPlatform(v) === p) {
        urls[p] = v
        usedIdx.add(idx)
      } else if (!urlPlatform(v)) {
        shiftedNotes.push(`[${PLATFORM_LABEL[p]}열] ${v}`)
        usedIdx.add(idx)
      }
    }
    cells.forEach((v, idx) => {
      if (!v || usedIdx.has(idx)) return
      const p = urlPlatform(v)
      if (p && !urls[p]) {
        urls[p] = v
        usedIdx.add(idx)
        warnings.push(`${sheetRowNo}행: ${PLATFORM_LABEL[p]} 링크가 다른 열에 있어 URL 기준으로 재배치했습니다.`)
      }
    })

    const name = at('name')
    const tiktokHandle = normalizeTiktokHandle(urls.tiktok)
    if (!name && !tiktokHandle) {
      skippedRows++
      continue
    }
    if (shiftedNotes.length) {
      warnings.push(`${sheetRowNo}행: SNS 링크 열에 URL이 아닌 값이 있어 메모로 옮겼습니다.`)
    }

    const contact = at('contact')
    const rateTiktok = at('rateTiktok')
    const rateInstagram = at('rateInstagram')
    const rateFacebook = at('rateFacebook')
    const ratePackage = at('ratePackage')
    const statusRaw = at('status')
    const status = mapThaiPipelineStatus(statusRaw)
    if (statusRaw && !status) warnings.push(`${sheetRowNo}행: 상태 "${statusRaw}"를 해석하지 못해 '대기'로 저장합니다.`)

    const note = [at('note'), ...shiftedNotes].filter(Boolean).join('\n')
    const draft: InfluencerProfileDraft = {
      displayName: name || tiktokHandle,
      contentCategories: urlPlatform(at('category')) ? [] : splitContentCategories(at('category')),
      tiktokUrl: urls.tiktok,
      tiktokHandle,
      tiktokFollowers: parseFollowersCount(at('tiktokFollowers')),
      instagramUrl: urls.instagram,
      instagramHandle: normalizeInstagramHandle(urls.instagram),
      instagramFollowers: parseFollowersCount(at('instagramFollowers')),
      facebookUrl: urls.facebook,
      facebookFollowers: parseFollowersCount(at('facebookFollowers')),
      contact,
      contactName: '',
      contactPhone: extractThaiPhone(contact),
      rateTiktok,
      rateInstagram,
      rateFacebook,
      ratePackage,
      rateMinThb: minRateAcross(rateTiktok, rateInstagram, rateFacebook, ratePackage),
      rateIncludes: at('rateIncludes'),
      extraCost: at('extraCost'),
      preferredStore: mapSheetStoreToErp(at('store'), stores),
      rateInquiredAt: parseSheetDateYmd(raw[cols.inquiredAt]),
      pipelineStatus: status ?? 'waiting',
      rateCardUrl: at('rateCard'),
      note,
      sourceRows: [sheetRowNo],
    }

    const key = influencerProfileDedupeKey(draft)
    const prev = byKey.get(key)
    if (prev) {
      mergedDuplicates++
      Object.assign(prev, fillEmptyInfluencerProfileFields(prev, draft))
      prev.sourceRows.push(sheetRowNo)
    } else {
      byKey.set(key, draft)
    }
  }

  return {
    profiles: [...byKey.values()],
    warnings,
    headerRow: headerRow + 1,
    dataRows,
    skippedRows,
    mergedDuplicates,
  }
}
