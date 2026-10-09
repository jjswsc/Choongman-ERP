import { describe, expect, it } from 'vitest'
import {
  extractUrls,
  mapThaiJobStatus,
  mapThaiPaymentStatus,
  parseThbAmount,
  tiktokVideoPostedYmd,
} from './marketing-influencer-profile'
import { parseInfluencerSheetRows } from './marketing-influencer-sheet-import'
import {
  buildInfluencerPostFillPatch,
  matchExistingInfluencerPost,
  parseInfluencerJobSheets,
  urlsToPlatformLinks,
  type ExistingInfluencerPostRow,
} from './marketing-influencer-job-import'

const STORES = ['CM Ekkamai', 'CM Union Mall', 'CM The Street', 'CM Silom', 'CM MBK']

const DB_HEADER = [
  'ลำดับ',
  'ชื่ออินฟลู / ชื่อช่อง',
  'ประเภทคอนเทนต์',
  'TikTok',
  'ผู้ติดตาม TikTok',
  'Instagram',
  'ผู้ติดตาม Instagram',
  'Facebook',
  'ผู้ติดตาม Facebook',
  'ช่องทางติดต่อ',
  'เรท TikTok',
  'เรท Instagram',
  'เรท Facebook',
  'เรทแพ็กเกจ',
  'รายละเอียดที่รวมในราคา',
  'ค่าใช้จ่ายเพิ่มเติม',
  'พื้นที่รับงาน',
  'วันที่สอบถามเรท',
  'สถานะ =',
  'Rate Card / ลิงก์เอกสาร',
]
const HIRED_HEADER = [...DB_HEADER, 'ผลงาน']

function dbRow(cells: Record<number, unknown>, len = DB_HEADER.length): unknown[] {
  const r: unknown[] = Array.from({ length: len }, () => '')
  for (const [k, v] of Object.entries(cells)) r[Number(k)] = v
  return r
}

const tt = (h: string) => `https://www.tiktok.com/@${h}?is_from_webapp=1&sender_device=pc`
const vid = (h: string, id: string) => `https://www.tiktok.com/@${h}/video/${id}?is_from_webapp=1`

const TRACKER_HEADER = [
  'Job No.',
  'Influencer',
  'Influencer ID',
  'ช่องทางติดต่อ',
  'Campaign',
  'สาขา',
  'Platform',
  'Deliverable',
  'วันที่เข้าร้าน',
  'กำหนดโพสต์',
  'เรทอ้างอิง',
  'ราคาตกลงจริง',
  'ค่าเดินทาง',
  'ค่าใช้จ่ายอื่น',
  'ค่าใช้จ่ายรวม',
  'สถานะงาน',
  'สถานะชำระเงิน',
  'วันที่ชำระ',
  'Link Content',
]

describe('시트 값 파서', () => {
  it('금액·작업 상태·지급 상태', () => {
    expect(parseThbAmount('10.9k')).toBe(10900)
    expect(parseThbAmount(300)).toBe(300)
    expect(parseThbAmount('3,000')).toBe(3000)
    expect(parseThbAmount('Double Click')).toBe(0)
    expect(mapThaiJobStatus('ลงงานเเล้ว')).toBe('finish')
    expect(mapThaiJobStatus('นัดวันเเล้ว')).toBe('ongoing')
    expect(mapThaiJobStatus('คอนเฟิร์ม')).toBe('ongoing')
    expect(mapThaiJobStatus('สถานะงาน')).toBeNull()
    expect(mapThaiPaymentStatus('ชำระแล้ว')).toBe('paid')
    expect(mapThaiPaymentStatus('วางบิล')).toBe('billed')
    expect(mapThaiPaymentStatus('ยังไม่ดำเนินการ')).toBe('unpaid')
    expect(mapThaiPaymentStatus('สถานะชำระเงิน')).toBeNull()
  })

  it('URL 추출·플랫폼 분류·TikTok 영상 게시일', () => {
    const urls = extractUrls('TT - https://www.tiktok.com/@a/video/1 Ig - https://www.instagram.com/reel/X/\nhttps://drive.google.com/file/d/1/view')
    expect(urls).toHaveLength(3)
    const { links, extra } = urlsToPlatformLinks(urls)
    expect(Object.keys(links)).toEqual(['tiktok', 'instagram'])
    expect(extra[0]).toContain('drive.google.com')
    expect(tiktokVideoPostedYmd('https://www.tiktok.com/@moddwarang/video/7662318859533438215')).toBe('2026-07-14')
    expect(tiktokVideoPostedYmd('https://www.tiktok.com/@moddwarang')).toBeNull()
  })
})

describe('parseInfluencerJobSheets', () => {
  const db = parseInfluencerSheetRows(
    [
      DB_HEADER,
      dbRow({ 0: 10, 1: 'Moddwarang', 3: tt('moddwarang'), 13: '10.9k', 16: 'MBK' }),
      dbRow({ 0: 7, 1: 'ชอบกินเป็นทุนเดิม', 3: tt('nonchopkin'), 13: '9.9k', 16: 'The Street' }),
      dbRow({ 0: 14, 1: 'dayeon_yui', 3: tt('dayeon_yui'), 16: 'MBK' }),
      dbRow({ 0: 53, 1: 'daily.sitafun', 3: tt('daily.sitafun6'), 15: 'Bather', 16: 'Union Mal' }),
    ],
    STORES
  ).profiles

  // Hired: 결과물 링크가 한 행씩 밀려 있음(Moddwarang 행에 nonchopkin 영상)
  const hired = [
    HIRED_HEADER,
    dbRow({ 0: 7, 1: 'ชอบกินเป็นทุนเดิม', 3: tt('nonchopkin'), 20: 'https://drive.google.com/file/d/abc/view' }, HIRED_HEADER.length),
    dbRow(
      { 0: 10, 1: 'Moddwarang', 3: tt('moddwarang'), 20: `TT - ${vid('nonchopkin', '7687945955810888967')} Ig - https://www.instagram.com/reel/DdjA/` },
      HIRED_HEADER.length
    ),
    dbRow({ 0: 14, 1: 'dayeon_yui', 3: tt('dayeon_yui'), 20: `TT - ${vid('moddwarang', '7662318859533438215')}` }, HIRED_HEADER.length),
  ]

  const tracker = [
    TRACKER_HEADER,
    [1, 'Moddwarang', 10, 'line: nicksaisit', '', '', 'Package', false, 'Double Click', 'Double Click', '10.9k', 10900, '', '', 10900, 'ลงงานเเล้ว', 'ชำระแล้ว', 'Double Click', ''],
    [9, 'daily.sitafun', 53, '', '', '', 'Tiktok', true, 'Double Click', 46298, '', '', '', '', 0, 'คอนเฟิร์ม', 'สถานะชำระเงิน', 'Double Click', ''],
    [15, 'ชอบกินเป็นทุนเดิม', 7, 'line: 0814096548', '', '', 'Tiktok', false, 'Double Click', 'Double Click', '', '', 300, '', '', 'คอนเฟิร์ม', 'วางบิล', 'Double Click', ''],
    ['', false, '', '', '', '', '', false, '', '', '', '', '', '', '', '', '', '', ''],
  ]

  const res = parseInfluencerJobSheets({ trackerRows: tracker, hiredRows: hired, profiles: db, stores: STORES })
  const byRef = new Map(res.posts.map((p) => [p.externalRef, p]))

  it('Tracker 작업 → 업로드 기록(비용·지급·매장 보완)', () => {
    expect(res.trackerRows).toBe(3)
    const m = byRef.get('sheet:ct:1')!
    expect(m.profileKey).toBe('tt:moddwarang')
    expect(m.name).toBe('@moddwarang')
    expect(m.store).toBe('CM MBK')
    expect(m.actualCost).toBe(10900)
    expect(m.budget).toBe(10900)
    expect(m.status).toBe('finish')
    expect(m.paymentStatus).toBe('paid')
    expect(m.hireType).toBe('pay')

    const s = byRef.get('sheet:ct:9')!
    expect(s.publishDate).toBe('2026-10-03')
    expect(s.paymentStatus).toBe('')
    expect(s.hireType).toBe('free')
    expect(s.store).toBe('CM Union Mall')
    expect(s.note).toContain('Barter: Bather')
  })

  it('밀린 Hired 링크는 영상 @핸들 주인에게 붙고, 게시일은 영상 ID로 추정', () => {
    const m = byRef.get('sheet:ct:1')!
    expect(m.platformLinks.tiktok).toContain('@moddwarang/video')
    expect(m.publishDate).toBe('2026-07-14')

    const n = byRef.get('sheet:ct:15')!
    expect(n.platformLinks.tiktok).toContain('@nonchopkin/video')
    expect(n.platformLinks.instagram).toContain('/reel/DdjA')
    expect(n.note).toContain('drive.google.com')
    expect(n.status).toBe('finish')
    expect(n.actualCost).toBe(300)
    expect(n.paymentStatus).toBe('billed')
    expect(res.warnings.some((w) => w.includes('@nonchopkin'))).toBe(true)
  })

  it('Tracker에 없는 Hired 결과물 → Hired 전용 기록', () => {
    // dayeon_yui 행의 링크는 moddwarang 것이라 dayeon 기록은 생기지 않음
    expect(byRef.has('sheet:hired:dayeon_yui')).toBe(false)
    expect(res.posts).toHaveLength(3)
  })
})

describe('기존 업로드 기록 매칭·보완', () => {
  const draft = parseInfluencerJobSheets({
    trackerRows: [TRACKER_HEADER, [3, 'thesama', '', '', '', 'Ekkamai', 'Tiktok', false, '', 46242, '7.5k', 7500, '', '', 7500, 'ลงงานแล้ว', 'ชำระแล้ว', 46250, '']],
    profiles: [],
    stores: STORES,
  }).posts[0]!

  const ex = (over: Partial<ExistingInfluencerPostRow>): ExistingInfluencerPostRow => ({
    id: '1',
    profileId: null,
    name: '@thesama.p',
    contactName: '',
    contactPhone: '',
    branchReview: '',
    shootingDate: null,
    publishDate: null,
    budget: 0,
    actualCost: 0,
    status: 'finish',
    contentFormat: '',
    paymentStatus: '',
    paidAt: null,
    externalRef: '',
    platformLinks: {},
    note: '',
    expenseAccrualId: null,
    ...over,
  })

  it('external_ref 우선, 없으면 같은 핸들·가까운 날짜', () => {
    const rows = [ex({ id: 'far', publishDate: '2026-01-01' }), ex({ id: 'near', publishDate: '2026-08-10' }), ex({ id: 'ref', name: 'x', externalRef: draft.externalRef })]
    expect(matchExistingInfluencerPost(draft, { profileId: null, handle: 'thesama.p' }, rows, new Set())?.id).toBe('ref')
    expect(matchExistingInfluencerPost(draft, { profileId: null, handle: 'thesama.p' }, rows.slice(0, 2), new Set())?.id).toBe('near')
    expect(matchExistingInfluencerPost(draft, { profileId: null, handle: 'thesama.p' }, rows.slice(0, 1), new Set())).toBeNull()
  })

  it('빈 칸만 채우고, 지급예정 연동된 실지출은 건드리지 않음', () => {
    const p = buildInfluencerPostFillPatch(ex({ actualCost: 0, expenseAccrualId: '9', publishDate: '2026-08-08' }), draft, '5')
    expect(p.external_ref).toBe(draft.externalRef)
    expect(p.profile_id).toBe(5)
    expect(p.actual_cost).toBeUndefined()
    expect(p.publish_date).toBeUndefined()
    expect(p.payment_status).toBe('paid')
    expect(p.paid_at).toBe('2026-08-16')
    expect(p.branch_review).toBe('CM Ekkamai')
  })
})
