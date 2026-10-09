import { describe, expect, it } from 'vitest'
import {
  extractThaiPhone,
  mapSheetStoreToErp,
  mapThaiPipelineStatus,
  normalizeInstagramHandle,
  normalizeTiktokHandle,
  parseFollowersCount,
  parseRateMinThb,
  parseSheetDateYmd,
  splitContentCategories,
} from './marketing-influencer-profile'
import {
  fillEmptyInfluencerProfileFields,
  emptyInfluencerProfileFields,
  parseInfluencerSheetRows,
} from './marketing-influencer-sheet-import'

const STORES = ['CM Ekkamai', 'CM MBK', 'CM Union Mall', 'CM The Street', 'CM Future Park', 'CM Silom']

describe('normalizeTiktokHandle', () => {
  it('URL에서 쿼리스트링을 떼고 핸들 추출', () => {
    expect(
      normalizeTiktokHandle('https://www.tiktok.com/@goodbyemoney?is_from_webapp=1&sender_device=pc')
    ).toBe('goodbyemoney')
    expect(normalizeTiktokHandle('http://tiktok.com/@thintomorrow')).toBe('thintomorrow')
    expect(normalizeTiktokHandle('@J.Chachaa')).toBe('j.chachaa')
    expect(normalizeTiktokHandle('line: @abc')).toBe('')
  })

  it('Instagram 핸들', () => {
    expect(
      normalizeInstagramHandle('https://www.instagram.com/goodbyemoney_official?utm_source=ig_web')
    ).toBe('goodbyemoney_official')
  })
})

describe('parseFollowersCount', () => {
  it('k/M 단위', () => {
    expect(parseFollowersCount('138.6k')).toBe(138600)
    expect(parseFollowersCount('1M')).toBe(1000000)
    expect(parseFollowersCount('2,500')).toBe(2500)
    expect(parseFollowersCount('line: @x')).toBeNull()
    expect(parseFollowersCount('')).toBeNull()
  })
})

describe('mapThaiPipelineStatus', () => {
  it('시트 태국어 상태 → 코드', () => {
    expect(mapThaiPipelineStatus('รอข้อมูล')).toBe('waiting')
    expect(mapThaiPipelineStatus('สนใจ')).toBe('interested')
    expect(mapThaiPipelineStatus('ได้เรทแล้ว')).toBe('got_rate')
    expect(mapThaiPipelineStatus('เรทสูง')).toBe('high_rate')
    expect(mapThaiPipelineStatus('จ้าง')).toBe('hired')
    expect(mapThaiPipelineStatus('ไม่เลือก')).toBe('not_selected')
    expect(mapThaiPipelineStatus('ไม่ตอบ')).toBe('no_reply')
    expect(mapThaiPipelineStatus('อ่านไม่ตอบ')).toBe('no_reply')
    expect(mapThaiPipelineStatus('ไม่สะดวกรับงาน')).toBe('unavailable')
    expect(mapThaiPipelineStatus('hired')).toBe('hired')
    expect(mapThaiPipelineStatus('???')).toBeNull()
  })
})

describe('parseRateMinThb', () => {
  it('레이트 원문에서 최저 금액', () => {
    expect(parseRateMinThb('28k+VAT')).toBe(28000)
    expect(parseRateMinThb('25k / 50k')).toBe(25000)
    expect(parseRateMinThb('18k/23k/23k')).toBe(18000)
    expect(parseRateMinThb('79k ตอนนี้ลดเหลือ 20k')).toBe(20000)
    expect(parseRateMinThb('2400 ว่าง 26/28 MBK 11.00')).toBe(2400)
    expect(parseRateMinThb('อ่านที่ comment')).toBeNull()
  })
})

describe('mapSheetStoreToErp', () => {
  it('시트 매장 표기 → ERP 매장명', () => {
    expect(mapSheetStoreToErp('At Ekkamai', STORES)).toBe('CM Ekkamai')
    expect(mapSheetStoreToErp('Union Mal', STORES)).toBe('CM Union Mall')
    expect(mapSheetStoreToErp('The Street', STORES)).toBe('CM The Street')
    expect(mapSheetStoreToErp('MBK', STORES)).toBe('CM MBK')
    expect(mapSheetStoreToErp('พื้นที่รับงาน', STORES)).toBe('')
    expect(mapSheetStoreToErp('Rangsit', STORES)).toBe('Rangsit')
  })
})

describe('parseSheetDateYmd / phone / categories', () => {
  it('날짜', () => {
    expect(parseSheetDateYmd('13/08/2026')).toBe('2026-08-13')
    expect(parseSheetDateYmd('29/9/69')).toBe('2026-09-29')
    expect(parseSheetDateYmd('2026-10-07')).toBe('2026-10-07')
    expect(parseSheetDateYmd('Double Click')).toBeNull()
  })
  it('전화', () => {
    expect(extractThaiPhone('Inbox / 097-1977441')).toBe('0971977441')
    expect(extractThaiPhone('line: 0814096548')).toBe('0814096548')
    expect(extractThaiPhone('line: @abc')).toBe('')
  })
  it('카테고리', () => {
    expect(splitContentCategories('อาหาร, ไลฟ์สไตล์')).toEqual(['อาหาร', 'ไลฟ์สไตล์'])
    expect(splitContentCategories('ประเภทคอนเทนต์')).toEqual([])
  })
})

const HEADER = [
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
  'หมายเหตุ',
]

function row(cells: Record<number, string>): string[] {
  const r = Array.from({ length: HEADER.length }, () => '')
  for (const [k, v] of Object.entries(cells)) r[Number(k)] = v
  return r
}

describe('parseInfluencerSheetRows', () => {
  it('헤더 기반 파싱 + TikTok 핸들 중복 병합 + 플레이스홀더 무시', () => {
    const rows = [
      HEADER,
      row({
        0: '1',
        1: 'เงินจ๋าขอลาก่อน',
        2: 'อาหาร',
        3: 'https://www.tiktok.com/@goodbyemoney?is_from_webapp=1',
        4: '138.6k',
        9: 'line: @goodbye_money',
        10: '28k+VAT',
        16: 'At Ekkamai',
        17: '13/08/2026',
        18: 'ไม่เลือก',
      }),
      row({ 0: '2', 1: 'aomeng', 2: 'ประเภทคอนเทนต์', 3: 'https://www.tiktok.com/@thunyaaomz', 16: 'พื้นที่รับงาน', 17: 'Double Click', 18: 'รอข้อมูล' }),
      row({ 0: '3', 1: 'ไอหมวยกะไอตี๋', 2: 'คู่รัก', 3: 'https://www.tiktok.com/@suntangmo4', 18: 'สถานะ', 20: 'ไม่ตอบ' }),
      row({ 0: '4', 1: 'ไอหมวยกะไอตี๋', 2: 'คู่รัก', 3: 'https://www.tiktok.com/@suntangmo4', 18: 'ไม่ตอบ' }),
      row({ 0: '5', 1: 'กินข้าวเป็นเพื่อนหน่อย', 2: 'https://www.tiktok.com/@jerry_wangs' }),
      row({ 0: '96', 1: 'พื้นที่รับงาน', 2: 'Double Click', 3: 'สถานะ' }),
    ]
    const res = parseInfluencerSheetRows(rows, STORES)
    expect(res.headerRow).toBe(1)
    expect(res.mergedDuplicates).toBe(1)
    expect(res.profiles).toHaveLength(4)

    const a = res.profiles.find((p) => p.tiktokHandle === 'goodbyemoney')!
    expect(a.tiktokFollowers).toBe(138600)
    expect(a.rateMinThb).toBe(28000)
    expect(a.preferredStore).toBe('CM Ekkamai')
    expect(a.rateInquiredAt).toBe('2026-08-13')
    expect(a.pipelineStatus).toBe('not_selected')

    const dup = res.profiles.find((p) => p.tiktokHandle === 'suntangmo4')!
    expect(dup.sourceRows).toEqual([4, 5])
    expect(dup.pipelineStatus).toBe('no_reply')

    const shifted = res.profiles.find((p) => p.tiktokHandle === 'jerry_wangs')!
    expect(shifted.tiktokUrl).toContain('jerry_wangs')
    expect(shifted.contentCategories).toEqual([])
    expect(res.warnings.some((w) => w.includes('6행'))).toBe(true)
  })
})

describe('fillEmptyInfluencerProfileFields', () => {
  it('빈 칸만 채우고 waiting 상태만 덮어씀', () => {
    const existing = { ...emptyInfluencerProfileFields(), displayName: 'A', contact: 'line: a', pipelineStatus: 'hired' as const }
    const incoming = {
      ...emptyInfluencerProfileFields(),
      displayName: 'B',
      contact: 'line: b',
      tiktokFollowers: 1000,
      pipelineStatus: 'no_reply' as const,
    }
    const patch = fillEmptyInfluencerProfileFields(existing, incoming)
    expect(patch.displayName).toBeUndefined()
    expect(patch.contact).toBeUndefined()
    expect(patch.tiktokFollowers).toBe(1000)
    expect(patch.pipelineStatus).toBeUndefined()
  })
})
