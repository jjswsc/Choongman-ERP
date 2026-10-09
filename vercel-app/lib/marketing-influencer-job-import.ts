/**
 * 구글 시트 CAMPAIGN_TRACKER(작업·비용·지급) + Hired(ผลงาน 결과물 링크) → 업로드 기록 초안. 순수 함수.
 */
import {
  cleanSheetCell,
  contentUrlPlatform,
  extractThaiPhone,
  extractUrls,
  mapSheetStoreToErp,
  mapThaiJobStatus,
  mapThaiPaymentStatus,
  normalizeTiktokHandle,
  parseRateMinThb,
  parseSheetDateYmd,
  parseThbAmount,
  tiktokVideoPostedYmd,
  type InfluencerPaymentStatus,
  type InfluencerPostStatus,
} from './marketing-influencer-profile'
import {
  detectInfluencerSheetColumns,
  influencerProfileDedupeKey,
  type InfluencerProfileDraft,
} from './marketing-influencer-sheet-import'

export type InfluencerPostDraft = {
  /** 재가져오기 시 같은 행을 찾는 키 — `sheet:ct:<Job No>` / `sheet:hired:<handle>` */
  externalRef: string
  source: 'tracker' | 'hired'
  sourceRow: number
  /** 명부 dedupe 키(`tt:handle` / `nm:name`). 명부에서 못 찾으면 '' */
  profileKey: string
  name: string
  contactName: string
  contactPhone: string
  store: string
  shootingDate: string | null
  publishDate: string | null
  budget: number
  actualCost: number
  status: InfluencerPostStatus
  hireType: 'pay' | 'free'
  paymentStatus: InfluencerPaymentStatus | ''
  paidAt: string | null
  platformLinks: Record<string, string>
  contentFormat: string
  note: string
}

export type InfluencerJobSheetParseResult = {
  posts: InfluencerPostDraft[]
  warnings: string[]
  trackerRows: number
  hiredLinkRows: number
}

type TrackerCol =
  | 'jobNo'
  | 'name'
  | 'seq'
  | 'contact'
  | 'campaign'
  | 'store'
  | 'platform'
  | 'visit'
  | 'post'
  | 'refRate'
  | 'agreed'
  | 'travel'
  | 'other'
  | 'total'
  | 'jobStatus'
  | 'payStatus'
  | 'paidAt'
  | 'link'

function normHeader(v: unknown): string {
  return String(v ?? '')
    .replace(/[=\u200b]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function trackerHeaderKey(h: string): TrackerCol | null {
  if (!h) return null
  const has = (s: string) => h.includes(s)
  if (has('สถานะงาน') || has('job status')) return 'jobStatus'
  if (has('สถานะชำระ') || has('payment status')) return 'payStatus'
  if (has('วันที่ชำระ') || has('paid date') || h === 'paid at') return 'paidAt'
  if (h.startsWith('job no') || h === 'job' || h === 'job #') return 'jobNo'
  if (has('influencer id') || h === 'id') return 'seq'
  if (h === 'influencer' || has('ชื่ออินฟลู')) return 'name'
  if (has('ช่องทางติดต่อ') || has('contact')) return 'contact'
  if (has('campaign') || has('แคมเปญ')) return 'campaign'
  if (has('สาขา') || h === 'store' || h === 'branch') return 'store'
  if (has('platform') || has('แพลตฟอร์ม')) return 'platform'
  if (has('เข้าร้าน') || has('visit')) return 'visit'
  if (has('โพสต์') || has('post date')) return 'post'
  if (has('เรทอ้างอิง') || has('reference')) return 'refRate'
  if (has('ราคาตกลง') || has('agreed')) return 'agreed'
  if (has('ค่าเดินทาง') || has('travel')) return 'travel'
  if (has('ค่าใช้จ่ายรวม') || has('total')) return 'total'
  if (has('ค่าใช้จ่ายอื่น') || has('other cost')) return 'other'
  if (has('link') || has('ลิงก์')) return 'link'
  return null
}

function detectTrackerHeader(rows: unknown[][]): { headerRow: number; cols: Partial<Record<TrackerCol, number>> } | null {
  const scan = Math.min(rows.length, 8)
  for (let r = 0; r < scan; r++) {
    const cols: Partial<Record<TrackerCol, number>> = {}
    ;(rows[r] || []).forEach((cell, idx) => {
      const k = trackerHeaderKey(normHeader(cell))
      if (k && cols[k] == null) cols[k] = idx
    })
    if (cols.name != null && (cols.seq != null || cols.jobNo != null)) return { headerRow: r, cols }
  }
  return null
}

const LINK_PLATFORM_KEYS = ['tiktok', 'instagram', 'facebook', 'youtube', 'lemon8'] as const

/** URL 목록 → platform_links(플랫폼별 첫 링크) + 나머지(메모용) */
export function urlsToPlatformLinks(urls: readonly string[]): { links: Record<string, string>; extra: string[] } {
  const links: Record<string, string> = {}
  const extra: string[] = []
  for (const u of urls) {
    const p = contentUrlPlatform(u)
    if ((LINK_PLATFORM_KEYS as readonly string[]).includes(p) && !links[p]) links[p] = u
    else extra.push(u)
  }
  return { links, extra }
}

type ProfileIndex = {
  bySeq: Map<number, InfluencerProfileDraft>
  byHandle: Map<string, InfluencerProfileDraft>
  byName: Map<string, InfluencerProfileDraft>
}

function indexProfiles(profiles: readonly InfluencerProfileDraft[]): ProfileIndex {
  const bySeq = new Map<number, InfluencerProfileDraft>()
  const byHandle = new Map<string, InfluencerProfileDraft>()
  const byName = new Map<string, InfluencerProfileDraft>()
  for (const p of profiles) {
    for (const s of p.sheetSeqs || []) if (!bySeq.has(s)) bySeq.set(s, p)
    if (p.tiktokHandle && !byHandle.has(p.tiktokHandle)) byHandle.set(p.tiktokHandle, p)
    const nm = p.displayName.trim().toLowerCase()
    if (nm && !byName.has(nm)) byName.set(nm, p)
  }
  return { bySeq, byHandle, byName }
}

function findProfile(
  idx: ProfileIndex,
  q: { seq?: unknown; handle?: string; name?: string }
): InfluencerProfileDraft | undefined {
  const seq = Number(q.seq)
  if (Number.isInteger(seq) && seq > 0 && idx.bySeq.has(seq)) return idx.bySeq.get(seq)
  if (q.handle && idx.byHandle.has(q.handle)) return idx.byHandle.get(q.handle)
  const nm = (q.name || '').trim().toLowerCase()
  if (nm && idx.byName.has(nm)) return idx.byName.get(nm)
  const h = normalizeTiktokHandle(q.name)
  return h ? idx.byHandle.get(h) : undefined
}

type HiredBucket = { profile: InfluencerProfileDraft; urls: string[]; rows: number[] }

/**
 * Hired 시트 ผลงาน 열 → 인플루언서별 결과물 링크.
 * 시트에서 링크가 한 행씩 밀려 입력되는 경우가 있어, 셀 안 TikTok 영상 URL의 @핸들을 소유자로 본다.
 */
function collectHiredLinks(rows: unknown[][], idx: ProfileIndex, warnings: string[]): Map<string, HiredBucket> {
  const out = new Map<string, HiredBucket>()
  const det = detectInfluencerSheetColumns(rows)
  if (!det || det.cols.works < 0) return out
  const { headerRow, cols } = det
  for (let r = headerRow + 1; r < rows.length; r++) {
    const raw = rows[r] || []
    const sheetRowNo = r + 1
    const name = cleanSheetCell(raw[cols.name])
    const rowHandle = normalizeTiktokHandle(raw[cols.tiktokUrl])
    const urls = extractUrls(raw[cols.works])
    if (!urls.length) continue
    const rowProfile = findProfile(idx, { seq: raw[cols.seq], handle: rowHandle, name })
    let owner = rowProfile
    const ownerHandle = urls.map((u) => (contentUrlPlatform(u) === 'tiktok' ? normalizeTiktokHandle(u) : '')).find(Boolean)
    if (ownerHandle) {
      const byHandle = idx.byHandle.get(ownerHandle)
      if (byHandle && byHandle !== rowProfile) {
        owner = byHandle
        warnings.push(
          `Hired ${sheetRowNo}행(${rowProfile?.displayName || name}): 결과물 링크가 @${ownerHandle} 영상이라 해당 인플루언서 기록에 연결했습니다.`
        )
      } else if (!byHandle && rowProfile && ownerHandle !== rowProfile.tiktokHandle) {
        warnings.push(`Hired ${sheetRowNo}행: 결과물 링크 @${ownerHandle} 이(가) 명부에 없어 ${rowProfile.displayName} 기록에 붙였습니다.`)
      }
    }
    if (!owner) {
      warnings.push(`Hired ${sheetRowNo}행: "${name}" 을(를) 명부에서 찾지 못해 결과물 링크를 건너뜁니다.`)
      continue
    }
    const key = influencerProfileDedupeKey(owner)
    const b = out.get(key) ?? { profile: owner, urls: [], rows: [] }
    for (const u of urls) if (!b.urls.includes(u)) b.urls.push(u)
    b.rows.push(sheetRowNo)
    out.set(key, b)
  }
  return out
}

function postName(p: InfluencerProfileDraft | undefined, fallback: string): string {
  return p?.tiktokHandle ? `@${p.tiktokHandle}` : p?.displayName || fallback
}

function barterNote(p: InfluencerProfileDraft | undefined): string {
  const x = (p?.extraCost || '').replace(/[\u0E3A]/g, '').trim()
  return x ? `Barter: ${x}` : ''
}

export function parseInfluencerJobSheets(input: {
  trackerRows?: unknown[][] | null
  hiredRows?: unknown[][] | null
  profiles: readonly InfluencerProfileDraft[]
  stores?: readonly string[]
}): InfluencerJobSheetParseResult {
  const warnings: string[] = []
  const stores = input.stores ?? []
  const idx = indexProfiles(input.profiles)
  const hired = input.hiredRows?.length ? collectHiredLinks(input.hiredRows, idx, warnings) : new Map<string, HiredBucket>()
  let hiredLinkRows = 0
  for (const b of hired.values()) hiredLinkRows += b.rows.length

  const posts: InfluencerPostDraft[] = []
  let trackerRows = 0
  const det = input.trackerRows?.length ? detectTrackerHeader(input.trackerRows) : null
  if (input.trackerRows?.length && !det) warnings.push('CAMPAIGN_TRACKER 헤더(Influencer·Job No. 열)를 찾지 못해 작업 기록을 건너뜁니다.')

  if (det && input.trackerRows) {
    const { headerRow, cols } = det
    const rows = input.trackerRows
    for (let r = headerRow + 1; r < rows.length; r++) {
      const raw = rows[r] || []
      const sheetRowNo = r + 1
      const cellRaw = (k: TrackerCol) => (cols[k] != null ? raw[cols[k]!] : '')
      const cell = (k: TrackerCol) => cleanSheetCell(cellRaw(k))
      const name = cell('name')
      if (!name) continue
      trackerRows++

      const profile = findProfile(idx, { seq: cellRaw('seq'), name })
      if (!profile) warnings.push(`CAMPAIGN_TRACKER ${sheetRowNo}행: "${name}" 을(를) 명부에서 찾지 못해 이름만으로 기록합니다.`)

      const ref = parseRateMinThb(cell('refRate')) ?? parseThbAmount(cellRaw('refRate'))
      const agreed = parseThbAmount(cellRaw('agreed'))
      const travel = parseThbAmount(cellRaw('travel'))
      const other = parseThbAmount(cellRaw('other'))
      const total = parseThbAmount(cellRaw('total')) || agreed + travel + other

      const statusRaw = cell('jobStatus')
      const ownUrls = extractUrls(cellRaw('link'))
      let status = mapThaiJobStatus(statusRaw)
      if (statusRaw && !status) warnings.push(`CAMPAIGN_TRACKER ${sheetRowNo}행: 작업 상태 "${statusRaw}"를 해석하지 못했습니다.`)
      if (!status) status = ownUrls.length ? 'finish' : 'draft'

      const payRaw = cell('payStatus')
      let paymentStatus: InfluencerPaymentStatus | '' = mapThaiPaymentStatus(payRaw) ?? ''
      if (payRaw && !paymentStatus) warnings.push(`CAMPAIGN_TRACKER ${sheetRowNo}행: 지급 상태 "${payRaw}"를 해석하지 못했습니다.`)
      const paidAt = parseSheetDateYmd(cellRaw('paidAt'))
      if (paidAt && !paymentStatus) paymentStatus = 'paid'

      const jobNo = cell('jobNo') || String(sheetRowNo)
      const budget = agreed || ref || profile?.rateMinThb || 0
      const hireType: 'pay' | 'free' = total > 0 || budget > 0 ? 'pay' : 'free'
      const campaign = cell('campaign')
      const noteLines = [
        campaign ? `Campaign: ${campaign}` : '',
        travel > 0 ? `ค่าเดินทาง ${travel.toLocaleString('en-US')}` : '',
        other > 0 ? `ค่าใช้จ่ายอื่น ${other.toLocaleString('en-US')}` : '',
        hireType === 'free' ? barterNote(profile) : '',
      ]

      posts.push({
        externalRef: `sheet:ct:${jobNo}`,
        source: 'tracker',
        sourceRow: sheetRowNo,
        profileKey: profile ? influencerProfileDedupeKey(profile) : '',
        name: postName(profile, name),
        contactName: profile?.displayName || name,
        contactPhone: profile?.contactPhone || extractThaiPhone(cell('contact')),
        store: mapSheetStoreToErp(cell('store'), stores) || profile?.preferredStore || '',
        shootingDate: parseSheetDateYmd(cellRaw('visit')),
        publishDate: parseSheetDateYmd(cellRaw('post')),
        budget,
        actualCost: total,
        status,
        hireType,
        paymentStatus,
        paidAt,
        platformLinks: {},
        contentFormat: cell('platform'),
        note: noteLines.filter(Boolean).join('\n'),
        _ownUrls: ownUrls,
      } as InfluencerPostDraft & { _ownUrls: string[] })
    }
  }

  // Hired 결과물 링크 → 같은 인플루언서의 작업 1건(완료·링크 없는 작업 우선)에 붙이고, 작업이 없으면 Hired 전용 기록
  const withOwn = posts as (InfluencerPostDraft & { _ownUrls?: string[] })[]
  for (const [key, b] of hired) {
    const jobs = withOwn.filter((p) => p.profileKey === key)
    const target =
      jobs.find((p) => p.status === 'finish' && !(p._ownUrls || []).length) ??
      jobs.find((p) => p.status === 'finish') ??
      jobs[0]
    if (target) {
      for (const u of b.urls) if (!(target._ownUrls ||= []).includes(u)) target._ownUrls.push(u)
      continue
    }
    const p = b.profile
    const budget = p.rateMinThb ?? 0
    withOwn.push({
      externalRef: `sheet:hired:${p.tiktokHandle || p.sheetSeqs[0] || p.displayName.trim().toLowerCase()}`,
      source: 'hired',
      sourceRow: b.rows[0] ?? 0,
      profileKey: key,
      name: postName(p, p.displayName),
      contactName: p.displayName,
      contactPhone: p.contactPhone,
      store: p.preferredStore,
      shootingDate: null,
      publishDate: null,
      budget,
      actualCost: 0,
      status: 'finish',
      hireType: budget > 0 ? 'pay' : 'free',
      paymentStatus: '',
      paidAt: null,
      platformLinks: {},
      contentFormat: '',
      note: budget > 0 ? '' : barterNote(p),
      _ownUrls: [...b.urls],
    })
    warnings.push(`Hired: ${p.displayName} 은(는) CAMPAIGN_TRACKER 작업이 없어 결과물 링크만으로 업로드 기록을 만듭니다.`)
  }

  // 결과물(SNS) 링크가 있으면 게시 완료, 게시일이 비면 TikTok 영상 ID 시각으로 보정
  const out: InfluencerPostDraft[] = withOwn.map((p) => {
    const { _ownUrls, ...rest } = p
    const { links, extra } = urlsToPlatformLinks(_ownUrls || [])
    const note = [rest.note, ...extra.map((u) => `Link: ${u}`)].filter(Boolean).join('\n')
    const status: InfluencerPostStatus = Object.keys(links).length ? 'finish' : rest.status
    const publishDate = rest.publishDate || tiktokVideoPostedYmd(links.tiktok)
    return { ...rest, platformLinks: links, note, status, publishDate }
  })

  return { posts: out, warnings, trackerRows, hiredLinkRows }
}

const STATUS_RANK: Record<string, number> = { draft: 0, ongoing: 1, finish: 2 }
const PAYMENT_RANK: Record<string, number> = { '': -1, unpaid: 0, billed: 1, paid: 2 }

/** DB marketing_influencers 행(매칭·병합용 최소 필드) */
export type ExistingInfluencerPostRow = {
  id: string
  profileId: string | null
  name: string
  contactName: string
  contactPhone: string
  branchReview: string
  shootingDate: string | null
  publishDate: string | null
  budget: number
  actualCost: number
  status: string
  contentFormat: string
  paymentStatus: string
  paidAt: string | null
  externalRef: string
  platformLinks: Record<string, string>
  note: string
  expenseAccrualId: string | null
}

export function existingPostHandle(row: Pick<ExistingInfluencerPostRow, 'name' | 'platformLinks'>): string {
  return normalizeTiktokHandle(row.platformLinks?.tiktok) || normalizeTiktokHandle(row.name)
}

function dayDiff(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.abs((Date.parse(a) - Date.parse(b)) / 86400000)
}

/**
 * 시트 초안에 대응하는 기존 업로드 기록 찾기.
 * external_ref 우선 → 같은 인플루언서(profile_id·TikTok 핸들) 중 external_ref 없는 행, 날짜가 가장 가까운 것(60일 초과 차이는 제외).
 */
export function matchExistingInfluencerPost(
  draft: InfluencerPostDraft,
  ctx: { profileId: string | null; handle: string },
  existing: readonly ExistingInfluencerPostRow[],
  taken: ReadonlySet<string>
): ExistingInfluencerPostRow | null {
  const byRef = existing.find((e) => e.externalRef === draft.externalRef)
  if (byRef) return byRef
  const draftDate = draft.publishDate || draft.shootingDate
  let best: ExistingInfluencerPostRow | null = null
  let bestScore = Infinity
  for (const e of existing) {
    if (taken.has(e.id) || e.externalRef) continue
    const same =
      (ctx.profileId && e.profileId === ctx.profileId) || (ctx.handle && existingPostHandle(e) === ctx.handle)
    if (!same) continue
    const d = dayDiff(draftDate, e.publishDate || e.shootingDate)
    if (d != null && d > 60) continue
    const score = d ?? 30
    if (score < bestScore) {
      best = e
      bestScore = score
    }
  }
  return best
}

/** 기존 기록에서 비어 있는 값만 시트로 채우는 patch(DB 컬럼명). 상태·지급은 더 진행된 쪽으로만 올림 */
export function buildInfluencerPostFillPatch(
  existing: ExistingInfluencerPostRow,
  draft: InfluencerPostDraft,
  profileId: string | null
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (!existing.externalRef) patch.external_ref = draft.externalRef
  if (!existing.profileId && profileId) patch.profile_id = Number(profileId)
  const fillText = (col: string, cur: string, next: string) => {
    if (!cur.trim() && next.trim()) patch[col] = next.trim()
  }
  fillText('contact_name', existing.contactName, draft.contactName)
  fillText('contact_phone', existing.contactPhone, draft.contactPhone)
  fillText('branch_review', existing.branchReview, draft.store)
  fillText('content_format', existing.contentFormat, draft.contentFormat)
  if (!existing.shootingDate && draft.shootingDate) patch.shooting_date = draft.shootingDate
  if (!existing.publishDate && draft.publishDate) patch.publish_date = draft.publishDate
  if (!(existing.budget > 0) && draft.budget > 0) patch.budget = draft.budget
  if (!(existing.actualCost > 0) && draft.actualCost > 0 && !existing.expenseAccrualId) patch.actual_cost = draft.actualCost
  if ((STATUS_RANK[draft.status] ?? 0) > (STATUS_RANK[existing.status] ?? 2)) patch.status = draft.status
  if ((PAYMENT_RANK[draft.paymentStatus] ?? -1) > (PAYMENT_RANK[existing.paymentStatus] ?? -1)) {
    patch.payment_status = draft.paymentStatus
  }
  if (!existing.paidAt && draft.paidAt) patch.paid_at = draft.paidAt
  const links = { ...existing.platformLinks }
  let linksChanged = false
  const isVideo = (u: string) => /\/(video|reel|p|share|shorts)\//i.test(u)
  for (const [k, v] of Object.entries(draft.platformLinks)) {
    if (!links[k] || (!isVideo(links[k]) && isVideo(v))) {
      links[k] = v
      linksChanged = true
    }
  }
  if (linksChanged) patch.platform_links = links
  const extraNote = draft.note
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !existing.note.includes(l))
  if (extraNote.length) patch.note = [existing.note.trim(), ...extraNote].filter(Boolean).join('\n')
  return patch
}
