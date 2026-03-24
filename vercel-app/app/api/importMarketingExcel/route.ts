/**
 * 마케팅 엑셀 가져오기 → marketing_campaigns, marketing_ads, marketing_influencers
 * FormData (file) 필수. dryRun=1이면 미리보기만 반환.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseInsert, supabaseSelect } from '@/lib/supabase-server'

function toImportErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (
    raw.includes('42501') ||
    (raw.includes('PGRST') && raw.includes('row-level security')) ||
    /row-level security policy/i.test(raw)
  ) {
    return 'Supabase RLS로 가져오기가 거부되었습니다. Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY를 설정하거나, Supabase SQL Editor에서 marketing_campaigns/marketing_ads/marketing_influencers 테이블에 INSERT/SELECT 정책을 추가해 주세요.'
  }
  return raw
}

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const s = String(val).replace(/[,\s]/g, '').replace(/[฿₩]/g, '').trim()
  if (s === '-' || s === '') return 0
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : n
}

function formatDateToYmd(d: Date): string | null {
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function excelSerialToDate(serial: unknown): string | null {
  if (serial == null || serial === '' || serial === '#') return null
  const n = typeof serial === 'number' ? serial : parseFloat(String(serial))
  if (Number.isNaN(n) || n < 1) return null
  const date = new Date((n - 25569) * 86400 * 1000)
  return formatDateToYmd(date)
}

function parseDateFlexible(raw: unknown): string | null {
  if (raw == null || raw === '' || raw === '#') return null
  if (typeof raw === 'number') return excelSerialToDate(raw)
  const s = String(raw).trim()
  if (!s) return null

  const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])
    return formatDateToYmd(new Date(Date.UTC(year, month - 1, day)))
  }

  const parsed = new Date(s)
  return formatDateToYmd(parsed)
}

function parseBranches(val: unknown): string[] {
  if (!val) return []
  const s = String(val).trim()
  if (!s) return []
  return s
    .split(/[\n,;]/)
    .map((x) => x.replace(/^-\s*/, '').trim())
    .filter((x) => x && x !== '-')
}

function parseKpi(val: unknown): { target: number; unit: string } {
  const s = String(val ?? '').trim()
  if (!s) return { target: 0, unit: 'order' }
  const numMatch = s.match(/(\d+(?:\.\d+)?)/)
  const target = numMatch ? parseFloat(numMatch[1]) : 0
  let unit = 'order'
  if (/คูปอง|쿠폰|coupon/i.test(s)) unit = 'coupon'
  else if (/สิทธิ์|member|회원/i.test(s)) unit = 'member'
  else if (/ออเดอร์|order/i.test(s)) unit = 'order'
  return { target, unit }
}

function normalizeText(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

type CampaignCandidate = {
  id: string | null
  topic: string
  startDate: string | null
  endDate: string | null
}

function dateInRange(date: string | null, start: string | null, end: string | null): boolean {
  if (!date) return false
  const d = date
  const s = start || '1900-01-01'
  const e = end || '9999-12-31'
  return d >= s && d <= e
}

function scoreCampaignMatch(
  c: CampaignCandidate,
  payload: { topic?: string; detail?: string; publishDate?: string | null }
): number {
  const topic = normalizeText(payload.topic)
  const detail = normalizeText(payload.detail)
  const ctopic = normalizeText(c.topic)
  let score = 0
  if (ctopic && topic && (topic.includes(ctopic) || ctopic.includes(topic))) score += 70
  else if (ctopic && detail && detail.includes(ctopic)) score += 40
  if (dateInRange(payload.publishDate || null, c.startDate, c.endDate)) score += 30
  return score
}

function pickBestCampaign(
  campaigns: CampaignCandidate[],
  payload: { topic?: string; detail?: string; publishDate?: string | null }
): { campaignId: string | null; score: number } {
  let best: { campaignId: string | null; score: number } = { campaignId: null, score: 0 }
  for (const c of campaigns) {
    const score = scoreCampaignMatch(c, payload)
    if (score > best.score) {
      best = { campaignId: c.id, score }
    }
  }
  if (best.score < 45) return { campaignId: null, score: best.score }
  return best
}

type CampaignRowInput = {
  row: Record<string, unknown>
  topic: string
  startDate: string | null
  endDate: string | null
}

type AdRowInput = {
  contentFormat: string
  contentPillar: string
  contentTopic: string
  publishDate: string | null
  platform: string
  postLink: string
  boostBudget: number
  actualSpent: number
}

type InfluencerRowInput = {
  name: string
  followers: string
  contentFormat: string
  contentTopic: string
  status: string
  branchReview: string
  hireType: string
  budget: number
  shootingDate: string | null
  publishDate: string | null
  platformLinks: Record<string, string>
  note: string
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const ct = request.headers.get('content-type') || ''
    if (!ct.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, message: 'multipart/form-data 필요' }, { headers })
    }
    const form = await request.formData()
    const file = form.get('file') as File | null
    const dryRun = String(form.get('dryRun') ?? '').trim() === '1'
    if (!file) {
      return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
    }

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })

    const warnings: string[] = []
    const campaignRowsToInsert: CampaignRowInput[] = []
    const adRowsToInsert: AdRowInput[] = []
    const influencerRowsToInsert: InfluencerRowInput[] = []
    const timelineRowsToInsert: AdRowInput[] = []

    let campaignsInserted = 0
    let adsInserted = 0
    let influencersInserted = 0
    let timelineAdsInserted = 0

    // 1. Promotion - Campaign 시트
    const campaignSheet = wb.SheetNames.find(
      (n) => n.toLowerCase().includes('promotion') && n.toLowerCase().includes('campaign')
    ) || wb.SheetNames[0]
    const campaignWs = wb.Sheets[campaignSheet]
    if (campaignWs) {
      const data = XLSX.utils.sheet_to_json<unknown[]>(campaignWs, { header: 1, defval: '' }) as unknown[][]
      for (let i = 1; i < data.length; i++) {
        const r = data[i] as unknown[]
        const topic = String(r[1] ?? '').trim()
        if (!topic) continue

        const startSerial = r[5]
        const endSerial = r[6]
        const startDate = parseDateFlexible(startSerial)
        const endDate = endSerial === '#' ? null : parseDateFlexible(endSerial)

        const discountVal = r[8]
        const discountType = typeof discountVal === 'number' && discountVal > 0 && discountVal <= 1 ? 'percent' : 'amount'
        const discountValue = parseNum(discountVal)

        const kpi = parseKpi(r[17])

        const row = {
          topic,
          format: String(r[2] ?? '').trim(),
          status: String(r[3] ?? 'finish').trim() || 'finish',
          detail: String(r[4] ?? '').trim(),
          start_date: startDate,
          end_date: endDate,
          branches: parseBranches(r[7]),
          discount_type: discountType,
          discount_value: discountValue,
          discount_price_promotion: String(r[9] ?? '').trim(),
          cost_ads_online: parseNum(r[10]),
          cost_ads_offline: parseNum(r[11]),
          cost_production: parseNum(r[12]),
          cost_food: parseNum(r[13]),
          cost_influencer: parseNum(r[14]),
          budget_total: parseNum(r[15]),
          kpi_target: kpi.target,
          kpi_unit: kpi.unit,
          campaign_performance: String(r[16] ?? '').trim(),
          conclusion: String(r[18] ?? '').trim(),
        }
        campaignRowsToInsert.push({ row, topic, startDate, endDate })
      }
    }

    // 2. ROAS (Ads) 시트 - 플랫폼별로 행 분리
    const roasSheet = wb.SheetNames.find((n) => n.toLowerCase().includes('roas'))
    if (roasSheet) {
      const roasWs = wb.Sheets[roasSheet]
      const data = XLSX.utils.sheet_to_json<unknown[]>(roasWs, { header: 1, defval: '' }) as unknown[][]
      const platforms: { key: string; linkIdx: number; budgetIdx: number; spentIdx: number }[] = [
        { key: 'instagram', linkIdx: 6, budgetIdx: 7, spentIdx: 8 },
        { key: 'facebook', linkIdx: 10, budgetIdx: 11, spentIdx: 12 },
        { key: 'tiktok', linkIdx: 14, budgetIdx: 15, spentIdx: 16 },
      ]
      for (let i = 3; i < data.length; i++) {
        const r = data[i] as unknown[]
        const contentFormat = String(r[1] ?? '').trim()
        const contentPillar = String(r[2] ?? '').trim()
        const contentTopic = String(r[3] ?? '').trim()
        const publishDate = parseDateFlexible(r[4])
        if (!contentFormat && !contentTopic && !publishDate) continue

        for (const p of platforms) {
          const link = String(r[p.linkIdx] ?? '').trim()
          const budget = parseNum(r[p.budgetIdx])
          const spent = parseNum(r[p.spentIdx])
          const hasData = link || budget > 0 || spent > 0
          if (!hasData) continue

          adRowsToInsert.push({
            contentFormat,
            contentPillar,
            contentTopic,
            publishDate,
            platform: p.key,
            postLink: link,
            boostBudget: budget,
            actualSpent: spent,
          })
        }
      }
    }

    // 3. Influencer 시트
    const infSheet = wb.SheetNames.find((n) => n.toLowerCase().includes('influencer'))
    if (infSheet) {
      const infWs = wb.Sheets[infSheet]
      const data = XLSX.utils.sheet_to_json<unknown[]>(infWs, { header: 1, defval: '' }) as unknown[][]
      const PLATFORMS = [
        { key: 'instagram', idx: 13 },
        { key: 'facebook', idx: 15 },
        { key: 'tiktok', idx: 17 },
        { key: 'youtube', idx: 19 },
        { key: 'lemon8', idx: 21 },
        { key: 'twitter', idx: 23 },
      ] as const
      for (let i = 1; i < data.length; i++) {
        const r = data[i] as unknown[]
        const name = String(r[1] ?? '').trim()
        if (!name) continue

        const rawPublish = r[12] ?? r[11]
        const rawShoot = r[10]
        const publishDate = parseDateFlexible(rawPublish)
        const shootingDate = parseDateFlexible(rawShoot)
        const platformLinks: Record<string, string> = {}
        for (const p of PLATFORMS) {
          const link = String(r[p.idx] ?? '').trim()
          if (link && link.startsWith('http')) platformLinks[p.key] = link
        }

        const budgetVal = r[9]
        const budget = budgetVal === ' -' || String(budgetVal).includes('+') ? 0 : parseNum(budgetVal)

        influencerRowsToInsert.push({
          name,
          followers: String(r[2] ?? '').trim(),
          contentFormat: String(r[4] ?? '').trim(),
          contentTopic: String(r[5] ?? '').trim(),
          status: String(r[6] ?? 'finish').trim() || 'finish',
          branchReview: String(r[7] ?? '').trim(),
          hireType: String(r[8] ?? 'pay').trim() || 'pay',
          budget,
          shootingDate,
          publishDate,
          platformLinks: Object.keys(platformLinks).length ? platformLinks : {},
          note: String(r[28] ?? '').trim(),
        })
      }
    }

    // 4. Timeline Content 시트(2024/2025)
    const timelineSheets = wb.SheetNames.filter((n) => n.toLowerCase().includes('content'))
    for (const sheetName of timelineSheets) {
      const ws = wb.Sheets[sheetName]
      if (!ws) continue
      const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
      const platforms: { key: string; useIdx: number; linkIdx: number; budgetIdx: number; spentIdx: number }[] = [
        { key: 'instagram', useIdx: 6, linkIdx: 7, budgetIdx: 8, spentIdx: 9 },
        { key: 'facebook', useIdx: 10, linkIdx: 11, budgetIdx: 12, spentIdx: 13 },
        { key: 'tiktok', useIdx: 14, linkIdx: 15, budgetIdx: 16, spentIdx: 17 },
      ]
      for (let i = 3; i < data.length; i++) {
        const r = data[i] as unknown[]
        const contentFormat = String(r[1] ?? '').trim()
        const contentPillar = String(r[2] ?? '').trim()
        const contentTopic = String(r[3] ?? '').trim()
        const publishDate = parseDateFlexible(r[5])
        const note = String(r[22] ?? '').trim()
        if (!contentFormat && !contentTopic && !publishDate) continue

        for (const p of platforms) {
          const enabledRaw = String(r[p.useIdx] ?? '').trim().toLowerCase()
          const enabled = enabledRaw === 'true' || enabledRaw === '1' || enabledRaw === 'yes'
          const link = String(r[p.linkIdx] ?? '').trim()
          const budget = parseNum(r[p.budgetIdx])
          const spent = parseNum(r[p.spentIdx])
          const hasData = enabled || !!link || budget > 0 || spent > 0
          if (!hasData) continue

          timelineRowsToInsert.push({
            contentFormat,
            contentPillar,
            contentTopic: note ? `${contentTopic} | ${note}`.trim() : contentTopic,
            publishDate,
            platform: p.key,
            postLink: link,
            boostBudget: budget,
            actualSpent: spent,
          })
        }
      }
    }

    // 매핑 풀: 기존 캠페인 + 이번 파일의 캠페인
    const existingCampaigns = (await supabaseSelect('marketing_campaigns', {
      order: 'id.desc',
      limit: 1000,
      select: 'id,topic,start_date,end_date',
    })) as { id?: number; topic?: string; start_date?: string | null; end_date?: string | null }[]

    const importedCandidates: CampaignCandidate[] = campaignRowsToInsert.map((c) => ({
      id: null,
      topic: c.topic,
      startDate: c.startDate,
      endDate: c.endDate,
    }))
    const baseCandidates: CampaignCandidate[] = [
      ...(existingCampaigns || []).map((c) => ({
        id: c.id != null ? String(c.id) : null,
        topic: String(c.topic ?? ''),
        startDate: c.start_date ? String(c.start_date).slice(0, 10) : null,
        endDate: c.end_date ? String(c.end_date).slice(0, 10) : null,
      })),
      ...importedCandidates,
    ].filter((c) => c.topic.trim())

    let mappedAds = 0
    let mappedInfluencers = 0
    let unmappedAds = 0
    let unmappedInfluencers = 0

    if (!dryRun) {
      const newlyInsertedCandidates: CampaignCandidate[] = []
      for (const c of campaignRowsToInsert) {
        const inserted = (await supabaseInsert('marketing_campaigns', c.row)) as { id?: number }[]
        const created = Array.isArray(inserted) ? inserted[0] : inserted
        campaignsInserted++
        const id = created?.id != null ? String(created.id) : null
        newlyInsertedCandidates.push({ id, topic: c.topic, startDate: c.startDate, endDate: c.endDate })
      }
      const matchCandidates = [
        ...(existingCampaigns || []).map((c) => ({
          id: c.id != null ? String(c.id) : null,
          topic: String(c.topic ?? ''),
          startDate: c.start_date ? String(c.start_date).slice(0, 10) : null,
          endDate: c.end_date ? String(c.end_date).slice(0, 10) : null,
        })),
        ...newlyInsertedCandidates,
      ].filter((c) => c.topic.trim())

      for (const a of adRowsToInsert) {
        const matched = pickBestCampaign(matchCandidates, {
          topic: a.contentTopic,
          detail: `${a.contentFormat} ${a.contentPillar}`,
          publishDate: a.publishDate,
        })
        if (matched.campaignId) mappedAds++
        else unmappedAds++
        await supabaseInsert('marketing_ads', {
          campaign_id: matched.campaignId ? Number(matched.campaignId) : null,
          content_format: a.contentFormat,
          content_pillar: a.contentPillar,
          content_topic: a.contentTopic,
          publish_date: a.publishDate,
          platform: a.platform,
          post_link: a.postLink,
          boost_budget: a.boostBudget,
          actual_spent: a.actualSpent,
        })
        adsInserted++
      }

      for (const a of timelineRowsToInsert) {
        const matched = pickBestCampaign(matchCandidates, {
          topic: a.contentTopic,
          detail: `${a.contentFormat} ${a.contentPillar}`,
          publishDate: a.publishDate,
        })
        if (!matched.campaignId) unmappedAds++
        await supabaseInsert('marketing_ads', {
          campaign_id: matched.campaignId ? Number(matched.campaignId) : null,
          content_format: a.contentFormat,
          content_pillar: a.contentPillar,
          content_topic: a.contentTopic,
          publish_date: a.publishDate,
          platform: a.platform,
          post_link: a.postLink,
          boost_budget: a.boostBudget,
          actual_spent: a.actualSpent,
        })
        timelineAdsInserted++
      }

      for (const i of influencerRowsToInsert) {
        const matched = pickBestCampaign(matchCandidates, {
          topic: i.contentTopic,
          detail: `${i.name} ${i.branchReview}`,
          publishDate: i.publishDate,
        })
        if (matched.campaignId) mappedInfluencers++
        else unmappedInfluencers++
        await supabaseInsert('marketing_influencers', {
          campaign_id: matched.campaignId ? Number(matched.campaignId) : null,
          name: i.name,
          followers: i.followers,
          content_format: i.contentFormat,
          content_topic: i.contentTopic,
          status: i.status || 'finish',
          branch_review: i.branchReview,
          hire_type: i.hireType || 'pay',
          budget: i.budget,
          shooting_date: i.shootingDate,
          publish_date: i.publishDate,
          platform_links: i.platformLinks,
          note: i.note,
        })
        influencersInserted++
      }
    } else {
      for (const a of adRowsToInsert) {
        const matched = pickBestCampaign(baseCandidates, {
          topic: a.contentTopic,
          detail: `${a.contentFormat} ${a.contentPillar}`,
          publishDate: a.publishDate,
        })
        if (matched.campaignId || matched.score >= 45) mappedAds++
        else unmappedAds++
      }
      for (const a of timelineRowsToInsert) {
        const matched = pickBestCampaign(baseCandidates, {
          topic: a.contentTopic,
          detail: `${a.contentFormat} ${a.contentPillar}`,
          publishDate: a.publishDate,
        })
        if (!(matched.campaignId || matched.score >= 45)) unmappedAds++
      }
      for (const i of influencerRowsToInsert) {
        const matched = pickBestCampaign(baseCandidates, {
          topic: i.contentTopic,
          detail: `${i.name} ${i.branchReview}`,
          publishDate: i.publishDate,
        })
        if (matched.campaignId || matched.score >= 45) mappedInfluencers++
        else unmappedInfluencers++
      }
    }

    if (unmappedAds > 0 || unmappedInfluencers > 0) {
      warnings.push('일부 광고/인플루언서 행은 캠페인 자동 매핑이 실패했습니다. 캠페인 허브에서 수동 연결해 주세요.')
    }

    return NextResponse.json(
      {
        success: true,
        message: dryRun
          ? `미리보기 완료: 캠페인 후보 ${campaignRowsToInsert.length}건, 광고 후보 ${adRowsToInsert.length + timelineRowsToInsert.length}건, 인플루언서 후보 ${influencerRowsToInsert.length}건`
          : `가져오기 완료: 캠페인 ${campaignsInserted}건, 광고 ${adsInserted}건, 타임라인 광고 ${timelineAdsInserted}건, 인플루언서 ${influencersInserted}건`,
        dryRun,
        campaignsInserted,
        adsInserted,
        timelineAdsInserted,
        influencersInserted,
        unmappedAds,
        unmappedInfluencers,
        preview: {
          detectedSheets: wb.SheetNames,
          campaignCandidates: campaignRowsToInsert.length,
          adCandidates: adRowsToInsert.length,
          influencerCandidates: influencerRowsToInsert.length,
          timelineCandidates: timelineRowsToInsert.length,
          mappedAds,
          mappedInfluencers,
          warnings,
        },
      },
      { headers }
    )
  } catch (e) {
    console.error('importMarketingExcel:', e)
    return NextResponse.json(
      { success: false, message: toImportErrorMessage(e) || '가져오기 실패' },
      { headers }
    )
  }
}
