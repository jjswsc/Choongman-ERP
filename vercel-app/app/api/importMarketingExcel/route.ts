/**
 * 마케팅 엑셀 가져오기 → marketing_campaigns, marketing_ads, marketing_influencers
 * FormData (file) 필수. Promotion-Campaign, ROAS, Influencer 시트 파싱.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseInsert } from '@/lib/supabase-server'

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const s = String(val).replace(/,/g, '').trim()
  if (s === '-' || s === '') return 0
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : n
}

function excelSerialToDate(serial: unknown): string | null {
  if (serial == null || serial === '' || serial === '#') return null
  const n = typeof serial === 'number' ? serial : parseFloat(String(serial))
  if (Number.isNaN(n) || n < 1) return null
  const date = new Date((n - 25569) * 86400 * 1000)
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function parseDateStr(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const d = new Date(t)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
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
    if (!file) {
      return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
    }

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })

    let campaignsInserted = 0
    let adsInserted = 0
    let influencersInserted = 0

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
        const startDate = excelSerialToDate(startSerial)
        const endDate = endSerial === '#' ? null : excelSerialToDate(endSerial)

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
        await supabaseInsert('marketing_campaigns', row)
        campaignsInserted++
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
        const publishDate = excelSerialToDate(r[4])
        if (!contentFormat && !contentTopic && !publishDate) continue

        for (const p of platforms) {
          const link = String(r[p.linkIdx] ?? '').trim()
          const budget = parseNum(r[p.budgetIdx])
          const spent = parseNum(r[p.spentIdx])
          const hasData = link || budget > 0 || spent > 0
          if (!hasData) continue

          await supabaseInsert('marketing_ads', {
            campaign_id: null,
            content_format: contentFormat,
            content_pillar: contentPillar,
            content_topic: contentTopic,
            publish_date: publishDate,
            platform: p.key,
            post_link: link,
            boost_budget: budget,
            actual_spent: spent,
          })
          adsInserted++
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
        const publishDate = typeof rawPublish === 'number' ? excelSerialToDate(rawPublish) : parseDateStr(String(rawPublish))
        const shootingDate = typeof rawShoot === 'number' ? excelSerialToDate(rawShoot) : parseDateStr(String(rawShoot))
        const platformLinks: Record<string, string> = {}
        for (const p of PLATFORMS) {
          const link = String(r[p.idx] ?? '').trim()
          if (link && link.startsWith('http')) platformLinks[p.key] = link
        }

        const budgetVal = r[9]
        const budget = budgetVal === ' -' || String(budgetVal).includes('+') ? 0 : parseNum(budgetVal)

        await supabaseInsert('marketing_influencers', {
          campaign_id: null,
          name,
          followers: String(r[2] ?? '').trim(),
          content_format: String(r[4] ?? '').trim(),
          content_topic: String(r[5] ?? '').trim(),
          status: String(r[6] ?? 'finish').trim() || 'finish',
          branch_review: String(r[7] ?? '').trim(),
          hire_type: String(r[8] ?? 'pay').trim() || 'pay',
          budget,
          shooting_date: shootingDate,
          publish_date: publishDate,
          platform_links: Object.keys(platformLinks).length ? platformLinks : {},
          note: String(r[28] ?? '').trim(),
        })
        influencersInserted++
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `가져오기 완료: 캠페인 ${campaignsInserted}건, 광고 ${adsInserted}건, 인플루언서 ${influencersInserted}건`,
        campaignsInserted,
        adsInserted,
        influencersInserted,
      },
      { headers }
    )
  } catch (e) {
    console.error('importMarketingExcel:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '가져오기 실패' },
      { headers }
    )
  }
}
